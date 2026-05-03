import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Panel } from "@/components/shell/Panel";
import { feedService } from "@/services/feedService";
import { feedNowMs } from "./feedClock";
import { useFeedFilters } from "./FeedFilterContext";

const HOURS = 24;
const BUCKETS = 96; // 15-minute buckets across 24h

function buildHistogram(timestamps: number[], windowStartMs: number, windowEndMs: number) {
  const bucketSize = (windowEndMs - windowStartMs) / BUCKETS;
  const buckets = new Array(BUCKETS).fill(0) as number[];
  for (const ms of timestamps) {
    if (ms < windowStartMs || ms > windowEndMs) continue;
    const idx = Math.min(
      BUCKETS - 1,
      Math.max(0, Math.floor((ms - windowStartMs) / bucketSize)),
    );
    buckets[idx] += 1;
  }
  return { buckets, bucketSize };
}

export function TimelineScrubber() {
  const { filters, patch } = useFeedFilters();
  // Defer time labels until after client mount — feedNowMs() returns
  // wall-clock time which differs between SSR render and hydration tick,
  // causing a hydration mismatch on the visible HH:MM strings.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const { data: allTweets = [] } = useQuery({
    queryKey: ["live-tweets"],
    queryFn: () => feedService.listTweets({ limit: 250 }),
  });

  // Window: last 24h of feed-time
  const windowEndMs = feedNowMs();
  const windowStartMs = windowEndMs - HOURS * 60 * 60 * 1000;
  const timestamps = React.useMemo(
    () => allTweets.map((t) => new Date(t.createdAt).getTime()),
    [allTweets],
  );
  const { buckets, bucketSize } = React.useMemo(
    () => buildHistogram(timestamps, windowStartMs, windowEndMs),
    [timestamps, windowStartMs, windowEndMs],
  );
  const max = Math.max(1, ...buckets);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState<{ startX: number; currentX: number } | null>(
    null,
  );

  const xToMs = React.useCallback(
    (x: number, width: number) => {
      const ratio = Math.max(0, Math.min(1, x / width));
      return windowStartMs + ratio * (windowEndMs - windowStartMs);
    },
    [windowStartMs, windowEndMs],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setDrag({ startX: x, currentX: x });
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const rect = containerRef.current!.getBoundingClientRect();
    setDrag({ startX: drag.startX, currentX: e.clientX - rect.left });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const a = Math.min(drag.startX, drag.currentX);
    const b = Math.max(drag.startX, drag.currentX);
    setDrag(null);
    if (b - a < 4) {
      // Treat as a click → clear brush
      patch({ brush: null });
      return;
    }
    const sinceMs = xToMs(a, rect.width);
    const untilMs = xToMs(b, rect.width);
    patch({ brush: { sinceMs, untilMs } });
  };

  // Visual highlight: either active drag or committed brush
  let highlight: { left: number; width: number } | null = null;
  const containerWidth = containerRef.current?.clientWidth ?? 0;
  if (drag && containerWidth) {
    const a = Math.min(drag.startX, drag.currentX);
    const b = Math.max(drag.startX, drag.currentX);
    highlight = { left: a, width: b - a };
  } else if (filters.brush && containerWidth) {
    const totalMs = windowEndMs - windowStartMs;
    const left = ((filters.brush.sinceMs - windowStartMs) / totalMs) * containerWidth;
    const right = ((filters.brush.untilMs - windowStartMs) / totalMs) * containerWidth;
    highlight = { left, width: right - left };
  }

  const fmt = (ms: number) =>
    new Date(ms).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Panel
      title="Timeline · 24h"
      className="h-full"
      bodyClassName="p-3"
      actions={
        filters.brush ? (
          <button
            type="button"
            onClick={() => patch({ brush: null })}
            className="h-6 px-2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-text-muted hover:text-text-primary"
          >
            <X className="w-3 h-3" />
            clear brush
          </button>
        ) : (
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted px-2">
            drag to filter · view · default
          </span>
        )
      }
    >
      <div className="flex items-center gap-3 h-full">
        <span
          className="text-[10px] font-mono text-text-muted whitespace-nowrap min-w-[34px]"
          suppressHydrationWarning
        >
          {mounted ? fmt(windowStartMs) : "—"}
        </span>
        <div
          ref={containerRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="relative flex-1 h-12 cursor-crosshair select-none touch-none"
        >
          {/* Bars */}
          <div className="absolute inset-0 flex items-end gap-px">
            {buckets.map((v, i) => {
              const h = (v / max) * 100;
              return (
                <div
                  key={i}
                  className="flex-1 bg-accent/35 hover:bg-accent/55 rounded-t-[1px]"
                  style={{ height: `${Math.max(2, h)}%` }}
                  title={`${v} posts`}
                />
              );
            })}
          </div>
          {/* Brush */}
          {highlight && (
            <div
              className="absolute top-0 bottom-0 bg-accent/15 border-x border-accent pointer-events-none"
              style={{ left: highlight.left, width: highlight.width }}
            />
          )}
          {/* Now indicator */}
          <span
            className="absolute top-0 bottom-0 right-0 w-px bg-success"
            aria-hidden
          />
        </div>
        <span
          className="text-[10px] font-mono text-text-muted whitespace-nowrap min-w-[34px]"
          suppressHydrationWarning
        >
          {mounted ? fmt(windowEndMs) : "—"}
        </span>
        {mounted && filters.brush && (
          <span className="text-[10px] font-mono text-accent whitespace-nowrap">
            {fmt(filters.brush.sinceMs)}–{fmt(filters.brush.untilMs)}
          </span>
        )}
      </div>
      {/* prevent unused dep warning + force re-render on resize */}
      <span className="hidden">{bucketSize}</span>
    </Panel>
  );
}

export default TimelineScrubber;