import * as React from "react";
import { Reply } from "lucide-react";
import { ComposeTweetDialog, type ReplyContext } from "./ComposeTweetDialog";

interface Props {
  reply: ReplyContext;
  className?: string;
}

export function ReplyButton({ reply, className }: Props) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Reply on X"
        className={
          "flex items-center gap-1 text-text-muted hover:text-accent transition-colors " +
          (className ?? "")
        }
      >
        <Reply className="w-3 h-3" />
        <span className="hidden sm:inline">Reply</span>
      </button>
      <ComposeTweetDialog open={open} onOpenChange={setOpen} reply={reply} />
    </>
  );
}

export default ReplyButton;