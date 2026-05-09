import * as React from "react";
import { Quote } from "lucide-react";
import { ComposeTweetDialog } from "./ComposeTweetDialog";

interface Props {
  tweetUrl: string;
  className?: string;
}

/**
 * Quote-tweet button. Opens compose pre-filled with two newlines and the
 * tweet URL appended — X auto-embeds the quoted post when the URL is in
 * the tweet body.
 */
export function QuoteButton({ tweetUrl, className }: Props) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Quote on X"
        className={
          "flex items-center gap-1 text-text-muted hover:text-accent transition-colors " +
          (className ?? "")
        }
      >
        <Quote className="w-3 h-3" />
        <span className="hidden sm:inline">Quote</span>
      </button>
      <ComposeTweetDialog
        open={open}
        onOpenChange={setOpen}
        initialText={`\n\n${tweetUrl}`}
      />
    </>
  );
}

export default QuoteButton;