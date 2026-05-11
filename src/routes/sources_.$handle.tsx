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