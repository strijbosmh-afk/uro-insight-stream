import * as React from "react";
import { cn } from "@/lib/utils";

interface Props {
  parentHandle?: string;
  parentText?: string;
  parentInDbId?: string;
  variant?: "reply" | "quote";
}

/**
 * Inline preview of the tweet a reply or quote is responding to.
 * - Truncated to 2 lines by default; clicking expands to full text.
 * - If parentInDbId is set, the preview is also a navigable link to the
 *   local card via an in-page anchor (#tweet-<id>).
 */
export function ParentPreview({
  parentHandle,
  parentText,
  parentInDbId,
  variant = "reply",
}: Props) {
  const [expanded, setExpanded] = React.useState(false);

  if (!parentHandle && !parentText) return null;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  };

  const handleNavigate = (e: React.MouseEvent) => {
    if (!parentInDbId) return;
    e.stopPropagation();
    e.preventDefault();
    const target = document.getElementById(`tweet-${parentInDbId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("ring-1", "ring-accent");
      window.setTimeout(() => {
        target.classList.remove("ring-1", "ring-accent");
      }, 1500);
    }
  };

  return (
    <div
      onClick={handleToggle}
      className={cn(
        "mt-1.5 border border-border rounded-[3px] px-2 py-1.5 bg-panel-elevated/40 cursor-pointer",
        "hover:border-accent/40 transition-colors",
        variant === "quote" && "ml-1",
      )}
    >
      {parentHandle && (
        <div className="flex items-center gap-1.5">
          {parentInDbId ? (
            <button
              type="button"
              onClick={handleNavigate}
              className="font-mono text-[11px] text-accent hover:underline"
            >
              @{parentHandle}
            </button>
          ) : (
            <span className="font-mono text-[11px] text-accent">
              @{parentHandle}
            </span>
          )}
        </div>
      )}
      {parentText && (
        <p
          className={cn(
            "text-text-muted whitespace-pre-wrap break-words",
            !expanded && "line-clamp-2",
          )}
          style={{
            fontSize: "calc(var(--text-size-tweet) - 1px)",
            lineHeight: "var(--line-height-content)",
          }}
        >
          {parentText}
        </p>
      )}
    </div>
  );
}