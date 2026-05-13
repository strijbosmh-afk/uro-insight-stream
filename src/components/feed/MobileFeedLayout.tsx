import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { PenSquare, SlidersHorizontal, X } from "lucide-react";
import { Sparkles } from "lucide-react";
import { AskUroFeedDialog } from "@/components/ask/AskUroFeedDialog";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { feedService } from "@/services/feedService";
import { ComposeTweetDialog } from "@/components/x/ComposeTweetDialog";
import { TweetStream } from "./TweetStream";
import { FilterBar } from "./FilterBar";
import { useFeedFilters } from "./FeedFilterContext";
import type { FeedDataset } from "./useFilteredTweets";

export function MobileFeedLayout({ data }: { data: FeedDataset }) {
  const { filters, patch } = useFeedFilters();
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [todayOpen, setTodayOpen] = React.useState(false);
  const [askOpen, setAskOpen] = React.useState(false);

  const { data: congresses = [] } = useQuery({
    queryKey: ["congresses"],
    queryFn: () => feedService.listCongresses(),
  });
  const { data: summaries = [] } = useQuery({
    queryKey: ["summaries"],
    queryFn: () => feedService.listSummaries(),
  });

  const activeCongress = filters.congressId
    ? congresses.find((c) => c.id === filters.congressId)
    : null;
  const liveCongresses = congresses.filter((c) => c.status === "live");

  const todayStart = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const dayAgo = Date.now() - 24 * 3600 * 1000;

  const todaySummaries = summaries.filter(
    (s) => new Date(s.generatedAt).getTime() >= todayStart,
  );
  const tweets24h = data.tweets.filter(
    (t) => new Date(t.createdAt).getTime() >= dayAgo,
  ).length;

  const composePrefill = activeCongress?.primaryHashtags?.[0]
    ? `${activeCongress.primaryHashtags[0]} `
    : "";

  const activeFilterCount =
    (filters.congressId ? 1 : 0) +
    (filters.sessionId ? 1 : 0) +
    (filters.sourceListId ? 1 : 0) +
    filters.hashtags.length +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.language ? 1 : 0);

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      {/* Sticky compact filter bar */}
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border border-border rounded-[3px]">
        <div className="flex items-center gap-2 px-2 py-2">
          {activeCongress ? (
            <button
              type="button"
              onClick={() => patch({ congressId: null, sessionId: null })}
              className="inline-flex items-center gap-1 h-9 px-2.5 rounded-[3px] border border-accent text-accent bg-accent/10 text-[12px] font-mono"
            >
              {activeCongress.shortCode}
              <X className="w-3 h-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="inline-flex items-center h-9 px-2.5 rounded-[3px] border border-border text-text-muted text-[12px] font-mono"
            >
              All congresses
            </button>
          )}
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-[3px] border border-border text-text-primary text-[12px] font-mono"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-accent text-accent-foreground text-[10px]">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Inline composer */}
      <MobileInlineComposer
        onOpen={() => setComposeOpen(true)}
      />

      {/* Ask UroFeed — full-width entry point on mobile */}
      <button
        type="button"
        onClick={() => setAskOpen(true)}
        className="w-full h-12 bg-panel border border-accent/40 rounded-[3px] px-4 flex items-center gap-3 hover:border-accent transition-colors"
      >
        <Sparkles className="w-5 h-5 text-accent shrink-0" />
        <span className="text-text-muted text-[14px] truncate text-left">
          Ask UroFeed anything…
        </span>
      </button>

      {/* Today ribbon */}
      <button
        type="button"
        onClick={() => setTodayOpen(true)}
        className="w-full text-left px-3 py-2 rounded-[3px] border border-border bg-panel font-mono text-[12px] text-accent flex items-center gap-1.5 overflow-x-auto whitespace-nowrap"
      >
        <span className="uppercase tracking-wider text-text-muted">Today</span>
        <span className="text-text-muted">·</span>
        <span>{todaySummaries.length} new summaries</span>
        <span className="text-text-muted">·</span>
        <span>
          {liveCongresses.length > 0
            ? `${liveCongresses.map((c) => c.shortCode).join(", ")} live`
            : "no live congress"}
        </span>
        <span className="text-text-muted">·</span>
        <span>{tweets24h} tweets</span>
      </button>

      {/* Tweet stream with pull-to-refresh */}
      <PullToRefresh onRefresh={data.refetchAll} isFetching={data.isFetching}>
        <div className="flex-1 min-h-0">
          <TweetStream data={data} />
        </div>
      </PullToRefresh>

      {/* Filters sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-auto">
            <FilterBar />
          </div>
          <div className="border-t border-border p-3">
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="w-full h-11 rounded-[3px] bg-accent text-accent-foreground text-[13px] font-mono"
            >
              Apply
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Today details sheet */}
      <Sheet open={todayOpen} onOpenChange={setTodayOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b border-border">
            <SheetTitle>Today</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-auto p-4 space-y-4 text-[13px]">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
                Summaries ({todaySummaries.length})
              </div>
              {todaySummaries.length === 0 ? (
                <div className="text-text-muted">None today.</div>
              ) : (
                <ul className="space-y-1">
                  {todaySummaries.slice(0, 10).map((s) => (
                    <li key={s.id}>
                      <a
                        href={`/summaries`}
                        className="text-accent hover:underline"
                      >
                        {s.targetType}: {s.bulletPoints?.[0]?.slice(0, 60) ?? s.id}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
                Live congresses ({liveCongresses.length})
              </div>
              {liveCongresses.length === 0 ? (
                <div className="text-text-muted">None live.</div>
              ) : (
                <ul className="space-y-1">
                  {liveCongresses.map((c) => (
                    <li key={c.id}>
                      <a
                        href={`/congresses/${c.id}`}
                        className="text-accent hover:underline"
                      >
                        {c.shortCode} — {c.city}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
                Activity (24h)
              </div>
              <div className="text-text-primary">{tweets24h} tweets</div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ComposeTweetDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        initialText={composePrefill}
      />
      <AskUroFeedDialog open={askOpen} onOpenChange={setAskOpen} />
    </div>
  );
}

function MobileInlineComposer({ onOpen }: { onOpen: () => void }) {
  const { user, profile } = useAuth();
  const { data: avatar } = useQuery({
    queryKey: ["profile-min", user?.id],
    enabled: !!user && !profile?.avatar_url,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      return (data?.avatar_url as string | null) ?? null;
    },
    staleTime: 5 * 60_000,
  });
  const avatarUrl = profile?.avatar_url ?? avatar;
  const initials = (profile?.display_name ?? user?.email ?? "U")
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full px-4 py-3 bg-panel border border-border rounded-[3px] flex items-center gap-3 text-left"
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="w-8 h-8 rounded-full bg-panel-elevated shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-panel-elevated border border-border flex items-center justify-center text-[11px] font-mono font-semibold text-accent shrink-0">
          {initials}
        </div>
      )}
      <span className="text-text-muted text-[14px] flex-1 truncate">
        What did you take away?
      </span>
      <PenSquare className="w-4 h-4 text-accent" />
    </button>
  );
}

function PullToRefresh({
  onRefresh,
  isFetching,
  children,
}: {
  onRefresh: () => void;
  isFetching: boolean;
  children: React.ReactNode;
}) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const startY = React.useRef<number | null>(null);
  const [pulled, setPulled] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

  const getScrollEl = () =>
    wrapperRef.current?.querySelector<HTMLElement>("[data-stream-scroll]") ??
    null;

  const onTouchStart = (e: React.TouchEvent) => {
    const sc = getScrollEl();
    if (sc && sc.scrollTop <= 0) startY.current = e.touches[0].clientY;
    else startY.current = null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setPulled(Math.min(120, dy * 0.6));
  };
  const onTouchEnd = () => {
    if (pulled > 60) {
      setRefreshing(true);
      onRefresh();
      setTimeout(() => setRefreshing(false), 800);
    }
    startY.current = null;
    setPulled(0);
  };

  const showSyncing = refreshing || (isFetching && pulled > 0);

  return (
    <div
      ref={wrapperRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className="flex-1 min-h-0 flex flex-col relative"
      style={{ transform: `translateY(${pulled}px)`, transition: pulled === 0 ? "transform 200ms" : "none" }}
    >
      {(showSyncing || pulled > 20) && (
        <div className="absolute top-0 left-0 right-0 -mt-6 flex justify-center pointer-events-none">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            {showSyncing ? "syncing…" : pulled > 60 ? "release to refresh" : "pull to refresh"}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}

export default MobileFeedLayout;
