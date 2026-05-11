import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageSquareQuote,
  Plus,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/shell/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TweetCard } from "@/components/feed/TweetCard";
import {
  getSourceSpotlightCore,
  getSourceThemes,
  getSourceRhythm,
  getSourceInnerCircle,
  type SpotlightCore,
  type SpotlightTweet,
  type SpotlightSource,
  type SpotlightThemes,
  type SpotlightRhythm,
  type SpotlightInnerCircle,
} from "@/serverFns/source-spotlight";
import {
  useFollowSource,
  useUnfollowSource,
} from "@/hooks/useHandleActions";
import { useCanAdmin } from "@/auth/permissions";
import type { Source as DomainSource, Tweet as DomainTweet } from "@/types";

export const Route = createFileRoute("/sources_/$handle")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.handle} — Source spotlight — UroFeed` },
      {
        name: "description",
        content: `Bio, recent posts, and group memberships for @${params.handle}.`,
      },
    ],
  }),
  component: SourceSpotlightPage,
});

function relativeAge(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return "soon";
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days === 0) {
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    return hours <= 1 ? "just now" : `${hours}h ago`;
  }
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function compactNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "Date TBA";
  const f = (d: string) =>
    new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  if (start && end && start !== end) return `${f(start)} – ${f(end)}`;
  return f(start ?? end!);
}

function adaptSource(src: SpotlightSource): DomainSource {
  return {
    id: src.id,
    handle: src.handle,
    displayName: src.display_name,
    avatarUrl: src.avatar_url,
    role: "other",
    specialty: [],
    verified: src.verified,
    active: true,
  };
}

function adaptTweet(t: SpotlightTweet, sourceId: string): DomainTweet {
  return {
    id: t.tweet_id,
    sourceId,
    text: t.text,
    createdAt: t.created_at,
    likeCount: t.public_metrics.like_count,
    retweetCount: t.public_metrics.retweet_count,
    replyCount: t.public_metrics.reply_count,
    mediaUrls: t.media_urls,
    hashtags: t.hashtags,
    lang: "en",
    tweetType: t.in_reply_to_tweet_id ? "reply" : "original",
  };
}

function SourceSpotlightPage() {
  const { handle: rawHandle } = Route.useParams();
  const handle = rawHandle.replace(/^@/, "").toLowerCase();
  const fetchCore = useServerFn(getSourceSpotlightCore);
  const qc = useQueryClient();
  const followMut = useFollowSource();
  const unfollowMut = useUnfollowSource();

  const [tab, setTab] = React.useState<"recent" | "top">("recent");
  const recentRef = React.useRef<HTMLDivElement>(null);

  const queryKey = React.useMemo(
    () => ["source-spotlight", handle, tab] as const,
    [handle, tab],
  );

  const { data, isLoading, error, refetch } = useQuery<SpotlightCore>({
    queryKey,
    queryFn: () => fetchCore({ data: { handle, sort: tab, limit: 20 } }),
  });

  const onTrack = async () => {
    toast.message(`Looking up @${handle}…`);
    try {
      const res = await followMut.mutateAsync({ handle, needsLookup: true });
      toast.success(
        res.backfilled
          ? `Tracking @${handle} · backfill queued`
          : `Following @${handle}`,
      );
      qc.invalidateQueries({ queryKey: ["source-spotlight", handle] });
      refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "not_found") toast.error(`@${handle} not found on X`);
      else if (msg === "rate_limit_user") toast.error("Slow down — try again shortly");
      else if (msg === "rate_limit_global") toast.error("System busy — try again");
      else toast.error(`Couldn't track @${handle}`);
    }
  };

  const onFollowToggle = async () => {
    if (!data?.source) return;
    try {
      if (data.is_subscribed) {
        await unfollowMut.mutateAsync({ handle });
        toast.success(`Unfollowed @${handle}`);
      } else {
        await followMut.mutateAsync({ handle, needsLookup: false });
        toast.success(`Following @${handle}`);
      }
      qc.invalidateQueries({ queryKey: ["source-spotlight", handle] });
    } catch {
      toast.error("Action failed");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted p-6">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading dossier…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <BackLink />
        <p className="mt-4 text-[13px] text-rose-400">
          {error instanceof Error ? error.message : "Failed to load source."}
        </p>
      </div>
    );
  }

  if (data?.not_found || !data?.source) {
    return (
      <div className="flex flex-col gap-3 p-3 max-w-3xl mx-auto w-full">
        <BackLink />
        <Panel title="Untracked source" className="shrink-0">
          <div className="py-4 space-y-3">
            <p className="text-[13px] text-text-primary">
              We're not tracking{" "}
              <span className="font-mono text-accent">@{handle}</span> yet.
            </p>
            <p className="text-[12px] text-text-muted">
              Adding them queues an X profile lookup and a 72h backfill of their
              recent tweets. The dossier populates over the next few minutes.
            </p>
            <Button onClick={onTrack} disabled={followMut.isPending} className="gap-2">
              {followMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Track @{handle}
            </Button>
            <a
              href={`https://x.com/${handle}`}
              target="_blank"
              rel="noreferrer noopener"
              className="ml-3 inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-accent"
            >
              View on X <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </Panel>
      </div>
    );
  }

  const src = data.source;
  const domainSource = adaptSource(src);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-3 p-3 max-w-4xl mx-auto w-full overflow-y-auto">
        <BackLink />

        <header className="border border-border bg-panel rounded-[4px] p-4 shrink-0">
          <div className="flex items-start gap-4">
            <img
              src={src.avatar_url || ""}
              alt=""
              loading="lazy"
              className="w-16 h-16 rounded-[4px] border border-border bg-panel-elevated flex-shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold text-text-primary truncate">
                  {src.display_name || `@${src.handle}`}
                </h1>
                {src.verified && <CheckCircle2 className="w-4 h-4 text-accent" />}
                <span className="font-mono text-[12px] text-text-muted">@{src.handle}</span>
              </div>
              <BioBlock bio={src.bio} />
              <div className="mt-3 flex items-center gap-x-4 gap-y-1 text-[11px] font-mono text-text-muted flex-wrap">
                <span>{compactNum(src.followers_count)} followers</span>
                <span>·</span>
                <span>{src.tweet_count_30d} posts (30d)</span>
                <span>·</span>
                <span>
                  enriched <span title={src.enriched_at ?? "never"}>{relativeAge(src.enriched_at)}</span>
                </span>
              </div>
              {data.cancer_areas.length > 0 && (
                <div className="mt-3 flex items-center gap-1 flex-wrap">
                  {data.cancer_areas.map((a) => (
                    <Badge
                      key={a.id}
                      variant="outline"
                      className="text-[10px] uppercase tracking-wider border-accent/40 text-accent"
                    >
                      {a.name}
                    </Badge>
                  ))}
                </div>
              )}
              {data.group_memberships.length > 0 && (
                <div className="mt-2 flex items-center gap-1 flex-wrap">
                  {data.group_memberships.map((g) => (
                    <Link
                      key={g.group_id}
                      to="/groups/$slug"
                      params={{ slug: g.slug }}
                      className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-text-muted bg-panel-elevated/50 border border-border px-1.5 py-0.5 rounded hover:border-accent/40 hover:text-accent transition-colors"
                    >
                      {g.visibility === "official" && (
                        <BadgeCheck className="w-3 h-3 text-accent" />
                      )}
                      {g.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="shrink-0 flex flex-col gap-2 items-end">
              <Button
                onClick={onFollowToggle}
                disabled={followMut.isPending || unfollowMut.isPending}
                variant={data.is_subscribed ? "outline" : "default"}
              >
                {data.is_subscribed ? "Following" : "Follow"}
              </Button>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-[11px]"
                  onClick={() =>
                    recentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  <MessageSquareQuote className="w-3 h-3" />
                  Reply to recent
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button variant="ghost" size="sm" className="gap-1 text-[11px]" disabled>
                        <Bell className="w-3 h-3" />
                        Set up alerts
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Coming soon</TooltipContent>
                </Tooltip>
                <a
                  href={`https://x.com/${src.handle}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 px-2 h-8 text-[11px] text-text-muted hover:text-accent"
                >
                  Open on X <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </header>

        {data.upcoming_congresses.length > 0 && (
          <Panel title={`Upcoming congresses · ${data.upcoming_congresses.length}`}>
            <div className="py-2 space-y-2">
              {data.upcoming_congresses.map((c) => (
                <Link
                  key={c.congress_id}
                  to="/congresses/$congressId"
                  params={{ congressId: c.congress_id }}
                  className="block border border-border rounded-[3px] p-3 hover:border-accent/60 hover:bg-panel-elevated/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] text-text-primary font-medium truncate">
                        {c.name}
                      </div>
                      <div className="mt-0.5 text-[11px] font-mono text-text-muted">
                        {formatDateRange(c.start_date, c.end_date)}
                        {(c.city || c.country) && (
                          <>
                            {" · "}
                            {[c.city, c.country].filter(Boolean).join(", ")}
                          </>
                        )}
                      </div>
                    </div>
                    {c.role && (
                      <Badge variant="outline" className="text-[10px] uppercase shrink-0">
                        {c.role}
                      </Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </Panel>
        )}

        <div ref={recentRef}>
          <Panel
            title={`${tab === "top" ? "Top posts (30d)" : "Recent posts"} · ${data.recent_tweets.length}`}
            actions={
              <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setTab("recent")}
                  className={
                    tab === "recent"
                      ? "px-2 h-6 rounded-[2px] bg-accent/15 text-accent"
                      : "px-2 h-6 rounded-[2px] text-text-muted hover:text-accent"
                  }
                >
                  Recent
                </button>
                <button
                  type="button"
                  onClick={() => setTab("top")}
                  className={
                    tab === "top"
                      ? "px-2 h-6 rounded-[2px] bg-accent/15 text-accent"
                      : "px-2 h-6 rounded-[2px] text-text-muted hover:text-accent"
                  }
                >
                  Top
                </button>
              </div>
            }
          >
            <div className="py-2 space-y-2">
              {data.recent_tweets.length === 0 ? (
                <p className="text-[12px] text-text-muted py-4">
                  No posts yet — this source may have just been added or hasn't
                  posted in the last 30 days.
                </p>
              ) : (
                data.recent_tweets.map((t) => (
                  <TweetCard
                    key={t.tweet_id}
                    tweet={adaptTweet(t, src.id)}
                    source={domainSource}
                  />
                ))
              )}
            </div>
          </Panel>
        </div>

        <ThemesPanel handle={handle} />
        <RhythmPanel handle={handle} />
        <InnerCirclePanel handle={handle} />
      </div>
    </TooltipProvider>
  );
}

function BackLink() {
  return (
    <Link
      to="/sources"
      className="text-[12px] text-accent hover:underline inline-flex items-center gap-1 shrink-0"
    >
      <ArrowLeft className="w-3 h-3" /> Back to sources
    </Link>
  );
}

function BioBlock({ bio }: { bio: string | null }) {
  const [expanded, setExpanded] = React.useState(false);
  if (!bio) return null;
  const isLong = bio.length > 240 || bio.split("\n").length > 3;
  return (
    <div className="mt-2 text-[13px] text-text-primary whitespace-pre-wrap break-words">
      <p className={!expanded && isLong ? "line-clamp-3" : ""}>{bio}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[11px] font-mono uppercase tracking-wider text-text-muted hover:text-accent"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

export default SourceSpotlightPage;

// =====================================================================
// Phase B Panels
// =====================================================================

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="py-6 flex flex-col items-center gap-2 text-[12px] text-text-muted">
      <AlertTriangle className="w-4 h-4 text-amber-400" />
      <p>{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1">
        <RefreshCw className="w-3 h-3" /> Retry
      </Button>
    </div>
  );
}

function ThemesPanel({ handle }: { handle: string }) {
  const fetchThemes = useServerFn(getSourceThemes);
  const isAdmin = useCanAdmin();
  const qc = useQueryClient();
  const queryKey = ["source-themes", handle] as const;

  const { data, isLoading, error, refetch, isFetching } = useQuery<SpotlightThemes | null>({
    queryKey,
    queryFn: () => fetchThemes({ data: { handle, refresh: false } }),
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });

  // If stale on mount, kick off a background refresh (admin only — others
  // would 403 on the refresh path; for non-admins, the cached data still shows).
  React.useEffect(() => {
    if (data?.is_stale && isAdmin && !isFetching) {
      fetchThemes({ data: { handle, refresh: true } })
        .then(() => qc.invalidateQueries({ queryKey }))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.is_stale, isAdmin, handle]);

  const onForceRefresh = async () => {
    try {
      await fetchThemes({ data: { handle, refresh: true } });
      qc.invalidateQueries({ queryKey });
      toast.success("Themes refreshed");
    } catch {
      toast.error("Refresh failed");
    }
  };

  const ageLabel = data?.computed_at ? `computed ${relativeAge(data.computed_at)}` : "";

  return (
    <Panel
      title="Themes (LLM-derived)"
      actions={
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-text-muted">
          {ageLabel && <span>{ageLabel}</span>}
          {isAdmin && (
            <button
              type="button"
              onClick={onForceRefresh}
              disabled={isFetching}
              className="inline-flex items-center gap-1 hover:text-accent disabled:opacity-50"
              title="Force refresh"
            >
              <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      }
    >
      {isLoading ? (
        <div className="py-4 grid grid-cols-1 md:grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : error ? (
        <PanelError message="Couldn't compute themes" onRetry={() => refetch()} />
      ) : !data || data.themes.length === 0 ? (
        <p className="py-4 text-[12px] text-text-muted">
          Not enough recent activity to derive themes (needs ~20+ posts).
        </p>
      ) : (
        <div className="py-2 flex md:grid md:grid-cols-3 gap-2 overflow-x-auto md:overflow-visible">
          {data.themes.map((t, i) => (
            <div
              key={i}
              className="shrink-0 md:shrink min-w-[240px] md:min-w-0 border border-border rounded-[3px] p-3 bg-panel-elevated/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[13px] text-text-primary font-medium leading-tight">
                  {t.label}
                </div>
                <div className="text-[10px] font-mono text-text-muted shrink-0">
                  {Math.round(t.weight * 100)}%
                </div>
              </div>
              <div className="mt-1.5 h-1 bg-panel-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent/70"
                  style={{ width: `${Math.round(t.weight * 100)}%` }}
                />
              </div>
              {t.cancer_area_slug && (
                <Badge
                  variant="outline"
                  className="mt-2 text-[9px] uppercase tracking-wider border-accent/40 text-accent"
                >
                  {t.cancer_area_slug}
                </Badge>
              )}
              {t.top_hashtags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.top_hashtags.slice(0, 3).map((h) => (
                    <span
                      key={h}
                      className="text-[10px] font-mono text-text-muted bg-panel-elevated px-1.5 py-0.5 rounded"
                    >
                      #{h}
                    </span>
                  ))}
                </div>
              )}
              {t.example_tweet_ids.length > 0 && (
                <div className="mt-2 text-[10px] font-mono text-text-muted">
                  {t.example_tweet_ids.length} example
                  {t.example_tweet_ids.length > 1 ? "s" : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function RhythmPanel({ handle }: { handle: string }) {
  const fetchRhythm = useServerFn(getSourceRhythm);
  const queryKey = ["source-rhythm", handle] as const;

  const { data, isLoading, error, refetch } = useQuery<SpotlightRhythm>({
    queryKey,
    queryFn: () => fetchRhythm({ data: { handle } }),
    staleTime: 10 * 60 * 1000,
  });

  const hourlyData = React.useMemo(
    () => data?.hourly.map((count, hour) => ({ hour, count })) ?? [],
    [data],
  );
  const dowData = React.useMemo(
    () => data?.dow.map((count, i) => ({ day: DOW_LABELS[i], count })) ?? [],
    [data],
  );

  return (
    <Panel title="Posting rhythm (30d)">
      {isLoading ? (
        <div className="py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : error ? (
        <PanelError message="Couldn't load posting rhythm" onRetry={() => refetch()} />
      ) : !data || data.total_tweets_30d === 0 ? (
        <p className="py-4 text-[12px] text-text-muted">No posts in the last 30 days.</p>
      ) : (
        <div className="py-2 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
                Hour of day (UTC)
              </div>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData}>
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 9, fill: "currentColor" }}
                      tickLine={false}
                      axisLine={false}
                      interval={3}
                    />
                    <YAxis hide />
                    <ReTooltip
                      cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      contentStyle={{
                        background: "hsl(var(--panel))",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 11,
                      }}
                      formatter={(v: number) => [`${v} posts`, ""]}
                      labelFormatter={(h: number) => `${String(h).padStart(2, "0")}:00 UTC`}
                    />
                    <Bar dataKey="count" fill="hsl(var(--accent))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
                Day of week
              </div>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dowData}>
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 9, fill: "currentColor" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis hide />
                    <ReTooltip
                      cursor={{ fill: "rgba(255,255,255,0.05)" }}
                      contentStyle={{
                        background: "hsl(var(--panel))",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 11,
                      }}
                      formatter={(v: number) => [`${v} posts`, ""]}
                    />
                    <Bar dataKey="count" fill="hsl(var(--accent))" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-text-muted">
            Most active <span className="text-text-primary">{DOW_LABELS[data.peak_dow]}s</span>{" "}
            around{" "}
            <span className="text-text-primary">
              {String(data.peak_hour).padStart(2, "0")}:00 UTC
            </span>
            {data.inferred_timezone && (
              <>
                {" "}— inferred timezone:{" "}
                <span className="text-text-primary">{data.inferred_timezone}</span>
              </>
            )}
            . Based on {data.total_tweets_30d} tweets in the last 30 days.
          </p>
        </div>
      )}
    </Panel>
  );
}

function InnerCirclePanel({ handle }: { handle: string }) {
  const fetchInner = useServerFn(getSourceInnerCircle);
  const { data, isLoading, error, refetch } = useQuery<SpotlightInnerCircle>({
    queryKey: ["source-inner-circle", handle],
    queryFn: () => fetchInner({ data: { handle } }),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Panel title="Inner circle (30d)">
        <div className="py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Panel>
    );
  }
  if (error) {
    return (
      <Panel title="Inner circle (30d)">
        <PanelError message="Couldn't load conversation network" onRetry={() => refetch()} />
      </Panel>
    );
  }
  if (!data || (data.outgoing.length === 0 && data.incoming.length === 0)) {
    return null;
  }

  return (
    <Panel title="Inner circle (30d)">
      <div className="py-2 grid grid-cols-1 md:grid-cols-2 gap-3">
        <InnerCircleColumn title="Replies to most often" entries={data.outgoing} />
        <InnerCircleColumn title="Replied to by most" entries={data.incoming} />
      </div>
    </Panel>
  );
}

function InnerCircleColumn({
  title,
  entries,
}: {
  title: string;
  entries: SpotlightInnerCircle["outgoing"];
}) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
        {title}
      </div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-text-muted py-2">No data.</p>
      ) : (
        <ul className="space-y-1">
          {entries.map((e) => (
            <li key={e.handle}>
              <Link
                to="/sources/$handle"
                params={{ handle: e.handle }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-[3px] hover:bg-panel-elevated/60 transition-colors"
              >
                {e.avatar_url ? (
                  <img
                    src={e.avatar_url}
                    alt=""
                    className="w-7 h-7 rounded-[3px] border border-border bg-panel-elevated"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-[3px] border border-border bg-panel-elevated" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-text-primary truncate">
                    {e.display_name || `@${e.handle}`}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted truncate">
                    @{e.handle}
                    {!e.is_tracked && <span className="ml-1 opacity-60">· untracked</span>}
                  </div>
                </div>
                <div className="text-[11px] font-mono text-text-muted shrink-0">{e.count}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}