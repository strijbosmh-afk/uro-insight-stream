import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Lightbulb, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { MessageItem } from "@/components/brainstorm/MessageItem";
import { PresenceList } from "@/components/brainstorm/PresenceList";
import { Composer, type ComposerHandle } from "@/components/brainstorm/Composer";
import {
  type Emoji,
  type Message,
  type Reaction,
  type AdminUser,
  type ReadState,
} from "@/components/brainstorm/types";

export const Route = createFileRoute("/configuration/brainstorm")({
  head: () => ({ meta: [{ title: "Brainstorm — UroFeed" }] }),
  component: BrainstormPage,
});

function BrainstormPage() {
  const { isAdmin, loading, user, profile } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading && !isAdmin) {
      toast.error("Not authorized");
      void navigate({ to: "/dashboard" });
    }
  }, [loading, isAdmin, navigate]);

  if (loading || !isAdmin || !user) {
    return <div className="p-6 text-text-muted text-sm">Loading…</div>;
  }

  return (
    <ChatRoom
      currentUserId={user.id}
      currentDisplayName={profile?.display_name ?? user.email ?? "Admin"}
    />
  );
}

function ChatRoom({
  currentUserId,
  currentDisplayName,
}: {
  currentUserId: string;
  currentDisplayName: string;
}) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [reactions, setReactions] = React.useState<Reaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [replyTo, setReplyTo] = React.useState<Message | null>(null);
  const [editing, setEditing] = React.useState<Message | null>(null);
  const [search, setSearch] = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);
  const [onlineIds, setOnlineIds] = React.useState<Set<string>>(new Set());
  const [admins, setAdmins] = React.useState<AdminUser[]>([]);
  const [readStates, setReadStates] = React.useState<Record<string, ReadState>>({});

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const composerRef = React.useRef<ComposerHandle>(null);
  const presenceRef = React.useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = React.useRef<number | null>(null);
  const messageRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  // Stable, unique suffix per component mount for realtime channel names.
  // Avoids collisions when the same user has multiple tabs open.
  const channelSuffixRef = React.useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );
  const isTabVisibleRef = React.useRef(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );

  // Mark read in DB whenever new messages arrive (and tab is visible)
  const markRead = React.useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const now = new Date().toISOString();
    if (typeof window !== "undefined") {
      localStorage.setItem("brainstorm:lastReadAt", now);
    }
    const { error } = await supabase.from("brainstorm_read_state").upsert(
      {
        user_id: currentUserId,
        last_read_at: now,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      // Non-fatal; receipts will just be slightly stale
      console.warn("Failed to update read state", error.message);
    }
  }, [currentUserId, currentDisplayName]);

  React.useEffect(() => {
    void markRead();
  }, [markRead, messages.length]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      isTabVisibleRef.current = document.visibilityState === "visible";
      if (isTabVisibleRef.current) void markRead();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [markRead]);

  // Initial load
  React.useEffect(() => {
    let cancel = false;
    void (async () => {
      const { data, error } = await supabase
        .from("brainstorm_messages")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(500);
      if (cancel) return;
      if (error) {
        toast.error("Failed to load messages", { description: error.message });
      } else {
        setMessages((data ?? []) as Message[]);
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  // Initial reactions load + realtime subscription
  React.useEffect(() => {
    let cancel = false;
    void (async () => {
      const { data } = await supabase
        .from("brainstorm_message_reactions")
        .select("id, message_id, user_id, emoji, created_at");
      if (cancel || !data) return;
      setReactions(data as Reaction[]);
    })();
    const ch = supabase
      .channel(`brainstorm-reactions-${channelSuffixRef.current}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "brainstorm_message_reactions" },
        (payload) => {
          const r = payload.new as Reaction;
          setReactions((prev) =>
            prev.some((x) => x.id === r.id) ? prev : [...prev, r],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "brainstorm_message_reactions" },
        (payload) => {
          const r = payload.old as Reaction;
          setReactions((prev) => prev.filter((x) => x.id !== r.id));
        },
      )
      .subscribe();
    return () => {
      cancel = true;
      void supabase.removeChannel(ch);
    };
  }, []);

  // Load admin user list (people with access) and keep it in sync with
  // profile changes so renames in the user profile show up immediately.
  const loadAdmins = React.useCallback(async () => {
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (rolesErr) return;
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    if (ids.length === 0) {
      setAdmins([]);
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, email, avatar_url")
      .in("id", ids);
    setAdmins(
      (profs ?? []).sort((a, b) =>
        (a.display_name ?? a.email ?? "").localeCompare(
          b.display_name ?? b.email ?? "",
        ),
      ) as AdminUser[],
    );
  }, []);

  React.useEffect(() => {
    void loadAdmins();
    const ch = supabase
      .channel(`brainstorm-profiles-${channelSuffixRef.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => void loadAdmins(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles" },
        () => void loadAdmins(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [loadAdmins]);

  // Load read states + subscribe
  React.useEffect(() => {
    let cancel = false;
    void (async () => {
      const { data } = await supabase
        .from("brainstorm_read_state")
        .select("user_id, last_read_at");
      if (cancel || !data) return;
      const map: Record<string, ReadState> = {};
      for (const r of data as ReadState[]) map[r.user_id] = r;
      setReadStates(map);
    })();
    const ch = supabase
      .channel(`brainstorm-read-state-${channelSuffixRef.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "brainstorm_read_state" },
        (payload) => {
          const r = (payload.new ?? payload.old) as Partial<ReadState> | null;
          if (!r) return;
          setReadStates((prev) => {
            if (payload.eventType === "DELETE") {
              const uid = r.user_id;
              if (!uid) return prev;
              const { [uid]: _, ...rest } = prev;
              return rest;
            }
            const next = payload.new as ReadState;
            return { ...prev, [next.user_id]: next };
          });
        },
      )
      .subscribe();
    return () => {
      cancel = true;
      void supabase.removeChannel(ch);
    };
  }, []);

  // Realtime subscribe
  React.useEffect(() => {
    const ch = supabase
      .channel(`brainstorm-messages-${channelSuffixRef.current}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "brainstorm_messages" },
        (payload) => {
          const m = payload.new as Message;
          if (m.deleted_at) return;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "brainstorm_messages" },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => {
            if (m.deleted_at) return prev.filter((x) => x.id !== m.id);
            return prev.map((x) => (x.id === m.id ? m : x));
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  // Presence (active admins + typing)
  React.useEffect(() => {
    const ch = supabase.channel(`brainstorm-presence-${channelSuffixRef.current}`, {
      config: { presence: { key: currentUserId } },
    });
    presenceRef.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<
        string,
        Array<{ display_name: string; typing?: boolean }>
      >;
      setOnlineIds(new Set(Object.keys(state)));
      const typing: string[] = [];
      for (const [uid, metas] of Object.entries(state)) {
        if (uid === currentUserId) continue;
        const m = metas[0];
        if (m?.typing) typing.push(m.display_name);
      }
      setTypingUsers(typing);
    });
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ display_name: currentDisplayName, typing: false });
      }
    });
    return () => {
      void supabase.removeChannel(ch);
      presenceRef.current = null;
    };
  }, [currentUserId, currentDisplayName]);

  // Auto-scroll if near bottom
  const isNearBottomRef = React.useRef(true);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const broadcastTyping = (typing: boolean) => {
    const ch = presenceRef.current;
    if (!ch) return;
    void ch.track({ display_name: currentDisplayName, typing });
  };

  const onType = () => {
    broadcastTyping(true);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => broadcastTyping(false), 3000);
  };

  const handleSend = async (content: string): Promise<boolean> => {
    broadcastTyping(false);
    const { data, error } = await supabase
      .from("brainstorm_messages")
      .insert({
        user_id: currentUserId,
        user_display_name: currentDisplayName,
        content,
        reply_to_id: replyTo?.id ?? null,
      })
      .select()
      .single();
    if (error) {
      toast.error("Failed to send", { description: error.message });
      return false;
    }
    if (data) {
      setMessages((prev) =>
        prev.some((x) => x.id === data.id) ? prev : [...prev, data as Message],
      );
      setReplyTo(null);
    }
    return true;
  };

  const handleSaveEdit = async (
    messageId: string,
    content: string,
  ): Promise<boolean> => {
    const original = messages.find((x) => x.id === messageId);
    const snapshotMessages = messages;
    const editedAt = new Date().toISOString();
    // Optimistically apply edit and clear edit state.
    setEditing(null);
    setMessages((prev) =>
      prev.map((x) =>
        x.id === messageId ? { ...x, content, edited_at: editedAt } : x,
      ),
    );
    const { error } = await supabase
      .from("brainstorm_messages")
      .update({ content, edited_at: editedAt })
      .eq("id", messageId);
    if (error) {
      setMessages(snapshotMessages);
      toast.error("Failed to save edit", { description: error.message });
      if (original) setEditing(original);
      return false;
    }
    return true;
  };

  const toggleReaction = async (msg: Message, emoji: Emoji) => {
    const existing = reactions.find(
      (r) => r.message_id === msg.id && r.user_id === currentUserId && r.emoji === emoji,
    );
    if (existing) {
      // Optimistic remove
      const snapshot = reactions;
      setReactions((prev) => prev.filter((x) => x.id !== existing.id));
      const { error } = await supabase
        .from("brainstorm_message_reactions")
        .delete()
        .eq("id", existing.id);
      if (error) {
        setReactions(snapshot);
        toast.error("Reaction failed", { description: error.message });
      }
    } else {
      // Optimistic add with a temp id; realtime will replace it.
      const tempId = `temp-${Math.random().toString(36).slice(2)}`;
      const optimistic: Reaction = {
        id: tempId,
        message_id: msg.id,
        user_id: currentUserId,
        emoji,
        created_at: new Date().toISOString(),
      };
      const snapshot = reactions;
      setReactions((prev) => [...prev, optimistic]);
      const { data, error } = await supabase
        .from("brainstorm_message_reactions")
        .insert({ message_id: msg.id, user_id: currentUserId, emoji })
        .select()
        .single();
      if (error) {
        setReactions(snapshot);
        toast.error("Reaction failed", { description: error.message });
      } else if (data) {
        setReactions((prev) =>
          prev.some((x) => x.id === (data as Reaction).id)
            ? prev.filter((x) => x.id !== tempId)
            : prev.map((x) => (x.id === tempId ? (data as Reaction) : x)),
        );
      }
    }
  };

  const startEdit = (m: Message) => {
    setEditing(m);
    setReplyTo(null);
  };

  const startReply = (m: Message) => {
    setReplyTo(m);
    setEditing(null);
  };

  const doDelete = async (m: Message) => {
    setConfirmDelete(null);
    const snapshot = messages;
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    const { error } = await supabase
      .from("brainstorm_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", m.id);
    if (error) {
      setMessages(snapshot);
      toast.error("Delete failed", { description: error.message });
    }
  };

  const scrollToMessage = (id: string) => {
    const el = messageRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-accent");
    setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 1500);
  };

  const filtered = React.useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.toLowerCase();
    return messages.filter(
      (m) =>
        m.content.toLowerCase().includes(q) ||
        m.user_display_name.toLowerCase().includes(q),
    );
  }, [messages, search]);

  // Group with prev message context
  const items = React.useMemo(() => {
    const out: Array<
      | { type: "date"; key: string; label: string }
      | {
          type: "msg";
          key: string;
          msg: Message;
          showHeader: boolean;
          parent: Message | null;
        }
    > = [];
    let lastDay = "";
    let prev: Message | null = null;
    for (const m of filtered) {
      const day = new Date(m.created_at).toDateString();
      if (day !== lastDay) {
        out.push({ type: "date", key: `d-${day}`, label: dayLabel(m.created_at) });
        lastDay = day;
        prev = null;
      }
      const showHeader =
        !prev ||
        prev.user_id !== m.user_id ||
        new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60_000;
      const parent = m.reply_to_id
        ? messages.find((x) => x.id === m.reply_to_id) ?? null
        : null;
      out.push({ type: "msg", key: m.id, msg: m, showHeader, parent });
      prev = m;
    }
    return out;
  }, [filtered, messages]);

  const getReadersFor = React.useCallback(
    (m: Message): ReadState[] => {
      const created = new Date(m.created_at).getTime();
      const out: ReadState[] = [];
      for (const r of Object.values(readStates)) {
        if (r.user_id === m.user_id) continue;
        if (new Date(r.last_read_at).getTime() >= created) out.push(r);
      }
      return out;
    },
    [readStates],
  );

  // Live name lookup so renames in profiles propagate everywhere in the
  // chatroom (message headers, reply previews, read receipts), even though
  // each row also stores a snapshot of the name at write time.
  const nameById = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of admins) {
      map[a.id] = a.display_name ?? a.email ?? "";
    }
    return map;
  }, [admins]);
  const displayNameFor = React.useCallback(
    (userId: string, fallback: string) => {
      const n = nameById[userId];
      return n && n.trim().length > 0 ? n : fallback;
    },
    [nameById],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-h-0 -m-3 sm:-m-3">
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-panel shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-accent/10 border border-accent/40 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-text-primary">Brainstorm</h1>
                <Badge variant="outline" className="border-success/40 text-success text-[10px]">
                  {onlineIds.size} online
                </Badge>
              </div>
              <p className="text-xs text-text-muted">Discuss improvements with the team</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showSearch && (
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search messages…"
                className="h-8 w-56"
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search messages"
              onClick={() => {
                setShowSearch((v) => !v);
                if (showSearch) setSearch("");
              }}
            >
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
        >
          {loading ? (
            <div className="text-text-muted text-sm">Loading messages…</div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            items.map((it) =>
              it.type === "date" ? (
                <div key={it.key} className="flex justify-center my-3">
                  <span className="text-[10px] uppercase tracking-wider font-mono text-text-muted bg-panel-elevated/60 border border-border px-2 py-0.5 rounded-full">
                    {it.label}
                  </span>
                </div>
              ) : (
                <MessageItem
                  key={it.key}
                  msg={it.msg}
                  parent={it.parent}
                  showHeader={it.showHeader}
                  isOwn={it.msg.user_id === currentUserId}
                  currentUserId={currentUserId}
                  reactions={reactions.filter((r) => r.message_id === it.msg.id)}
                  readers={getReadersFor(it.msg)}
                  totalOtherAdmins={Math.max(admins.length - 1, 0)}
                  displayNameFor={displayNameFor}
                  onReply={() => startReply(it.msg)}
                  onEdit={() => startEdit(it.msg)}
                  onDelete={() => setConfirmDelete(it.msg)}
                  onReact={(e) => toggleReaction(it.msg, e)}
                  onJumpTo={(id) => scrollToMessage(id)}
                  registerRef={(el) => {
                    messageRefs.current[it.msg.id] = el;
                  }}
                />
              ),
            )
          )}
        </div>

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="px-4 py-1 text-xs italic text-text-muted shrink-0">
            {typingUsers.length === 1
              ? `${typingUsers[0]} is typing…`
              : `${typingUsers.length} people are typing…`}
          </div>
        )}

        <Composer
          ref={composerRef}
          replyTo={replyTo}
          editing={editing}
          displayNameFor={displayNameFor}
          onSend={handleSend}
          onSaveEdit={handleSaveEdit}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onType={onType}
        />

        <AlertDialog
          open={!!confirmDelete}
          onOpenChange={(o) => !o && setConfirmDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete message?</AlertDialogTitle>
              <AlertDialogDescription>
                This message will be removed for everyone. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => confirmDelete && void doDelete(confirmDelete)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>

        <PresenceList
          admins={admins}
          onlineIds={onlineIds}
          currentUserId={currentUserId}
        />
      </div>
    </TooltipProvider>
  );
}


function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center text-text-muted gap-2 py-12">
      <Lightbulb className="w-8 h-8 text-accent" />
      <p className="text-sm font-medium text-text-primary">No ideas yet.</p>
      <p className="text-xs">Start the conversation — what should we improve next?</p>
    </div>
  );
}



function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
}
