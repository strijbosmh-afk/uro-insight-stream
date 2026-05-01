import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Sliders,
  RefreshCw,
  Clock,
  MapPin,
  Users,
  ChevronDown,
  Filter,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { feedService } from "@/services/feedService";
import type {
  Abstract,
  Session,
  Source,
  Summary,
  Tweet,
} from "@/types";
import { TweetCard } from "@/components/feed/TweetCard";
import { useSummaryPrefs } from "@/hooks/useSummaryPrefs";
import { CustomizeSummaryDrawer } from "./CustomizeSummaryDrawer";
import { getAiService } from "@/services/aiService";
import { getAiSettings } from "@/hooks/useAiSettings";
import { cn } from "@/lib/utils";

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
function fmtClock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  sessionId: string;
}

export function SessionDetail({ sessionId }: Props) {
  const qc = useQueryClient();
  const [selectedAbstract, setSelectedAbstract] = React.useState<string | null>(
    null,
  );
  const [tweetFilter, setTweetFilter] = React.useState<{
    sourceId?: string;
    hashtag?: string;
  }>({});
  const [flashTweetId, setFlashTweetId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const tweetRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const { prefs, save, reset } = useSummaryPrefs();

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => feedService.getSession(sessionId),
  });
  const { data: abstracts = [] } = useQuery({
    queryKey: ["abstracts", sessionId],
    queryFn: () => feedService.listAbstracts(sessionId),
    enabled: Boolean(sessionId),
  });
  const { data: sources = [] } = useQuery({
    queryKey: ["sources"],
    queryFn: () => feedService.listSources(),
  });
  const sourceMap = React.useMemo(
    () => new Map(sources.map((s) => [s.id, s])),
    [sources],
  );

  const targetType: Summary["targetType"] = selectedAbstract
    ? "abstract"
    : "session";
  const targetId = selectedAbstract ?? sessionId;

  const { data: allTweets = [] } = useQuery({
    queryKey: ["session-tweets", sessionId],
    queryFn: () => feedService.listTweets({ sessionId, limit: 500 }),
    enabled: Boolean(sessionId),
  });

  const scopedTweets = React.useMemo(() => {
    let out = allTweets;
    if (selectedAbstract) {
      out = out.filter((t) => t.abstractId === selectedAbstract);
    }
    if (tweetFilter.sourceId) {
      out = out.filter((t) => t.sourceId === tweetFilter.sourceId);
    }
    if (tweetFilter.hashtag) {
      const k = tweetFilter.hashtag.toLowerCase().replace(/^#/, "");
      out = out.filter((t) =>
        t.hashtags.some((h) => h.toLowerCase().replace(/^#/, "") === k),
      );
    }
    return out;
  }, [allTweets, selectedAbstract, tweetFilter]);

  const { data: summary } = useQuery({
    queryKey: ["summary", targetType, targetId, prefs],
    queryFn: () => feedService.getSummary(targetType, targetId),
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const ai = getAiService();
      const aiSettings = getAiSettings();
      const title =
        (selectedAbstract?.title || session?.title) ?? "Untitled target";
      const newSummary = await ai.summarize({
        tweets: scopedTweets,
        context: {
          type: targetType,
          targetId,
          title,
          specialty: undefined,
        },
        options: {
          maxBullets: prefs.maxBullets,
          tone: prefs.tone,
          language: prefs.language,
          systemPrompt: prefs.systemPrompt,
          promptTemplate: prefs.userTemplate,
          model: aiSettings.model,
        },
      });
      return feedService.saveSummary(targetType, targetId, newSummary);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["summary", targetType, targetId] });
      toast.success("Summary regenerated");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to regenerate");
    },
  });

  const jumpToTweet = (tweetId: string) => {
    const node = tweetRefs.current[tweetId];
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashTweetId(tweetId);
      window.setTimeout(() => setFlashTweetId(null), 1600);
    } else {
      toast.message("Tweet not in current filter — clearing filters", {
        description: "Try again after the list updates.",
      });
      setTweetFilter({});
    }
  };

  const uniqueSources = React.useMemo(() => {
    const ids = new Set(scopedTweets.map((t) => t.sourceId));
    return Array.from(ids)
      .map((id) => sourceMap.get(id))
      .filter(Boolean) as Source[];
  }, [scopedTweets, sourceMap]);

  const uniqueHashtags = React.useMemo(() => {
    const c = new Map<string, number>();
    scopedTweets.forEach((t) =>
      t.hashtags.forEach((h) => {
        const k = h.replace(/^#/, "").toLowerCase();
        c.set(k, (c.get(k) ?? 0) + 1);
      }),
    );
    return Array.from(c.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [scopedTweets]);

  if (sessionLoading || !session) {
    return (
      <div className="p-6 text-text-muted text-[12px] font-mono">
        Loading session…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <Link
          to="/congresses/$congressId"
          params={{ congressId: session.congressId }}
          className="inline-flex items-center gap-1 text-[12px] text-text-muted hover:text-accent"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to congress
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setDrawerOpen(true)}
          >
            <Sliders className="w-3.5 h-3.5 mr-1.5" />
            Customize summary
          </Button>
        </div>
      </div>

      {/* 3-column grid */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3">
        {/* LEFT — Session metadata + abstracts */}
        <Panel
          title="Session"
          className="col-span-12 lg:col-span-3 min-h-0"
          bodyClassName="overflow-y-auto"
        >
          <SessionMeta session={session} />
          <div className="mt-5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
              Abstracts · {abstracts.length}
            </div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedAbstract(null)}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded-[2px] border text-[12px] transition-colors",
                  selectedAbstract === null
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-text-muted hover:text-text-primary hover:border-accent/40",
                )}
              >
                <span className="font-mono text-[10px] uppercase tracking-wider">
                  All · session view
                </span>
              </button>
              {abstracts.map((a) => (
                <AbstractRow
                  key={a.id}
                  abstract={a}
                  selected={selectedAbstract === a.id}
                  onSelect={() => setSelectedAbstract(a.id)}
                />
              ))}
            </div>
          </div>
        </Panel>

        {/* CENTER — AI summary */}
        <Panel
          title={
            <span>
              AI summary{" "}
              <span className="text-text-muted font-normal normal-case tracking-normal">
                · {targetType === "abstract" ? "abstract" : "session-wide"}
              </span>
            </span>
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              disabled={regenerate.isPending}
              onClick={() => regenerate.mutate()}
            >
              <RefreshCw
                className={cn(
                  "w-3.5 h-3.5 mr-1",
                  regenerate.isPending && "animate-spin",
                )}
              />
              Regenerate
            </Button>
          }
          loading={regenerate.isPending}
          className="col-span-12 lg:col-span-5 min-h-0"
          bodyClassName="overflow-y-auto"
        >
          {!summary ? (
            <EmptySummary onGenerate={() => regenerate.mutate()} />
          ) : (
            <div className="space-y-3">
              <SubPanel title="Key takeaways">
                <ul className="space-y-1.5">
                  {summary.bulletPoints.slice(0, prefs.maxBullets).map((b, i) => (
                    <li
                      key={i}
                      className="flex gap-2 text-[13px] text-text-primary"
                    >
                      <span className="font-mono text-accent text-[11px] mt-0.5">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </SubPanel>

              <SubPanel title={`Notable quotes · ${summary.keyQuotes.length}`}>
                <div className="space-y-2">
                  {summary.keyQuotes.map((q, i) => {
                    const src = sourceMap.get(q.sourceId);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => jumpToTweet(q.tweetId)}
                        className="w-full text-left flex gap-2.5 p-2 border border-border rounded-[2px] hover:border-accent/50 transition-colors group"
                      >
                        <img
                          src={src?.avatarUrl}
                          alt=""
                          className="w-7 h-7 rounded-[2px] border border-border flex-shrink-0"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-mono text-accent">
                            @{src?.handle.replace(/^@/, "") ?? "unknown"}
                            <span className="ml-2 text-text-muted opacity-0 group-hover:opacity-100">
                              jump →
                            </span>
                          </div>
                          <p className="mt-0.5 text-[12px] italic text-text-primary">
                            “{q.quote}”
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SubPanel>

              <SubPanel title="Sentiment & reception">
                <SentimentGauge sentiment={summary.sentiment} />
                <p className="mt-2 text-[12px] text-text-muted">
                  {sentimentBlurb(summary.sentiment)}
                </p>
              </SubPanel>

              {summary.controversies.length > 0 && (
                <SubPanel title="Controversies">
                  <ul className="space-y-1 list-disc pl-5 text-[12px] text-text-primary">
                    {summary.controversies.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </SubPanel>
              )}

              <SubPanel title="Open questions">
                <ul className="space-y-1 list-disc pl-5 text-[12px] text-text-primary">
                  {summary.takeaways.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </SubPanel>

              <div className="pt-2 mt-2 border-t border-border flex items-center gap-3 text-[10px] font-mono text-text-muted">
                <span>generated {fmtClock(summary.generatedAt)}</span>
                <span>·</span>
                <span>{summary.tweetCount} tweets</span>
                <span>·</span>
                <span>model: {summary.modelUsed}</span>
                <button
                  type="button"
                  onClick={() => regenerate.mutate()}
                  className="ml-auto inline-flex items-center gap-1 hover:text-accent"
                >
                  <RefreshCw className="w-3 h-3" />
                  regenerate
                </button>
              </div>
            </div>
          )}
        </Panel>

        {/* RIGHT — source tweets */}
        <Panel
          title={`Source tweets · ${scopedTweets.length}`}
          actions={
            (tweetFilter.sourceId || tweetFilter.hashtag) && (
              <button
                type="button"
                onClick={() => setTweetFilter({})}
                className="inline-flex items-center gap-1 text-[10px] font-mono text-text-muted hover:text-accent"
              >
                <X className="w-3 h-3" /> clear
              </button>
            )
          }
          className="col-span-12 lg:col-span-4 min-h-0"
          bodyClassName="overflow-y-auto"
        >
          <FilterStrip
            sources={uniqueSources}
            hashtags={uniqueHashtags}
            value={tweetFilter}
            onChange={setTweetFilter}
          />
          <div className="mt-3 space-y-2">
            {scopedTweets.length === 0 && (
              <div className="text-[12px] text-text-muted py-8 text-center font-mono">
                no matching tweets
              </div>
            )}
            {scopedTweets.map((t) => (
              <div
                key={t.id}
                ref={(el) => {
                  tweetRefs.current[t.id] = el;
                }}
                className={cn(
                  "transition-shadow rounded-[3px]",
                  flashTweetId === t.id &&
                    "ring-2 ring-accent shadow-[0_0_0_2px_var(--accent)]",
                )}
              >
                <TweetCard tweet={t} source={sourceMap.get(t.sourceId)} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <CustomizeSummaryDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        prefs={prefs}
        onSave={save}
        onReset={reset}
      />
    </div>
  );
}

function SessionMeta({ session }: { session: Session }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
          Track
        </div>
        <div className="text-[11px] font-mono uppercase tracking-wider text-accent">
          {session.track}
        </div>
      </div>
      <h1 className="text-[15px] font-semibold text-text-primary leading-snug">
        {session.title}
      </h1>
      <div className="space-y-1.5 text-[12px] text-text-muted">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" />
          <span className="font-mono">
            {fmtDay(session.startTime)} · {fmtTime(session.startTime)}–
            {fmtTime(session.endTime)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5" />
          <span className="font-mono">{session.room}</span>
        </div>
        <div className="flex items-start gap-2">
          <Users className="w-3.5 h-3.5 mt-0.5" />
          <div>
            {session.chairs.map((c, i) => (
              <div key={i} className="text-text-primary text-[12px]">
                {c}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AbstractRow({
  abstract,
  selected,
  onSelect,
}: {
  abstract: Abstract;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left p-2 rounded-[2px] border text-[12px] transition-colors",
        selected
          ? "border-accent bg-accent/10"
          : "border-border hover:border-accent/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-accent">
          {abstract.abstractNumber}
        </span>
      </div>
      <div className="text-text-primary text-[12px] leading-snug mt-0.5">
        {abstract.title}
      </div>
      <div className="text-[10px] font-mono text-text-muted mt-1 truncate">
        {abstract.authors.slice(0, 3).join(", ")}
        {abstract.authors.length > 3 ? " et al." : ""}
      </div>
    </button>
  );
}

function SubPanel({
  title,
  children,
  defaultOpen = true,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="border border-border rounded-[3px] bg-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 h-8 border-b border-border bg-panel-elevated/40"
      >
        <ChevronDown
          className={cn(
            "w-3 h-3 text-text-muted transition-transform",
            !open && "-rotate-90",
          )}
        />
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-primary">
          {title}
        </span>
      </button>
      {open && <div className="p-3">{children}</div>}
    </section>
  );
}

function SentimentGauge({ sentiment }: { sentiment: Summary["sentiment"] }) {
  const map: Record<Summary["sentiment"], { label: string; pct: number; color: string }> = {
    positive: { label: "Positive", pct: 85, color: "var(--success)" },
    mixed: { label: "Mixed", pct: 55, color: "var(--warning)" },
    critical: { label: "Critical", pct: 25, color: "var(--danger)" },
    neutral: { label: "Neutral", pct: 50, color: "var(--accent)" },
  };
  const v = map[sentiment];
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
          tone
        </span>
        <span
          className="text-[12px] font-mono font-semibold"
          style={{ color: v.color }}
        >
          {v.label}
        </span>
      </div>
      <div className="h-1.5 w-full bg-panel-elevated rounded-full overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${v.pct}%`, background: v.color }}
        />
      </div>
    </div>
  );
}

function sentimentBlurb(s: Summary["sentiment"]) {
  switch (s) {
    case "positive":
      return "Reception was broadly favourable; few dissenting voices.";
    case "critical":
      return "Audience pushed back on methodology and applicability.";
    case "mixed":
      return "Enthusiasm tempered by methodological caveats.";
    default:
      return "Discussion was descriptive; no strong polarity detected.";
  }
}

function FilterStrip({
  sources,
  hashtags,
  value,
  onChange,
}: {
  sources: Source[];
  hashtags: [string, number][];
  value: { sourceId?: string; hashtag?: string };
  onChange: (v: { sourceId?: string; hashtag?: string }) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-text-muted">
        <Filter className="w-3 h-3" /> filter
      </div>
      <div className="flex flex-wrap gap-1">
        {sources.slice(0, 8).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() =>
              onChange({
                ...value,
                sourceId: value.sourceId === s.id ? undefined : s.id,
              })
            }
            className={cn(
              "h-6 px-2 text-[10px] font-mono rounded-[2px] border transition-colors",
              value.sourceId === s.id
                ? "border-accent text-accent bg-accent/10"
                : "border-border text-text-muted hover:text-text-primary",
            )}
          >
            @{s.handle.replace(/^@/, "")}
          </button>
        ))}
      </div>
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {hashtags.map(([h, n]) => (
            <button
              key={h}
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  hashtag: value.hashtag === h ? undefined : h,
                })
              }
              className={cn(
                "h-6 px-2 text-[10px] font-mono rounded-[2px] border transition-colors",
                value.hashtag === h
                  ? "border-accent text-accent bg-accent/10"
                  : "border-border text-text-muted hover:text-text-primary",
              )}
            >
              #{h} <span className="opacity-60">{n}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptySummary({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="text-center py-10">
      <div className="text-[12px] text-text-muted mb-3 font-mono">
        no summary generated yet
      </div>
      <Button size="sm" onClick={onGenerate}>
        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Generate now
      </Button>
    </div>
  );
}

/* ----------- mock generation helpers ----------- */

function synthesizeBullets(tweets: Tweet[], max: number, tone: string): string[] {
  if (tweets.length === 0) {
    return ["No tweets available yet for this scope."];
  }
  const out: string[] = [];
  const sample = tweets.slice(0, Math.min(tweets.length, max));
  sample.forEach((t, i) => {
    const text = t.text.replace(/https?:\S+/g, "").trim();
    const trimmed = text.length > 110 ? text.slice(0, 110) + "…" : text;
    out.push(
      tone === "conversational"
        ? `Folks are saying: ${trimmed}`
        : tone === "neutral"
          ? trimmed
          : `Reported observation ${i + 1}: ${trimmed}`,
    );
  });
  return out.slice(0, max);
}

function inferSentiment(tweets: Tweet[]): Summary["sentiment"] {
  if (tweets.length === 0) return "neutral";
  const text = tweets.map((t) => t.text.toLowerCase()).join(" ");
  const pos = (text.match(/\b(promising|impressive|excellent|breakthrough|positive)\b/g) || []).length;
  const neg = (text.match(/\b(concern|skeptic|disappoint|unclear|caveat|limitation|bias)\b/g) || []).length;
  if (pos > neg + 2) return "positive";
  if (neg > pos + 2) return "critical";
  if (pos + neg > 3) return "mixed";
  return "neutral";
}

function synthesizeControversies(tweets: Tweet[]): string[] {
  const hits = tweets
    .filter((t) => /\b(disagree|controversial|debate|pushback|caveat|bias)\b/i.test(t.text))
    .slice(0, 2)
    .map((t) => (t.text.length > 120 ? t.text.slice(0, 120) + "…" : t.text));
  return hits;
}

export default SessionDetail;