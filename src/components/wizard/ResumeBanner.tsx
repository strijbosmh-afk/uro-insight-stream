import { Sparkles, ArrowRight, X } from "lucide-react";

export function ResumeBanner({ onResume, onDismiss }: { onResume: () => void; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between px-4 py-2 mx-3 mt-3"
      style={{
        background: "color-mix(in oklab, var(--accent) 8%, var(--panel))",
        border: "1px solid var(--accent)",
      }}
    >
      <div className="flex items-center gap-2 text-sm">
        <Sparkles aria-hidden="true" className="h-4 w-4 text-accent" />
        <span className="text-text-primary">Finish setting up your account</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onResume}
          className="font-mono text-xs uppercase text-accent hover:underline flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-[2px]"
        >
          Resume <ArrowRight aria-hidden="true" className="h-3 w-3" />
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-[2px] p-0.5"
        >
          <X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
