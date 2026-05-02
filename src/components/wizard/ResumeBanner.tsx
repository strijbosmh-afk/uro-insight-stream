import { Sparkles, ArrowRight, X } from "lucide-react";

export function ResumeBanner({ onResume, onDismiss }: { onResume: () => void; onDismiss: () => void }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2 mx-3 mt-3"
      style={{
        background: "color-mix(in oklab, var(--accent) 8%, var(--panel))",
        border: "1px solid var(--accent)",
      }}
    >
      <div className="flex items-center gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="text-text-primary">Finish setting up your account</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onResume}
          className="font-mono text-xs uppercase text-accent hover:underline flex items-center gap-1"
        >
          Resume <ArrowRight className="h-3 w-3" />
        </button>
        <button onClick={onDismiss} className="text-text-muted hover:text-text-primary">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}