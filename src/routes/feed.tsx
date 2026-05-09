import { createFileRoute } from "@tanstack/react-router";
import { FeedFilterProvider } from "@/components/feed/FeedFilterContext";
import { FilterBar } from "@/components/feed/FilterBar";
import { TweetStream } from "@/components/feed/TweetStream";
import { LiveSignals } from "@/components/feed/LiveSignals";
import { TimelineScrubber } from "@/components/feed/TimelineScrubber";
import { useFilteredTweets } from "@/components/feed/useFilteredTweets";
import { InlineComposer } from "@/components/x/InlineComposer";

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
  const data = useFilteredTweets(30_000);
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