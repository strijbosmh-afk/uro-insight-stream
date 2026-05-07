import * as React from "react";
import { Send, Smile, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { REACTION_EMOJIS, type Emoji, type Message } from "./types";

export type ComposerHandle = {
  focus: () => void;
};

export const Composer = React.forwardRef<
  ComposerHandle,
  {
    replyTo: Message | null;
    editing: Message | null;
    displayNameFor: (userId: string, fallback: string) => string;
    onSend: (content: string) => Promise<boolean>;
    onSaveEdit: (messageId: string, content: string) => Promise<boolean>;
    onCancelReply: () => void;
    onCancelEdit: () => void;
    onType: () => void;
  }
>(function Composer(
  {
    replyTo,
    editing,
    displayNameFor,
    onSend,
    onSaveEdit,
    onCancelReply,
    onCancelEdit,
    onType,
  },
  ref,
) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  // Sync value when entering / leaving / switching edit mode.
  const editingId = editing?.id ?? null;
  const prevEditingIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const prev = prevEditingIdRef.current;
    if (editingId && editingId !== prev) {
      // Entered edit mode (or switched target) — preload its content.
      setValue(editing!.content);
      setTimeout(() => textareaRef.current?.focus(), 0);
    } else if (!editingId && prev) {
      // Left edit mode externally — clear.
      setValue("");
    }
    prevEditingIdRef.current = editingId;
  }, [editingId, editing]);

  // Focus when reply target appears.
  React.useEffect(() => {
    if (replyTo) setTimeout(() => textareaRef.current?.focus(), 0);
  }, [replyTo]);

  const insertEmoji = (e: Emoji) => {
    const el = textareaRef.current;
    if (!el) {
      setValue((v) => v + e);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = value.slice(0, start) + e + value.slice(end);
    setValue(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + e.length, start + e.length);
    }, 0);
  };

  const submit = async () => {
    const content = value.trim();
    if (!content) return;
    if (editing) {
      const original = editing;
      // Optimistically clear; restore on failure.
      setValue("");
      const ok = await onSaveEdit(original.id, content);
      if (!ok) setValue(content);
      return;
    }
    setValue("");
    const ok = await onSend(content);
    if (!ok) setValue(content);
  };

  const onChange = (v: string) => {
    setValue(v);
    onType();
  };

  return (
    <>
      {(replyTo || editing) && (
        <div className="px-4 py-2 border-t border-border bg-panel-elevated/60 flex items-center justify-between gap-2 shrink-0">
          <div className="text-xs min-w-0">
            <div className="text-text-muted">
              {editing
                ? "Editing message"
                : `Replying to ${
                    replyTo
                      ? displayNameFor(replyTo.user_id, replyTo.user_display_name)
                      : ""
                  }`}
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
              if (editing) onCancelEdit();
              onCancelReply();
            }}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={editing ? "Edit message…" : "Type a message…"}
          rows={1}
          className="flex-1 resize-none min-h-[36px] max-h-[140px]"
        />
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={!value.trim()}
          size="icon"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </>
  );
});