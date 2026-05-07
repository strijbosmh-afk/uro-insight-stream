import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp, Pause, Play, RefreshCw, Radio } from "lucide-react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { TweetCard } from "./TweetCard";
import { EmptyState } from "@/components/shell/EmptyState";
import { TweetStreamSkeleton } from "@/components/shell/Skeletons";
import { ThreadDialog } from "./ThreadDialog";
import type { FeedDataset } from "./useFilteredTweets";

const ESTIMATED_ROW_PX = 168;

export function TweetStream({ data }: { data: FeedDataset }) {
  const { tweets, sourcesById, refetchAll, isFetching, lastUpdatedMs } = data;

  const parentRef = React.useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [pendingNew, setPendingNew] = React.useState(0);
  const search = useSearch({ strict: false }) as unknown as { thread?: string };
  const navigate = useNavigate();
  const threadId: string | null = search.thread ?? null;
  const setThreadId = React.useCallback(
    (id: string | null) => {
      navigate({
        to: "/feed",
        search: (prev: Record<string, unknown>) => ({ ...prev, thread: id ?? undefined }),
        replace: false,
      });
    },
    [navigate],
  );

  // Track which tweet IDs have been seen so we can:
  // 1. tag fresh arrivals with `isNew` for the cyan pulse
  // 2. count them while the user is scrolled away from the top
  const seenIdsRef = React.useRef<Set<string>>(new Set());
  const newIdsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (!tweets.length) return;
    const fresh: string[] = [];
    for (const t of tweets) {
      if (!seenIdsRef.current.has(t.id)) {
        seenIdsRef.current.add(t.id);
        fresh.push(t.id);
      }
    }
    if (fresh.length === 0) return;

    // First load: don't pulse or count anything.
    if (seenIdsRef.current.size === fresh.length) return;

    fresh.forEach((id) => newIdsRef.current.add(id));
    // Drop the "new" badge after 3.5s so the animation can play once.
    const t = setTimeout(() => {
      fresh.forEach((id) => newIdsRef.current.delete(id));
    }, 3500);

    // Auto-scroll to top, or surface a "+N new" sticky banner.
    const el = parentRef.current;
    const atTop = !el || el.scrollTop < 80;
    if (autoScroll && atTop) {
      requestAnimationFrame(() => el?.scrollTo({ top: 0, behavior: "smooth" }));
    } else {
      setPendingNew((n) => n + fresh.length);
    }
    return () => clearTimeout(t);
  }, [tweets, autoScroll]);

  const virtualizer = useVirtualizer({
    count: tweets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: 6,
    getItemKey: (i) => tweets[i]?.id ?? i,
  });

  const items = virtualizer.getVirtualItems();

  const scrollTopAndClear = () => {
    parentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setPendingNew(0);
  };

  const lastUpdated =
    lastUpdatedMs > 0
      ? new Date(lastUpdatedMs).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : "—";

  return (
    <Panel
      title={`Stream · ${tweets.length} posts`}
      className="h-full"
      bodyClassName="p-0"
      loading={isFetching}
      actions={
        <>
          <button
            type="button"
            onClick={() => setAutoScroll((v) => !v)}
            className={
              "h-6 px-1.5 inline-flex items-center gap-1 border rounded-[2px] text-[10px] font-mono uppercase tracking-wider " +
              (autoScroll
                ? "border-accent text-accent bg-accent/10"
                : "border-border text-text-muted hover:text-text-primary")
            }
            title={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
          >
            {autoScroll ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            auto
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchAll()}
            className="h-6 px-2 text-[10px] font-mono text-text-muted hover:text-text-primary"
            disabled={isFetching}
          >
            <RefreshCw className={"w-3 h-3 mr-1 " + (isFetching ? "animate-spin" : "")} />
            refresh
          </Button>
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted px-2">
            sync {lastUpdated} · view · default
          </span>
        </>
      }
    >
      <div className="relative h-full">
        {pendingNew > 0 && (
          <button
            type="button"
            onClick={scrollTopAndClear}
            className="absolute z-10 left-1/2 -translate-x-1/2 top-2 inline-flex items-center gap-1.5 h-7 px-3 rounded-full border border-accent bg-accent/15 text-accent text-[11px] font-mono shadow-[0_4px_18px_-6px_color-mix(in_oklab,var(--accent)_60%,transparent)] hover:bg-accent/25 transition-colors"
          >
            <ArrowUp className="w-3 h-3" />+{pendingNew} new
          </button>
        )}

        <div
          ref={parentRef}
          className="absolute inset-0 overflow-auto px-3 py-3"
        >
          {tweets.length === 0 ? (
            isFetching && lastUpdatedMs === 0 ? (
              <TweetStreamSkeleton count={5} />
            ) : (
              <EmptyState
                icon={Radio}
                caption="No tweets yet · Sources/hashtags configured but nothing ingested in this window."
                action={{
                  label: "Refresh",
                  icon: RefreshCw,
                  onClick: () => refetchAll(),
                }}
              />
            )
          ) : (
            <div
              style={{
                height: virtualizer.getTotalSize(),
                position: "relative",
                width: "100%",
              }}
            >
              {items.map((vi) => {
                const t = tweets[vi.index];
                if (!t) return null;
                const prev = vi.index > 0 ? tweets[vi.index - 1] : undefined;
                const next = vi.index < tweets.length - 1 ? tweets[vi.index + 1] : undefined;
                // Self-thread: this tweet replies to the previous tweet from the same author.
                const continuesThread =
                  !!prev &&
                  prev.sourceId === t.sourceId &&
                  !!t.parentInDbId &&
                  t.parentInDbId === prev.id;
                // Next tweet continues from this one in a self-thread.
                const startsThread =
                  !!next &&
                  next.sourceId === t.sourceId &&
                  !!next.parentInDbId &&
                  next.parentInDbId === t.id;
                return (
                  <div
                    key={vi.key}
                    ref={virtualizer.measureElement}
                    data-index={vi.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${vi.start}px)`,
                      paddingBottom: 8,
                    }}
                  >
                    {(continuesThread || startsThread) && (
                      <div
                        aria-hidden
                        className="absolute left-[27px] w-px bg-border"
                        style={{
                          top: continuesThread ? -8 : 36,
                          bottom: startsThread ? 0 : "auto",
                          height: startsThread && !continuesThread ? "calc(100% - 36px)" : undefined,
                        }}
                      />
                    )}
                    <TweetCard
                      tweet={t}
                      source={sourcesById[t.sourceId]}
                      isNew={newIdsRef.current.has(t.id)}
                      onOpenThread={setThreadId}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <ThreadDialog
        tweetId={threadId}
        sourcesById={sourcesById}
        onClose={() => setThreadId(null)}
      />
    </Panel>
  );
}

export default TweetStream;