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
        aria-label="Quote on X"
        className={
          "min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center sm:justify-start gap-1 text-text-muted hover:text-accent transition-colors " +
          (className ?? "")
        }
      >
        <Quote className="w-4 h-4 sm:w-3 sm:h-3" />
        <span className="hidden sm:inline">Quote</span>
      </button>
      <ComposeTweetDialog
        open={open}
        onOpenChange={setOpen}
        initialText={`${tweetUrl}\n\n`}
      />
    </>
  );
}

export default QuoteButton;