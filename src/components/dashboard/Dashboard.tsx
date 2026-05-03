import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getNewRecommendedSourcesCount } from "@/server/onboarding.functions";
import { getIngestionCronHealth } from "@/server/ingestion.functions";
import type { CronHealthRow as CronHealthRowData } from "@/server/ingestion.functions";
import { useAuth } from "@/auth/AuthProvider";
import {
  Activity,
  Radio,
  Database,
  FileText,
  Flame,
  Clock,
  ArrowRight,
  Heart,
  Repeat2,
  MessageCircle,
  ServerCog,
} from "lucide-react";
import { Panel } from "@/components/shell/Panel";
import { HandleChip } from "@/components/handles/HandleChip";
import { feedService } from "@/services/feedService";
import { useLiveKpis } from "@/hooks/useLiveKpis";
import { feedNowMs, initFeedClock } from "@/components/feed/feedClock";
import { cn } from "@/lib/utils";
import type { Session, Tweet, Source, Summary, Congress } from "@/types";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}
function relTime(iso: string, nowMs: number) {
  const diff = nowMs - new Date(iso).getTime();
  if (diff < 0) return "soon";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtAge(seconds: number | null) {
  if (seconds == null) return "never";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function Dashboard() {
  const { user } = useAuth();
  const fetchNewRecs = useServerFn(getNewRecommendedSourcesCount);
  const fetchCronHealth = useServerFn(getIngestionCronHealth);
  const { data: newRecs } = useQuery({
    queryKey: ["new-recommended-sources-count", user?.id ?? null],
    enabled: !!user,
    queryFn: async () => {
      try {
        return await fetchNewRecs();
      } catch {
        return { count: 0 };
      }
    },
    staleTime: 60_000,
  });
  const [bannerDismissed, setBannerDismissed] = React.useState(false);
  const { data: congresses = [] } = useQuery({
    queryKey: ["congresses"],
    queryFn: () => feedService.listCongresses(),
  });
  const { data: sources = [] } = useQuery({
    queryKey: ["sources"],
    queryFn: () => feedService.listSources(),
  });
  const { data: allTweets = [] } = useQuery({
    queryKey: ["dashboard-tweets"],
    queryFn: () => feedService.listTweets({ limit: 250 }),
  });
  const { data: cronHealth = [] } = useQuery({
    queryKey: ["ingestion-cron-health"],
    enabled: !!user,
    queryFn: () => fetchCronHealth(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Sessions across all congresses
  const sessionQueries = useQuery({
    queryKey: ["dashboard-sessions", congresses.map((c) => c.id).join(",")],
    enabled: congresses.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(
        congresses.map((c) => feedService.listSessions(c.id)),
      );
      return lists.flat();
    },
  });
  const sessions = sessionQueries.data ?? [];

  const sourceMap = React.useMemo(
    () => new Map(sources.map((s) => [s.id, s])),
    [sources],
  );
  const congressMap = React.useMemo(
    () => new Map(congresses.map((c) => [c.id, c])),
    [congresses],
  );
  const sessionMap = React.useMemo(
    () => new Map(sessions.map((s) => [s.id, s])),
    [sessions],
  );

  // Initialise feed clock once tweets arrive
  React.useEffect(() => {
    if (allTweets.length) initFeedClock(allTweets[0]?.createdAt);
  }, [allTweets]);

  const nowMs = feedNowMs();
  const oneDayAgo = nowMs - 24 * 60 * 60 * 1000;

  // Live KPIs from Supabase (real ingestion data)
  const { data: liveKpis } = useLiveKpis(30_000);

  // KPIs (mock-derived for things still on mock: congresses, summaries)
  const activeCongresses = congresses.filter(
    (c) => c.status === "live" || c.status === "upcoming",
  ).length;

  const { data: allSummaries = [] } = useQuery({
    queryKey: ["all-summaries"],
    queryFn: () => feedService.listSummaries(),
  });
  const summariesToday = allSummaries.filter(
    (s) => new Date(s.generatedAt).getTime() >= oneDayAgo,
  ).length;

  // Now happening — sessions whose start..end straddles feedNow
  const liveSessions = sessions
    .filter((s) => {
      const start = new Date(s.startTime).getTime();
      const end = new Date(s.endTime).getTime();
      return start <= nowMs && end >= nowMs;
    })
    .slice(0, 6);

  // Most discussed last 24h
  const tweetsBySession = React.useMemo(() => {
    const c = new Map<string, number>();
    allTweets.forEach((t) => {
      if (!t.sessionId) return;
      if (new Date(t.createdAt).getTime() < oneDayAgo) return;
      c.set(t.sessionId, (c.get(t.sessionId) ?? 0) + 1);
    });
    return c;
  }, [allTweets, oneDayAgo]);

  const mostDiscussed = React.useMemo(() => {
    return Array.from(tweetsBySession.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => ({
        session: sessionMap.get(id),
        count,
      }))
      .filter((x) => x.session) as { session: Session; count: number }[];
  }, [tweetsBySession, sessionMap]);

  // Recent activity = latest tweets
  const recentTweets = React.useMemo(() => {
    return [...allTweets]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 25);
  }, [allTweets]);

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-3 overflow-y-auto">
      {newRecs && newRecs.count > 0 && !bannerDismissed && (
        <div
          className="flex items-center justify-between px-3 py-2 shrink-0"
          style={{
            background: "color-mix(in oklab, var(--accent) 8%, var(--panel))",
            border: "1px solid var(--accent)",
          }}
        >
          <div className="text-[12px] text-text-primary">
            Your interests changed —{" "}
            <span className="font-mono text-accent">{newRecs.count}</span> new sources are
            recommended you don't follow yet.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("urofeed:open-wizard-step", {
                    detail: { step: "Sources" },
                  }),
                )
              }
              className="font-mono text-[11px] uppercase text-accent hover:underline"
            >
              Review →
            </button>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="text-text-muted hover:text-text-primary text-xs"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <Kpi
          icon={<Activity className="w-4 h-4" />}
          label="Active congresses"
          value={activeCongresses}
          sub={`${congresses.length} total tracked`}
        />
        <Kpi
          icon={<Radio className="w-4 h-4" />}
          label="Tweets / min"
          value={liveKpis?.tweetsPerMin ?? 0}
          sub={`${liveKpis?.tweetsLastHour ?? 0} in last hour · live`}
          accent
        />
        <Kpi
          icon={<Database className="w-4 h-4" />}
          label="Sources tracked"
          value={liveKpis?.activeSources ?? 0}
          sub={`${liveKpis?.activeHashtags ?? 0} hashtags · live`}
        />
        <Kpi
          icon={<FileText className="w-4 h-4" />}
          label="Summaries today"
          value={summariesToday}
          sub={`${allSummaries.length} all-time`}
        />
      </div>

      {/* Main 2-column area */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3">
        <div className="col-span-12 xl:col-span-8 flex flex-col gap-3 min-h-0">
          <Panel
            title={
              <span className="flex items-center gap-2">
                <ServerCog className="w-3 h-3 text-accent" />
                Ingestion
              </span>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {cronHealth.map((job) => (
                <CronHealthRow key={job.jobname} job={job} />
              ))}
              {cronHealth.length === 0 && <EmptyState text="No cron health data yet." />}
            </div>
          </Panel>

          {/* Now happening */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-success"
                  style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
                />
                Now happening
                <span className="text-text-muted font-normal normal-case tracking-normal">
                  · {liveSessions.length} live
                </span>
              </span>
            }
            actions={
              <Link
                to="/feed"
                className="text-[11px] font-mono text-accent hover:underline"
              >
                live feed →
              </Link>
            }
          >
            {liveSessions.length === 0 ? (
              <EmptyState text="No sessions live at this minute." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {liveSessions.map((s) => (
                  <NowHappeningCard
                    key={s.id}
                    session={s}
                    congress={congressMap.get(s.congressId)}
                    summary={allSummaries.find(
                      (sm) => sm.targetType === "session" && sm.targetId === s.id,
                    )}
                    tweetCount={tweetsBySession.get(s.id) ?? 0}
                  />
                ))}
              </div>
            )}
          </Panel>

          {/* Most discussed */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                <Flame className="w-3 h-3 text-warning" />
                Most discussed · last 24h
              </span>
            }
            className="flex-1 min-h-0"
            bodyClassName="overflow-y-auto"
          >
            {mostDiscussed.length === 0 ? (
              <EmptyState text="Not enough chatter yet." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {mostDiscussed.map(({ session, count }) => (
                  <DiscussedCard
                    key={session.id}
                    session={session}
                    congress={congressMap.get(session.congressId)}
                    count={count}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Right rail — activity */}
        <Panel
          title="Recent activity"
          className="col-span-12 xl:col-span-4 min-h-0"
          bodyClassName="overflow-y-auto"
        >
          <div className="space-y-2">
            {recentTweets.map((t) => (
              <ActivityRow
                key={t.id}
                tweet={t}
                source={sourceMap.get(t.sourceId)}
                nowMs={nowMs}
              />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-border bg-panel rounded-[4px] p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted">
          {label}
        </span>
        <span className={cn("text-text-muted", accent && "text-accent")}>
          {icon}
        </span>
      </div>
      <div
        className={cn(
          "text-[28px] font-mono font-semibold leading-none",
          accent ? "text-accent" : "text-text-primary",
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] font-mono text-text-muted">{sub}</div>
      )}
    </div>
  );
}

function CronHealthRow({
  job,
}: {
  job: CronHealthRowData;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border border-border rounded-[3px] bg-panel-elevated/30 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] font-mono text-text-primary truncate">
          {job.jobname}
        </div>
        <div className="mt-0.5 text-[10px] font-mono text-text-muted">
          {job.schedule} · every {fmtAge(job.expected_interval_seconds)}
        </div>
      </div>
      <div
        className={cn(
          "text-right font-mono text-[11px] shrink-0",
          job.is_stale ? "text-danger" : "text-success",
        )}
      >
        <div>{job.last_success_at ? fmtTime(job.last_success_at) : "never"}</div>
        <div className="text-[10px]">{fmtAge(job.age_seconds)}</div>
      </div>
    </div>
  );
}

function NowHappeningCard({
  session,
  congress,
  summary,
  tweetCount,
}: {
  session: Session;
  congress?: Congress;
  summary?: Summary;
  tweetCount: number;
}) {
  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: session.id }}
      className="block border border-border rounded-[3px] p-3 bg-panel-elevated/30 hover:border-accent/50 transition-colors group"
    >
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-text-muted">
        {congress && <span className="text-accent">{congress.shortCode}</span>}
        <span>·</span>
        <span>{session.track}</span>
        <span className="ml-auto text-text-primary">{session.room}</span>
      </div>
      <div className="mt-1.5 text-[13px] text-text-primary leading-snug font-medium line-clamp-2 group-hover:text-accent transition-colors">
        {session.title}
      </div>
      {summary && summary.bulletPoints[0] && (
        <p className="mt-2 text-[11px] text-text-muted line-clamp-2 italic">
          “{summary.bulletPoints[0]}”
        </p>
      )}
      <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[10px] font-mono text-text-muted">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {fmtTime(session.startTime)}–{fmtTime(session.endTime)}
        </span>
        <span className="flex items-center gap-1 text-accent">
          <Radio className="w-3 h-3" />
          {tweetCount} tweets
        </span>
      </div>
    </Link>
  );
}

function DiscussedCard({
  session,
  congress,
  count,
}: {
  session: Session;
  congress?: Congress;
  count: number;
}) {
  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: session.id }}
      className="block border border-border rounded-[3px] p-2.5 hover:border-accent/50 transition-colors group"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
          {congress?.shortCode ?? "—"} · {fmtDay(session.startTime)}
        </div>
        <div className="text-[12px] font-mono font-semibold text-warning shrink-0">
          {count}
        </div>
      </div>
      <div className="mt-1 text-[12px] text-text-primary leading-snug line-clamp-2 group-hover:text-accent transition-colors">
        {session.title}
      </div>
    </Link>
  );
}

function ActivityRow({
  tweet,
  source,
  nowMs,
}: {
  tweet: Tweet;
  source?: Source;
  nowMs: number;
}) {
  return (
    <div className="flex gap-2 p-2 border border-border rounded-[2px] bg-panel">
      <img
        src={source?.avatarUrl}
        alt=""
        className="w-6 h-6 rounded-[2px] border border-border flex-shrink-0"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px]">
          <HandleChip
            handle={source?.handle.replace(/^@/, "") ?? "unknown"}
            className="truncate"
          />
          <span className="ml-auto font-mono text-[10px] text-text-muted shrink-0">
            {relTime(tweet.createdAt, nowMs)}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-text-primary line-clamp-2 leading-snug">
          {tweet.text}
        </p>
        <div className="mt-1 flex items-center gap-3 text-[10px] font-mono text-text-muted">
          <span className="flex items-center gap-0.5">
            <Heart className="w-2.5 h-2.5" />
            {tweet.likeCount}
          </span>
          <span className="flex items-center gap-0.5">
            <Repeat2 className="w-2.5 h-2.5" />
            {tweet.retweetCount}
          </span>
          <span className="flex items-center gap-0.5">
            <MessageCircle className="w-2.5 h-2.5" />
            {tweet.replyCount}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-8 text-[12px] font-mono text-text-muted">
      {text}
    </div>
  );
}

export default Dashboard;