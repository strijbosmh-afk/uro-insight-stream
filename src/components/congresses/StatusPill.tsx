import * as React from "react";
import { cn } from "@/lib/utils";
import type { Congress } from "@/types";

const STYLES: Record<Congress["status"], string> = {
  live: "bg-success/15 text-success border-success/40",
  upcoming: "bg-warning/15 text-warning border-warning/40",
  archived: "bg-panel-elevated text-text-muted border-border",
};

export function StatusPill({
  status,
  className,
}: {
  status: Congress["status"];
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 h-5 px-1.5 border rounded-[2px]",
        "text-[10px] font-mono font-semibold uppercase tracking-[0.12em]",
        STYLES[status],
        className,
      )}
    >
      {status === "live" && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-success"
          style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
        />
      )}
      {status}
    </span>
  );
}

export default StatusPill;