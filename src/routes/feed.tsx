import { createFileRoute } from "@tanstack/react-router";
import { FeedFilterProvider } from "@/components/feed/FeedFilterContext";
import { FilterBar } from "@/components/feed/FilterBar";
import { TweetStream } from "@/components/feed/TweetStream";
import { LiveSignals } from "@/components/feed/LiveSignals";
import { TimelineScrubber } from "@/components/feed/TimelineScrubber";
import { useFilteredTweets, type FeedDataset } from "@/components/feed/useFilteredTweets";
import { InlineComposer } from "@/components/x/InlineComposer";
import { MobileFeedLayout } from "@/components/feed/MobileFeedLayout";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/feed")({
  head: () => ({ meta: [{ title: "Live Feed — UroFeed" }] }),
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
  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="border border-border rounded-[4px] bg-panel overflow-hidden">
        <FilterBar />
      </div>
      <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">
        <div className="col-span-12 xl:col-span-9 min-h-0 flex flex-col gap-3">
          <InlineComposer />
          <div className="flex-1 min-h-0">
            <TweetStream data={data} />
          </div>
        </div>
        <div className="col-span-12 xl:col-span-3 min-h-0">
          <LiveSignals tweets={data.tweets} sourcesById={data.sourcesById} />
        </div>
      </div>
      <div className="h-[120px] shrink-0">
        <TimelineScrubber />
      </div>
    </div>
  );
}