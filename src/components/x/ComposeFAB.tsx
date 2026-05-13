import * as React from "react";
import { Plus } from "lucide-react";
import { ComposeTweetDialog } from "./ComposeTweetDialog";

/**
 * Floating compose button anchored above the mobile bottom tab bar.
 * Tap → open compose dialog.
 * Long-press (500ms) → open dialog and auto-fire AI suggest.
 */
export function ComposeFAB() {
  const [open, setOpen] = React.useState(false);
  const [aiTrigger, setAiTrigger] = React.useState(false);
  const [pressing, setPressing] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredLongPressRef = React.useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startPress = () => {
    triggeredLongPressRef.current = false;
    clearTimer();
    setPressing(true);
    timerRef.current = setTimeout(() => {
      triggeredLongPressRef.current = true;
      try {
        navigator.vibrate?.(10);
      } catch {
        /* noop */
      }
      setPressing(false);
      setAiTrigger(true);
      setOpen(true);
    }, 500);
  };

  const endPress = () => {
    setPressing(false);
    if (!timerRef.current && !triggeredLongPressRef.current) return;
    const wasLong = triggeredLongPressRef.current;
    clearTimer();
    if (!wasLong) {
      setAiTrigger(false);
      setOpen(true);
    }
  };

  const cancelPress = () => {
    clearTimer();
    setPressing(false);
    triggeredLongPressRef.current = false;
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Compose"
          title="Compose"
          onTouchStart={startPress}
          onTouchEnd={endPress}
          onTouchCancel={cancelPress}
          onMouseDown={startPress}
          onMouseUp={endPress}
          onMouseLeave={cancelPress}
          onContextMenu={(e) => e.preventDefault()}
          className="
            group fixed z-30 right-4
            h-14 w-14 rounded-full
            bg-accent text-accent-foreground
            shadow-lg shadow-black/30
            flex items-center justify-center
            active:scale-95 transition-transform
          "
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
          }}
        >
          {/* Long-press progress ring (500ms) */}
          <span
            aria-hidden
            className={
              "pointer-events-none absolute inset-0 rounded-full border-2 border-accent-foreground/70 transition-transform duration-500 ease-out " +
              (pressing ? "scale-110 opacity-100" : "scale-100 opacity-0")
            }
          />
          <Plus
            className={
              "w-6 h-6 transition-transform duration-500 ease-out " +
              (pressing ? "rotate-90 scale-90" : "")
            }
          />
        </button>
      )}
      <ComposeTweetDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setAiTrigger(false);
        }}
        triggerAiSuggest={aiTrigger}
      />
    </>
  );
}

export default ComposeFAB;