import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
      <Lightbulb aria-hidden="true" className="w-8 h-8 text-accent" />
      <p className="text-sm font-medium text-text-primary">No ideas yet.</p>
      <p className="text-xs">Start the conversation — what should we improve next?</p>
    </div>
  );
}

// Rough first guesses for virtualizer pre-allocation; the real height
// gets measured on mount via `measureElement` so initial scroll position
// settles within ~1 frame.
const ESTIMATED_DATE_PX = 28;
const ESTIMATED_MSG_PX = 76;

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
  const isNearBottomRef = React.useRef(true);
  // Track the message whose row should briefly ring-highlight after a jump.
  // Replaces the previous classList mutation, which assumed the target row
  // was mounted — incompatible with virtualization where off-screen rows
  // don't exist yet.
  const [highlightedId, setHighlightedId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.toLowerCase();
    return messages.filter(
      (m) =>
        m.content.toLowerCase().includes(q) ||
        m.user_display_name.toLowerCase().includes(q),
    );
  }, [messages, search]);

  // O(1) parent-message lookup. Previous version did messages.find() inside
  // the items loop — O(n) per message, O(n²) overall — visible jank around
  // 200+ messages.
  const messagesById = React.useMemo(() => {
    const m = new Map<string, Message>();
    for (const msg of messages) m.set(msg.id, msg);
    return m;
  }, [messages]);

  // O(1) reactions-per-message lookup. Previous version filtered the
  // reactions array inside every rendered MessageItem prop.
  const reactionsByMsgId = React.useMemo(() => {
    const m = new Map<string, Reaction[]>();
    for (const r of reactions) {
      const arr = m.get(r.message_id);
      if (arr) arr.push(r);
      else m.set(r.message_id, [r]);
    }
    return m;
  }, [reactions]);

  type Item =
    | { type: "date"; key: string; label: string }
    | {
        type: "msg";
        key: string;
        msg: Message;
        showHeader: boolean;
        parent: Message | null;
      };

  const items = React.useMemo<Item[]>(() => {
    const out: Item[] = [];
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
      const parent = m.reply_to_id ? messagesById.get(m.reply_to_id) ?? null : null;
      out.push({ type: "msg", key: m.id, msg: m, showHeader, parent });
      prev = m;
    }
    return out;
  }, [filtered, messagesById]);

  const EMPTY_REACTIONS: Reaction[] = React.useMemo(() => [], []);

  // O(1) index lookup so scrollToMessage can hand the virtualizer an index.
  const indexByMsgId = React.useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((it, idx) => {
      if (it.type === "msg") m.set(it.msg.id, idx);
    });
    return m;
  }, [items]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i]?.type === "date" ? ESTIMATED_DATE_PX : ESTIMATED_MSG_PX),
    overscan: 8,
    getItemKey: (i) => items[i]?.key ?? i,
  });

  const scrollToMessage = React.useCallback(
    (id: string) => {
      const idx = indexByMsgId.get(id);
      if (idx == null) return;
      virtualizer.scrollToIndex(idx, { align: "center" });
      setHighlightedId(id);
      window.setTimeout(() => {
        setHighlightedId((cur) => (cur === id ? null : cur));
      }, 1500);
    },
    [indexByMsgId, virtualizer],
  );

  React.useImperativeHandle(ref, () => ({ scrollToMessage }), [scrollToMessage]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // Auto-scroll to newest message if the user was already near the bottom.
  React.useEffect(() => {
    if (items.length === 0) return;
    if (!isNearBottomRef.current) return;
    virtualizer.scrollToIndex(items.length - 1, { align: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on items length change
  }, [items.length]);

  const totalSize = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto ios-scroll px-4 py-3"
    >
      {loading ? (
        <div className="text-text-muted text-sm">Loading messages…</div>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ height: totalSize, position: "relative", width: "100%" }}>
          {virtualItems.map((vi) => {
            const it = items[vi.index];
            if (!it) return null;
            return (
              <div
                key={vi.key}
                ref={virtualizer.measureElement}
                data-index={vi.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                  paddingBottom: 4,
                }}
              >
                {it.type === "date" ? (
                  <div className="flex justify-center my-3">
                    <span className="text-[10px] uppercase tracking-wider font-mono text-text-muted bg-panel-elevated/60 border border-border px-2 py-0.5 rounded-full">
                      {it.label}
                    </span>
                  </div>
                ) : (
                  <div
                    className={
                      highlightedId === it.msg.id
                        ? "ring-2 ring-accent rounded-[3px] transition-shadow"
                        : ""
                    }
                  >
                    <MessageItem
                      msg={it.msg}
                      parent={it.parent}
                      showHeader={it.showHeader}
                      isOwn={it.msg.user_id === currentUserId}
                      currentUserId={currentUserId}
                      reactions={reactionsByMsgId.get(it.msg.id) ?? EMPTY_REACTIONS}
                      readers={getReadersFor(it.msg)}
                      totalOtherAdmins={totalOtherAdmins}
                      displayNameFor={displayNameFor}
                      onReply={() => onReply(it.msg)}
                      onEdit={() => onEdit(it.msg)}
                      onDelete={() => onDelete(it.msg)}
                      onReact={(e) => onReact(it.msg, e)}
                      onJumpTo={(id) => scrollToMessage(id)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
