import * as React from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  loading?: boolean;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}

export function Panel({
  title,
  actions,
  children,
  loading = false,
  className,
  bodyClassName,
  noPadding = false,
}: PanelProps) {
  return (
    <section
      className={cn(
        "relative flex flex-col border border-border bg-panel rounded-[4px] overflow-hidden",
        className,
      )}
    >
      {loading && (
        <div className="ray-progress absolute inset-x-0 top-0 h-px bg-border/60 overflow-hidden z-10" />
      )}
      {title !== undefined && (
        <header className="flex items-center justify-between h-9 pl-0 pr-2 border-b border-border bg-panel-elevated/40">
          <div className="flex items-center h-full">
            <span className="block w-[3px] h-full bg-accent" />
            <h2 className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-primary">
              {title}
            </h2>
          </div>
          {actions && <div className="flex items-center gap-1">{actions}</div>}
        </header>
      )}
      <div
        className={cn(
          "flex-1 min-h-0",
          !noPadding && "p-4",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

export default Panel;