import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Panel-shaped skeletons. These mimic the actual layout of the row/card
 * they replace — no generic shimmer rectangles. The shimmer tone is the
 * same `bg-panel-elevated` used by real rows so the swap doesn't shift
 * brightness.
 */

function Bar({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={style}
      className={cn(
        "block rounded-[2px] bg-panel-elevated/70 animate-pulse",
        className,
      )}
    />
  );
}

/** Tweet card skeleton — avatar + 2 text lines + engagement counters. */
export function TweetCardSkeleton() {
  return (
    <div className="border border-border bg-panel rounded-[3px] p-3">
      <div className="flex gap-3">
        <Bar className="w-9 h-9 rounded-[3px] flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <Bar className="h-3 w-20" />
            <Bar className="h-3 w-32" />
            <Bar className="h-3 w-10 ml-auto" />
          </div>
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-[88%]" />
          <div className="mt-2 flex items-center gap-4">
            <Bar className="h-2.5 w-8" />
            <Bar className="h-2.5 w-8" />
            <Bar className="h-2.5 w-8" />
            <Bar className="h-2.5 w-12 ml-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TweetStreamSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: count }).map((_, i) => (
        <TweetCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Summary panel skeleton — bullets + 2 quote blocks. */
export function SummarySkeleton({ bullets = 5 }: { bullets?: number }) {
  return (
    <div className="space-y-3">
      <div className="border border-border rounded-[3px] p-3 bg-panel-elevated/20">
        <Bar className="h-2.5 w-24 mb-3" />
        <ul className="space-y-2">
          {Array.from({ length: bullets }).map((_, i) => (
            <li key={i} className="flex gap-2">
              <Bar className="h-3 w-5 mt-0.5 shrink-0" />
              <Bar className="h-3 flex-1" style={{ maxWidth: `${85 - i * 6}%` }} />
            </li>
          ))}
        </ul>
      </div>
      <div className="border border-border rounded-[3px] p-3 bg-panel-elevated/20 space-y-2">
        <Bar className="h-2.5 w-28 mb-1" />
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-2.5 p-2 border border-border rounded-[2px]">
            <Bar className="w-7 h-7 rounded-[2px] shrink-0" />
            <div className="flex-1 space-y-1">
              <Bar className="h-2.5 w-24" />
              <Bar className="h-3 w-full" />
              <Bar className="h-3 w-[80%]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Session row skeleton — matches mock card layout. */
export function SessionRowSkeleton() {
  return (
    <div className="border border-border rounded-[3px] p-3 bg-panel">
      <div className="flex items-center gap-2 mb-1.5">
        <Bar className="h-2 w-12" />
        <Bar className="h-2 w-16" />
        <Bar className="h-2 w-14 ml-auto" />
      </div>
      <Bar className="h-3.5 w-[78%] mb-1" />
      <Bar className="h-3.5 w-[55%] mb-2" />
      <div className="pt-2 border-t border-border flex items-center justify-between">
        <Bar className="h-2.5 w-20" />
        <Bar className="h-2.5 w-14" />
      </div>
    </div>
  );
}

/** Generic table row skeleton — N cells of varying width. */
export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  // Deterministic widths so rows look "tabular", not random.
  const widths = ["80%", "60%", "40%", "30%", "50%", "45%", "35%", "25%", "55%", "40%"];
  return (
    <tr className="border-t border-border">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <Bar className="h-3" style={{ width: widths[i % widths.length] }} />
        </td>
      ))}
    </tr>
  );
}

/** Card grid skeleton — used for Congresses. */
export function CardSkeleton() {
  return (
    <div className="border border-border rounded-[3px] p-3 bg-panel space-y-2">
      <div className="flex items-center justify-between">
        <Bar className="h-3 w-20" />
        <Bar className="h-2.5 w-12" />
      </div>
      <Bar className="h-4 w-[75%]" />
      <Bar className="h-3 w-[55%]" />
      <div className="pt-2 border-t border-border flex items-center justify-between">
        <Bar className="h-2.5 w-16" />
        <Bar className="h-2.5 w-14" />
        <Bar className="h-2.5 w-12" />
      </div>
    </div>
  );
}

// Exported alias for consumers that want a primitive bar.
export function SkelBar({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={style}
      className={cn(
        "block rounded-[2px] bg-panel-elevated/70 animate-pulse",
        className,
      )}
    />
  );
}