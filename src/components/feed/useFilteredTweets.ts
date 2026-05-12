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

const SERVER_FETCH_LIMIT = 250;

/**
 * Centralised data layer for the live feed. Polls every 30s and applies
 * filters server-side via feedService.listTweets — only client-side filters
 * are the virtual-clock check and the brush-window scrubber.
 *
 * Audit fix H1: previous version pulled `limit: 1000` and filtered
 * client-side for sessionId/sourceListId/hashtags. As corpus grew this
 * became a per-poll bandwidth hog. Filters now go to the server.
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
    // Sources list rarely changes mid-session; keep the warm cache
    // across feed remounts instead of refetching on every navigation.
    staleTime: 5 * 60_000,
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
    staleTime: 5 * 60_000,
  });

  // Resolve allowed source ids for the active source list (still client-side
  // because list membership is in `sources.list_ids` text[]).
  const allowedSourceIds = React.useMemo(() => {
    if (!filters.sourceListId) return null;
    return sources
      .filter((s) => s.listIds?.includes(filters.sourceListId!))
      .map((s) => s.id);
  }, [filters.sourceListId, sources]);

  // Build server filter payload. Date range, session, source, hashtags,
  // language go server-side. Brush + virtual-clock stay client-side.
  const serverFilter = React.useMemo(() => {
    const f: {
      sessionId?: string;
      sourceIds?: string[];
      hashtags?: string[];
      since?: string;
      until?: string;
      limit?: number;
    } = { limit: SERVER_FETCH_LIMIT };
    if (filters.sessionId) f.sessionId = filters.sessionId;
    if (filters.sourceId) f.sourceIds = [filters.sourceId];
    else if (allowedSourceIds && allowedSourceIds.length > 0)
      f.sourceIds = allowedSourceIds;
    if (filters.hashtags.length) f.hashtags = filters.hashtags;
    if (filters.dateFrom) f.since = filters.dateFrom + "T00:00:00Z";
    if (filters.dateTo) f.until = filters.dateTo + "T23:59:59Z";
    return f;
  }, [filters, allowedSourceIds]);

  // Live tweet list — server-filtered, refetched every 30s.
  const tweetQuery = useLiveData(
    ["live-tweets", serverFilter],
    async () => feedService.listTweets(serverFilter),
    effectiveInterval,
  );

  React.useEffect(() => {
    if (tweetQuery.data && tweetQuery.data.length > 0) {
      initFeedClock(tweetQuery.data[0].createdAt);
    }
  }, [tweetQuery.data]);

  React.useEffect(() => {
    if (tweetQuery.dataUpdatedAt > 0) advanceFeedClock(120);
  }, [tweetQuery.dataUpdatedAt]);

  // Apply the remaining client-only filters (brush window, virtual clock,
  // language, congress→sessions filter, language) and the session-set check
  // for "all sessions in this congress" mode.
  const tweets = React.useMemo(() => {
    const all = tweetQuery.data ?? [];
    const nowMs = feedNowMs();
    const sessIdsForCongress =
      filters.congressId && !filters.sessionId
        ? new Set(allCongressSessions.map((s) => s.id))
        : null;

    return all.filter((t) => {
      const ms = new Date(t.createdAt).getTime();
      if (ms > nowMs) return false; // not yet "live"
      if (filters.brush) {
        if (ms < filters.brush.sinceMs || ms > filters.brush.untilMs) return false;
      }
      if (sessIdsForCongress && (!t.sessionId || !sessIdsForCongress.has(t.sessionId)))
        return false;
      if (filters.language && t.lang !== filters.language) return false;
      return true;
    });
  }, [tweetQuery.data, filters.brush, filters.language, filters.congressId, filters.sessionId, allCongressSessions]);

  // Memoise the returned dataset so consumers (TweetStream, MobileFeedLayout,
  // etc.) get a stable object reference between renders. Without this, every
  // render of the parent passed a new `data` prop and forced the virtualised
  // tweet stream to reconcile from scratch -- felt like jank on dense feeds.
  const refetchAll = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["live-tweets"] });
  }, [qc]);

  return React.useMemo(
    () => ({
      tweets,
      sources,
      sourcesById,
      sessions: allCongressSessions,
      refetchAll,
      isFetching: tweetQuery.isFetching,
      lastUpdatedMs: tweetQuery.dataUpdatedAt,
    }),
    [
      tweets,
      sources,
      sourcesById,
      allCongressSessions,
      refetchAll,
      tweetQuery.isFetching,
      tweetQuery.dataUpdatedAt,
    ],
  );
}
