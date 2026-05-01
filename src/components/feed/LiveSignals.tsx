import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, Activity, Hash, Flame } from "lucide-react";
import { Panel } from "@/components/shell/Panel";
import { feedService } from "@/services/feedService";
import type { Source, Tweet, Session } from "@/types";
import { feedNowMs } from "./feedClock";

const POSITIVE_WORDS = [
  "great", "promising", "impressive", "breakthrough", "encouraging",
  "improvement", "win", "exciting", "robust", "compelling", "strong",
];
const NEGATIVE_WORDS = [
  "controversial", "disappoint", "concern", "risk", "skeptic", "weak",
  "fail", "doubt", "criticism", "limited", "unclear", "questionable",
];

function scoreSentiment(text: string): number {
  const t = text.toLowerCase();
  let s = 0;
  for (const w of POSITIVE_WORDS) if (t.includes(w)) s += 1;
  for (const w of NEGATIVE_WORDS) if (t.includes(w)) s -= 1;
  return s;
}

function aggregateSignals(
  tweets: Tweet[],
  sourcesById: Record<string, Source>,
  sessionsById: Record<string, Session>,
) {
  const now = feedNowMs();
  const oneHourAgo = now - 60 * 60 * 1000;

  const recent = tweets.filter((t) => {
    const ms = new Date(t.createdAt).getTime();
    return ms >= oneHourAgo && ms <= now;
  });

  // Top hashtags last 1h
  const tagCount = new Map<string, number>();
  recent.forEach((t) =>
    t.hashtags.forEach((h) => tagCount.set(h, (tagCount.get(h) ?? 0) + 1)),
  );
  const topHashtags = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // Top sources by velocity (posts in last 1h)
  const srcCount = new Map<string, number>();
  recent.forEach((t) => srcCount.set(t.sourceId, (srcCount.get(t.sourceId) ?? 0) + 1));
  const topSources = [...srcCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ source: sourcesById[id], count }))
    .filter((x) => x.source);

  // Sentiment: average of scoreSentiment over recent tweets, normalised to -1..1
  let sum = 0;
  let counted = 0;
  recent.forEach((t) => {
    const s = scoreSentiment(t.text);
    if (s !== 0) {
      sum += s;
      counted += 1;
    }
  });
  const sentiment = counted === 0 ? 0 : Math.max(-1, Math.min(1, sum / counted));

  // Trending sessions
  const sessCount = new Map<string, number>();
  recent.forEach((t) => {
    if (t.sessionId) sessCount.set(t.sessionId, (sessCount.get(t.sessionId) ?? 0) + 1);
  });
  const trendingSessions = [...sessCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ session: sessionsById[id], count }))
    .filter((x) => x.session);

  return {
    topHashtags,
    topSources,
    sentiment,
    sentimentSamples: counted,
    trendingSessions,
    recentCount: recent.length,
  };
}

export function LiveSignals({
  tweets,
  sourcesById,
}: {
  tweets: Tweet[];
  sourcesById: Record<string, Source>;
}) {
  // Sessions across all known congresses, indexed by id, for the trending list.
  const { data: congresses = [] } = useQuery({
    queryKey: ["congresses"],
    queryFn: () => feedService.listCongresses(),
  });
  const { data: allSessions = [] } = useQuery({
    queryKey: ["sessions-all", congresses.map((c) => c.id).join(",")],
    queryFn: async () => {
      const lists = await Promise.all(
        congresses.map((c) => feedService.listSessions(c.id)),
      );
      return lists.flat();
    },
    enabled: congresses.length > 0,
  });
  const sessionsById = React.useMemo(
    () => Object.fromEntries(allSessions.map((s) => [s.id, s])) as Record<string, Session>,
    [allSessions],
  );

  const sig = React.useMemo(
    () => aggregateSignals(tweets, sourcesById, sessionsById),
    [tweets, sourcesById, sessionsById],
  );

  return (
    <Panel
      title="Live signals"
      className="h-full"
      bodyClassName="p-3 overflow-auto"
      actions={
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted px-2">
          last 1h · {sig.recentCount}
        </span>
      }
    >
      <div className="space-y-4">
        <SignalSection icon={<Hash className="w-3 h-3" />} label="Top hashtags">
          {sig.topHashtags.length === 0 && <Empty />}
          <ul className="space-y-1">
            {sig.topHashtags.map(([tag, n]) => (
              <li
                key={tag}
                className="flex items-center justify-between text-[12px]"
              >
                <span className="font-mono text-accent truncate">{tag}</span>
                <span className="font-mono text-text-muted">{n}</span>
              </li>
            ))}
          </ul>
        </SignalSection>

        <SignalSection icon={<TrendingUp className="w-3 h-3" />} label="Top sources">
          {sig.topSources.length === 0 && <Empty />}
          <ul className="space-y-1">
            {sig.topSources.map(({ source, count }) => (
              <li
                key={source.id}
                className="flex items-center justify-between text-[12px] gap-2"
              >
                <span className="font-mono text-accent truncate">{source.handle}</span>
                <span className="text-text-muted truncate flex-1 text-[11px] text-right">
                  {source.displayName}
                </span>
                <span className="font-mono text-text-muted w-8 text-right">{count}</span>
              </li>
            ))}
          </ul>
        </SignalSection>

        <SignalSection icon={<Activity className="w-3 h-3" />} label="Sentiment">
          <SentimentGauge value={sig.sentiment} samples={sig.sentimentSamples} />
        </SignalSection>

        <SignalSection icon={<Flame className="w-3 h-3" />} label="Trending sessions">
          {sig.trendingSessions.length === 0 && <Empty />}
          <ul className="space-y-2">
            {sig.trendingSessions.map(({ session, count }) => (
              <li key={session.id} className="text-[12px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-text-primary truncate">{session.title}</span>
                  <span className="font-mono text-accent">{count}</span>
                </div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                  {session.track} · {session.room}
                </div>
              </li>
            ))}
          </ul>
        </SignalSection>
      </div>
    </Panel>
  );
}

function Empty() {
  return <div className="text-[11px] font-mono text-text-muted">No signal yet.</div>;
}

function SignalSection({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-text-muted mb-1.5">
        {icon}
        {label}
      </div>
      {children}
    </section>
  );
}

function SentimentGauge({ value, samples }: { value: number; samples: number }) {
  // value in [-1, 1] → percentage [0, 100]
  const pct = Math.round((value + 1) * 50);
  const label =
    value > 0.25
      ? "Positive"
      : value < -0.25
        ? "Critical"
        : samples === 0
          ? "—"
          : "Mixed";
  const color =
    value > 0.25
      ? "var(--success)"
      : value < -0.25
        ? "var(--destructive, #EF4444)"
        : "var(--warning)";
  return (
    <div>
      <div className="relative h-2 w-full bg-panel-elevated border border-border rounded-full overflow-hidden">
        <span
          className="absolute top-0 bottom-0 left-1/2 w-px bg-border"
          aria-hidden
        />
        <span
          className="absolute top-0 bottom-0 w-1.5 rounded-full transition-[left]"
          style={{ left: `calc(${pct}% - 3px)`, background: color }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-text-muted">
        <span>critical</span>
        <span style={{ color }}>{label}</span>
        <span>positive</span>
      </div>
      <div className="text-[10px] font-mono text-text-muted mt-0.5">
        {samples} sentiment-bearing posts
      </div>
    </div>
  );
}

export default LiveSignals;