import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { feedService } from "@/services/feedService";
import { useLiveData } from "@/hooks/useLiveData";
import type { Source, Tweet, Session } from "@/types";
import { useFeedFilters } from "./FeedFilterContext";
import { advanceFeedClock, feedNowMs, initFeedClock } from "./feedClock";
import { useAuth } from "@/auth/AuthProvider";

export interface FeedDataset {
  tweets: Tweet[];
  sources: Source[];
  sourcesById: Record<string, Source>;
  sessions: Session[];
  refetchAll: () => void;
  isFetching: boolean;
  lastUpdatedMs: number;
}

/**
 * Centralised data layer for the live feed. Polls every 30s, advances the
 * virtual clock, and applies all active filters client-side so the rest of
 * the feed UI just consumes a list of `Tweet`s.
 */
export function useFilteredTweets(intervalMs?: number): FeedDataset {
  const qc = useQueryClient();
  const { filters } = useFeedFilters();
  const { prefs } = useAuth();
  const effectiveInterval =
    intervalMs ?? (prefs?.polling_interval_seconds ?? 30) * 1000;

  // Static-ish lookups
  const { data: sources = [] } = useQuery({
    queryKey: ["sources"],
    queryFn: () => feedService.listSources(),
  });
  const sourcesById = React.useMemo(
    () => Object.fromEntries(sources.map((s) => [s.id, s])) as Record<string, Source>,
    [sources],
  );

  const { data: allCongressSessions = [] } = useQuery({
    queryKey: ["congress-sessions", filters.congressId ?? "__none__"],
    queryFn: () =>
      filters.congressId
        ? feedService.listSessions(filters.congressId)
        : Promise.resolve([] as Session[]),
    enabled: Boolean(filters.congressId),
  });

  // Source-list scoping: which source IDs are allowed by the active list?
  const allowedSourceIds = React.useMemo(() => {
    if (!filters.sourceListId) return null;
    const set = new Set(
      sources
        .filter((s) => s.listIds?.includes(filters.sourceListId!))
        .map((s) => s.id),
    );
    return set;
  }, [filters.sourceListId, sources]);

  // Live tweet list — refetch every 30s, advance the virtual clock each tick.
  const tweetQuery = useLiveData(
    ["live-tweets"],
    async () => feedService.listTweets({ limit: 1000 }),
    effectiveInterval,
  );

  React.useEffect(() => {
    if (tweetQuery.data && tweetQuery.data.length > 0) {
      initFeedClock(tweetQuery.data[0].createdAt);
    }
  }, [tweetQuery.data]);

  // Each successful poll: advance the virtual clock so more tweets become
  // visible (simulates new arrivals).
  React.useEffect(() => {
    if (tweetQuery.dataUpdatedAt > 0) advanceFeedClock(120);
  }, [tweetQuery.dataUpdatedAt]);

  // Apply all filters client-side. The list arrives newest-first.
  const tweets = React.useMemo(() => {
    const all = tweetQuery.data ?? [];
    const nowMs = feedNowMs();
    const dateFromMs = filters.dateFrom
      ? new Date(filters.dateFrom + "T00:00:00Z").getTime()
      : null;
    const dateToMs = filters.dateTo
      ? new Date(filters.dateTo + "T23:59:59Z").getTime()
      : null;
    const sessIdsForCongress =
      filters.congressId && !filters.sessionId
        ? new Set(allCongressSessions.map((s) => s.id))
        : null;
    const wantTags = filters.hashtags.length
      ? new Set(filters.hashtags.map((h) => h.toLowerCase()))
      : null;

    return all.filter((t) => {
      const ms = new Date(t.createdAt).getTime();
      if (ms > nowMs) return false; // not yet "live"
      if (filters.brush) {
        if (ms < filters.brush.sinceMs || ms > filters.brush.untilMs) return false;
      }
      if (dateFromMs !== null && ms < dateFromMs) return false;
      if (dateToMs !== null && ms > dateToMs) return false;
      if (filters.sessionId && t.sessionId !== filters.sessionId) return false;
      if (sessIdsForCongress && (!t.sessionId || !sessIdsForCongress.has(t.sessionId)))
        return false;
      if (allowedSourceIds && !allowedSourceIds.has(t.sourceId)) return false;
      if (wantTags) {
        const ok = t.hashtags.some((h) => wantTags.has(h.toLowerCase()));
        if (!ok) return false;
      }
      if (filters.language && t.lang !== filters.language) return false;
      return true;
    });
  }, [tweetQuery.data, filters, allCongressSessions, allowedSourceIds]);

  return {
    tweets,
    sources,
    sourcesById,
    sessions: allCongressSessions,
    refetchAll: () => {
      qc.invalidateQueries({ queryKey: ["live-tweets"] });
    },
    isFetching: tweetQuery.isFetching,
    lastUpdatedMs: tweetQuery.dataUpdatedAt,
  };
}