import * as React from "react";
import { Lightbulb } from "lucide-react";
import { MessageItem } from "./MessageItem";
import { type Emoji, type Message, type Reaction, type ReadState } from "./types";

export type MessageListHandle = {
  scrollToMessage: (id: string) => void;
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });
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

export const MessageList = React.forwardRef<
  MessageListHandle,
  {
    messages: Message[];
    reactions: Reaction[];
    search: string;
    loading: boolean;
    currentUserId: string;
    totalOtherAdmins: number;
    getReadersFor: (m: Message) => ReadState[];
    displayNameFor: (userId: string, fallback: string) => string;
    onReply: (m: Message) => void;
    onEdit: (m: Message) => void;
    onDelete: (m: Message) => void;
    onReact: (m: Message, e: Emoji) => void;
  }
>(function MessageList(
  {
    messages,
    reactions,
    search,
    loading,
    currentUserId,
    totalOtherAdmins,
    getReadersFor,
    displayNameFor,
    onReply,
    onEdit,
    onDelete,
    onReact,
  },
  ref,
) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const messageRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const isNearBottomRef = React.useRef(true);

  const scrollToMessage = React.useCallback((id: string) => {
    const el = messageRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-accent");
    setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 1500);
  }, []);

  React.useImperativeHandle(ref, () => ({ scrollToMessage }), [scrollToMessage]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // Auto-scroll if near bottom
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.toLowerCase();
    return messages.filter(
      (m) =>
        m.content.toLowerCase().includes(q) ||
        m.user_display_name.toLowerCase().includes(q),
    );
  }, [messages, search]);

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
              totalOtherAdmins={totalOtherAdmins}
              displayNameFor={displayNameFor}
              onReply={() => onReply(it.msg)}
              onEdit={() => onEdit(it.msg)}
              onDelete={() => onDelete(it.msg)}
              onReact={(e) => onReact(it.msg, e)}
              onJumpTo={(id) => scrollToMessage(id)}
              registerRef={(el) => {
                messageRefs.current[it.msg.id] = el;
              }}
            />
          ),
        )
      )}
    </div>
  );
});