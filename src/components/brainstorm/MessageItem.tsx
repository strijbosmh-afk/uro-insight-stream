import * as React from "react";
import { Smile, Reply, Pencil, Trash2, Check, CheckCheck } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ReactionsBar } from "./ReactionsBar";
import {
  REACTION_EMOJIS,
  type Emoji,
  type Message,
  type Reaction,
  type ReadState,
} from "./types";

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

export function MessageItem({
  msg,
  parent,
  showHeader,
  isOwn,
  currentUserId,
  reactions,
  readers,
  totalOtherAdmins,
  displayNameFor,
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
  reactions: Reaction[];
  readers: ReadState[];
  totalOtherAdmins: number;
  displayNameFor: (userId: string, fallback: string) => string;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (e: Emoji) => void;
  onJumpTo: (id: string) => void;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const allRead = totalOtherAdmins > 0 && readers.length >= totalOtherAdmins;
  const someRead = readers.length > 0;
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
            {displayNameFor(msg.user_id, msg.user_display_name)}
          </div>
        )}
        {parent && (
          <button
            type="button"
            onClick={() => onJumpTo(parent.id)}
            className="block w-full text-left mb-1 px-2 py-1 rounded border-l-2 border-accent/60 bg-panel/60 hover:bg-panel"
          >
            <div className="text-[10px] font-semibold text-accent">
              {displayNameFor(parent.user_id, parent.user_display_name)}
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
          {isOwn && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 ml-1",
                    allRead ? "text-accent" : someRead ? "text-text-primary" : "text-text-muted/60",
                  )}
                  aria-label={
                    someRead
                      ? `Read by ${readers.length} of ${totalOtherAdmins}`
                      : "Sent"
                  }
                >
                  {someRead ? (
                    <CheckCheck className="w-3 h-3" />
                  ) : (
                    <Check className="w-3 h-3" />
                  )}
                  {totalOtherAdmins > 0 && (
                    <span>
                      {readers.length}/{totalOtherAdmins}
                    </span>
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent side="left">
                <div className="text-xs max-w-[220px]">
                  {someRead ? (
                    <>
                      <div className="font-semibold mb-0.5">Read by</div>
                      <div className="space-y-0.5">
                        {readers.map((r) => (
                          <div key={r.user_id}>
                            {displayNameFor(r.user_id, "Unknown user")}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <span>Delivered. No one has read this yet.</span>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
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

      <ReactionsBar
        reactions={reactions}
        currentUserId={currentUserId}
        isOwn={isOwn}
        onReact={onReact}
      />
    </div>
  );
}