import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  /** Mono caption — e.g. "No sources yet · Add the first urology account you want to follow". */
  caption: React.ReactNode;
  /** Accent action button. */
  action?: {
    label: string;
    onClick?: () => void;
    icon?: LucideIcon;
    href?: string;
    disabled?: boolean;
    title?: string;
  };
  /** Optional secondary text-only action. */
  secondary?: { label: string; onClick: () => void };
  className?: string;
  compact?: boolean;
}

/**
 * RayStation-style empty state — 1px border panel, small lucide icon,
 * mono caption, accent action button. Used for every list when it has no
 * rows. Not a consumer-app illustration.
 */
export function EmptyState({
  icon: Icon,
  caption,
  action,
  secondary,
  className,
  compact = false,
}: EmptyStateProps) {
  const ActionIcon = action?.icon;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center border border-dashed border-border rounded-[3px] bg-panel-elevated/20",
        compact ? "py-6 px-4 gap-2" : "py-10 px-6 gap-3",
        className,
      )}
      role="status"
    >
      <div className="w-9 h-9 rounded-[3px] border border-border bg-panel flex items-center justify-center">
        <Icon className="w-4 h-4 text-text-muted" aria-hidden="true" />
      </div>
      <p
        className={cn(
          "font-mono text-text-muted leading-relaxed max-w-md",
          compact ? "text-[11px]" : "text-[12px]",
        )}
      >
        {caption}
      </p>
      {(action || secondary) && (
        <div className="flex items-center gap-2 mt-1">
          {action &&
            (action.href ? (
              <a
                href={action.href}
                onClick={action.onClick}
                className="inline-flex items-center gap-1.5 h-8 px-3 border border-accent text-accent bg-accent/10 hover:bg-accent/20 rounded-[3px] text-[12px] font-mono uppercase tracking-wider transition-colors"
                title={action.title}
              >
                {ActionIcon && <ActionIcon className="w-3.5 h-3.5" aria-hidden="true" />}
                {action.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                title={action.title}
                className="inline-flex items-center gap-1.5 h-8 px-3 border border-accent text-accent bg-accent/10 hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-[3px] text-[12px] font-mono uppercase tracking-wider transition-colors"
              >
                {ActionIcon && <ActionIcon className="w-3.5 h-3.5" aria-hidden="true" />}
                {action.label}
              </button>
            ))}
          {secondary && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="text-[11px] font-mono uppercase tracking-wider text-text-muted hover:text-accent transition-colors"
            >
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default EmptyState;