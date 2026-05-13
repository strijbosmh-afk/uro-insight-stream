import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import { FeedFilterProvider } from "@/components/feed/FeedFilterContext";
import { FilterBar } from "@/components/feed/FilterBar";
import { TweetStream } from "@/components/feed/TweetStream";
import { TimelineScrubber } from "@/components/feed/TimelineScrubber";
import { useFilteredTweets, type FeedDataset } from "@/components/feed/useFilteredTweets";
import { InlineComposer } from "@/components/x/InlineComposer";
import { MobileFeedLayout } from "@/components/feed/MobileFeedLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/feed")({
  head: () =>
    buildSeoHead({
      title: "Live Feed",
      description:
        "Real-time stream of urology posts from the people you follow, with timeline scrubber, filters and inline replies.",
      path: "/feed",
    }),
  validateSearch: (search: Record<string, unknown>): { thread?: string } => ({
    thread: typeof search.thread === "string" ? (search.thread as string) : undefined,
  }),
  component: FeedPage,
});

function FeedPage() {
  return (
    <FeedFilterProvider>
      <FeedLayout />
    </FeedFilterProvider>
  );
}

function FeedLayout() {
  const isMobile = useIsMobile();
  const data = useFilteredTweets(30_000);
  if (isMobile) return <MobileFeedLayout data={data} />;
  return <DesktopFeedLayout data={data} />;
}

function DesktopFeedLayout({ data }: { data: FeedDataset }) {
  const [timelineOpen, setTimelineOpen] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("feed:timelineOpen") === "1";
  });
  const toggleTimeline = () => {
    setTimelineOpen((v) => {
      const next = !v;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("feed:timelineOpen", next ? "1" : "0");
      }
      return next;
    });
  };
  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="border border-border rounded-[4px] bg-panel overflow-hidden">
        <FilterBar />
      </div>
      <div className="flex-1 min-h-0 flex flex-col gap-3">
        <InlineComposer />
        <div className="flex-1 min-h-0">
          <TweetStream data={data} />
        </div>
      </div>
      <div className="shrink-0">
        {timelineOpen ? (
          <div className="relative h-[120px]">
            <TimelineScrubber />
            <button
              type="button"
              onClick={toggleTimeline}
              aria-label="Hide timeline"
              className="absolute top-2 right-2 z-10 h-6 px-2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-text-muted hover:text-text-primary border border-border rounded-[3px] bg-panel"
            >
              <ChevronDown className="w-3 h-3" />
              hide
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={toggleTimeline}
            className="w-full h-8 px-3 flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-text-muted hover:text-text-primary border border-border rounded-[4px] bg-panel"
          >
            <span className="inline-flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              timeline · 24h
            </span>
            <span className="inline-flex items-center gap-1">
              <ChevronUp className="w-3 h-3" />
              show
            </span>
          </button>
        )}
      </div>
    </div>
  );
}