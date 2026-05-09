import * as React from "react";
import { Send } from "lucide-react";
import { ComposeTweetDialog } from "./ComposeTweetDialog";

/**
 * Primary "Share to X" CTA used in the TopBar.
 * - sm+: compact pill with label "Share to X"
 * - mobile: 40px icon-only button
 */
export function ShareToXButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Share to X"
        aria-label="Share to X"
        className="
          shrink-0 inline-flex items-center justify-center gap-1.5 rounded-[3px]
          bg-accent text-accent-foreground hover:bg-accent/90 transition-colors
          h-10 w-10 sm:h-9 sm:w-auto sm:px-3 sm:min-w-[110px]
          text-[12px] font-medium
          shadow-[0_1px_0_rgba(0,0,0,0.12)]
        "
      >
        <Send className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        <span className="hidden sm:inline">Share to X</span>
      </button>
      <ComposeTweetDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default ShareToXButton;