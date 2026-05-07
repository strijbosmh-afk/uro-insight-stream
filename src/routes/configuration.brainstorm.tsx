import * as React from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Lightbulb, Send, Smile, X, Reply, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉", "🚀", "💡"] as const;
type Emoji = (typeof REACTION_EMOJIS)[number];

type Message = {
  id: string;
  user_id: string;
  user_display_name: string;
  content: string;
  reply_to_id: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

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
  const [loading, setLoading] = React.useState(true);
  const [input, setInput] = React.useState("");
  const [replyTo, setReplyTo] = React.useState<Message | null>(null);
  const [editing, setEditing] = React.useState<Message | null>(null);
  const [search, setSearch] = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);
  const [activeAdmins, setActiveAdmins] = React.useState(0);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const presenceRef = React.useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = React.useRef<number | null>(null);
  const messageRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  // Mark read on mount/unmount
  React.useEffect(() => {
    const stamp = () => {
      if (typeof window !== "undefined") {
        localStorage.setItem("brainstorm:lastReadAt", new Date().toISOString());
      }
    };
    stamp();
    return stamp;
  }, [messages.length]);

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

  // Realtime subscribe
  React.useEffect(() => {
    const ch = supabase
      .channel("brainstorm-messages")
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
    const ch = supabase.channel("brainstorm-presence", {
      config: { presence: { key: currentUserId } },
    });
    presenceRef.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<
        string,
        Array<{ display_name: string; typing?: boolean }>
      >;
      setActiveAdmins(Object.keys(state).length);
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

  const onInputChange = (v: string) => {
    setInput(v);
    broadcastTyping(true);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => broadcastTyping(false), 3000);
  };

  const send = async () => {
    const content = input.trim();
    if (!content) return;
    if (editing) {
      const original = editing;
      setEditing(null);
      setInput("");
      const { error } = await supabase
        .from("brainstorm_messages")
        .update({ content, edited_at: new Date().toISOString() })
        .eq("id", original.id);
      if (error) {
        toast.error("Failed to save edit", { description: error.message });
        setEditing(original);
        setInput(content);
      }
      return;
    }
    const tempInput = input;
    setInput("");
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
      setInput(tempInput);
    } else if (data) {
      setMessages((prev) =>
        prev.some((x) => x.id === data.id) ? prev : [...prev, data as Message],
      );
      setReplyTo(null);
    }
  };

  const toggleReaction = async (msg: Message, emoji: Emoji) => {
    const next: Record<string, string[]> = { ...(msg.reactions ?? {}) };
    const arr = next[emoji] ? [...next[emoji]] : [];
    const idx = arr.indexOf(currentUserId);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(currentUserId);
    if (arr.length === 0) delete next[emoji];
    else next[emoji] = arr;
    // Optimistic
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, reactions: next } : m)));
    const { error } = await supabase
      .from("brainstorm_messages")
      .update({ reactions: next })
      .eq("id", msg.id);
    if (error) toast.error("Reaction failed", { description: error.message });
  };

  const startEdit = (m: Message) => {
    setEditing(m);
    setReplyTo(null);
    setInput(m.content);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const startReply = (m: Message) => {
    setReplyTo(m);
    setEditing(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const doDelete = async (m: Message) => {
    setConfirmDelete(null);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    const { error } = await supabase
      .from("brainstorm_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", m.id);
    if (error) toast.error("Delete failed", { description: error.message });
  };

  const insertEmoji = (e: Emoji) => {
    const el = textareaRef.current;
    if (!el) {
      setInput((v) => v + e);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = input.slice(0, start) + e + input.slice(end);
    setInput(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + e.length, start + e.length);
    }, 0);
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

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-[calc(100vh-3rem)]">
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
                  {activeAdmins} active
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
                <MessageBubble
                  key={it.key}
                  msg={it.msg}
                  parent={it.parent}
                  showHeader={it.showHeader}
                  isOwn={it.msg.user_id === currentUserId}
                  currentUserId={currentUserId}
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

        {/* Reply / Edit context bar */}
        {(replyTo || editing) && (
          <div className="px-4 py-2 border-t border-border bg-panel-elevated/60 flex items-center justify-between gap-2 shrink-0">
            <div className="text-xs min-w-0">
              <div className="text-text-muted">
                {editing ? "Editing message" : `Replying to ${replyTo?.user_display_name}`}
              </div>
              <div className="text-text-primary truncate">
                {(editing ?? replyTo)?.content}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cancel"
              onClick={() => {
                if (editing) {
                  setEditing(null);
                  setInput("");
                }
                setReplyTo(null);
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border bg-panel p-3 flex items-end gap-2 shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Insert emoji">
                <Smile className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" side="top" align="start">
              <div className="grid grid-cols-4 gap-1">
                {REACTION_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => insertEmoji(e)}
                    className="text-xl w-9 h-9 rounded hover:bg-panel-elevated"
                    aria-label={`Insert ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={editing ? "Edit message…" : "Type a message…"}
            rows={1}
            className="flex-1 resize-none min-h-[36px] max-h-[140px]"
          />
          <Button
            type="button"
            onClick={() => void send()}
            disabled={!input.trim()}
            size="icon"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>

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

function MessageBubble({
  msg,
  parent,
  showHeader,
  isOwn,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onJumpTo,
  registerRef,
}: {
  msg: Message;
  parent: Message | null;
  showHeader: boolean;
  isOwn: boolean;
  currentUserId: string;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (e: Emoji) => void;
  onJumpTo: (id: string) => void;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const reactionEntries = Object.entries(msg.reactions ?? {}).filter(
    ([, ids]) => ids.length > 0,
  );
  return (
    <div
      ref={registerRef}
      className={cn(
        "group flex flex-col rounded-md transition-shadow",
        isOwn ? "items-end" : "items-start",
        showHeader ? "mt-3" : "mt-0.5",
      )}
      style={{ animation: "fade-in 150ms ease-out" }}
    >
      <div
        className={cn(
          "relative max-w-[78%] sm:max-w-[60%] rounded-2xl px-3 py-2 shadow-sm",
          isOwn
            ? "bg-accent/15 border border-accent/30 rounded-br-sm"
            : "bg-panel-elevated border border-border rounded-bl-sm",
        )}
      >
        {showHeader && !isOwn && (
          <div className="text-[11px] font-semibold text-accent mb-0.5">
            {msg.user_display_name}
          </div>
        )}
        {parent && (
          <button
            type="button"
            onClick={() => onJumpTo(parent.id)}
            className="block w-full text-left mb-1 px-2 py-1 rounded border-l-2 border-accent/60 bg-panel/60 hover:bg-panel"
          >
            <div className="text-[10px] font-semibold text-accent">
              {parent.user_display_name}
            </div>
            <div className="text-[11px] text-text-muted truncate">
              {parent.content}
            </div>
          </button>
        )}
        <div className="text-sm whitespace-pre-wrap break-words text-text-primary">
          {msg.content}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-text-muted">
          <span>{relativeTime(msg.created_at)}</span>
          {msg.edited_at && <span className="italic">edited</span>}
        </div>

        {/* Action toolbar */}
        <div
          className={cn(
            "absolute -top-3 flex items-center gap-0.5 bg-panel border border-border rounded-md shadow-sm opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity",
            isOwn ? "right-2" : "left-2",
          )}
        >
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Add reaction"
                className="p-1 hover:bg-panel-elevated rounded"
              >
                <Smile className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-1" side="top">
              <div className="flex gap-0.5">
                {REACTION_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => onReact(e)}
                    className="text-lg w-7 h-7 rounded hover:bg-panel-elevated"
                    aria-label={`React ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={onReply}
            aria-label="Reply"
            className="p-1 hover:bg-panel-elevated rounded"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>
          {isOwn && (
            <>
              <button
                type="button"
                onClick={onEdit}
                aria-label="Edit"
                className="p-1 hover:bg-panel-elevated rounded"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label="Delete"
                className="p-1 hover:bg-panel-elevated rounded text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {reactionEntries.length > 0 && (
        <div className={cn("flex flex-wrap gap-1 mt-1", isOwn ? "justify-end" : "")}>
          {reactionEntries.map(([emoji, ids]) => {
            const mine = ids.includes(currentUserId);
            return (
              <Tooltip key={emoji}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onReact(emoji as Emoji)}
                    className={cn(
                      "text-[11px] px-1.5 py-0.5 rounded-full border flex items-center gap-1 transition-colors",
                      mine
                        ? "border-accent/60 bg-accent/15 text-text-primary"
                        : "border-border bg-panel-elevated/60 text-text-muted hover:text-text-primary",
                    )}
                  >
                    <span>{emoji}</span>
                    <span>{ids.length}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">{ids.length} reactor(s)</div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = d.toDateString() === today.toDateString();
  const wasYest = d.toDateString() === yest.toDateString();
  if (sameDay) return `${h}h ago`;
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (wasYest) return `yesterday at ${time}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
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
