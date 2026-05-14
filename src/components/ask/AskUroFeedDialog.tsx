import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  Heart,
  Repeat2,
  MessageCircle,
  ExternalLink,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  askUroFeed,
  listAskRecent,
  listAskStarters,
  suggestAskSources,
  type SourceSuggestion,
} from "@/serverFns/ask";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type Scope = "all" | "following" | "specialty";
type Window = 7 | 30 | 90;

type AskTweet = {
  id: string;
  source_id: string | null;
  author_handle: string;
  author_display_name: string | null;
  text: string;
  created_at: string;
  like_count: number | null;
  retweet_count: number | null;
  reply_count: number | null;
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function AskUroFeedDialog({
  open,
  onOpenChange,
  initialQuery,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialQuery?: string;
}) {
  const isMobile = useIsMobile();
  const Wrapper = isMobile ? MobileShell : DesktopShell;
  return (
    <Wrapper open={open} onOpenChange={onOpenChange}>
      <AskBody initialQuery={initialQuery} onClose={() => onOpenChange(false)} />
    </Wrapper>
  );
}

function DesktopShell({
  open,
  onOpenChange,
  children,
}: React.PropsWithChildren<{ open: boolean; onOpenChange: (v: boolean) => void }>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[85vh] flex flex-col overflow-hidden">
        <DialogTitle className="sr-only">Ask UroFeed</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function MobileShell({
  open,
  onOpenChange,
  children,
}: React.PropsWithChildren<{ open: boolean; onOpenChange: (v: boolean) => void }>) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] p-0 flex flex-col">
        <SheetTitle className="sr-only">Ask UroFeed</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}

function AskBody({
  initialQuery,
  onClose,
}: {
  initialQuery?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = React.useState(initialQuery ?? "");
  const [scope, setScope] = React.useState<Scope>("following");
  const [windowDays, setWindowDays] = React.useState<Window>(30);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const tweetRefs = React.useRef<Record<string, HTMLLIElement | null>>({});

  // ── Author autosuggest ────────────────────────────────────────────────
  const [caret, setCaret] = React.useState(0);
  const [suggestOpen, setSuggestOpen] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const token = React.useMemo(() => extractToken(query, caret), [query, caret]);
  const [debouncedTerm, setDebouncedTerm] = React.useState("");
  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedTerm(token?.term ?? ""), 140);
    return () => clearTimeout(id);
  }, [token?.term]);
  const { data: suggestions = [] } = useQuery({
    queryKey: ["ask-suggest", debouncedTerm],
    queryFn: () =>
      suggestAskSources({ data: { term: debouncedTerm, limit: 6 } }),
    enabled: debouncedTerm.length >= 2,
    staleTime: 60_000,
  });
  React.useEffect(() => {
    setActiveIdx(0);
  }, [suggestions]);
  const showSuggest =
    suggestOpen && (token?.term.length ?? 0) >= 2 && suggestions.length > 0;

  const applySuggestion = (s: SourceSuggestion) => {
    if (!token) return;
    const replacement = `@${s.handle} `;
    const next =
      query.slice(0, token.start) + replacement + query.slice(token.end);
    setQuery(next);
    setSuggestOpen(false);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const pos = token.start + replacement.length;
      el.focus();
      el.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  React.useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, []);

  const { data: starters = [] } = useQuery({
    queryKey: ["ask-starters"],
    queryFn: () => listAskStarters(),
  });
  const { data: recent = [] } = useQuery({
    queryKey: ["ask-recent"],
    queryFn: () => listAskRecent(),
  });

  const ask = useMutation({
    mutationFn: (vars: { q: string; scope: Scope; window_days: Window }) =>
      askUroFeed({
        data: {
          query: vars.q,
          scope: vars.scope,
          window_days: vars.window_days,
          max_sources: 30,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ask-recent"] });
    },
  });

  const submit = (q?: string, opts?: { scope?: Scope; window?: Window }) => {
    const text = (q ?? query).trim();
    if (text.length < 3) return;
    setQuery(text);
    ask.mutate({
      q: text,
      scope: opts?.scope ?? scope,
      window_days: opts?.window ?? windowDays,
    });
  };

  const result = ask.data;
  const isOk = result?.status === "ok";
  const isError = result?.status === "error";

  const scrollToTweet = (id: string) => {
    const el = tweetRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-accent");
    setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 1400);
  };

  // Map tweet id → citation index in the order they first appear in bullets.
  const citationIndex = React.useMemo(() => {
    const map = new Map<string, number>();
    if (!isOk) return map;
    let i = 1;
    for (const b of result.answer.bullets) {
      for (const id of b.cited_tweet_ids) {
        if (!map.has(id)) {
          map.set(id, i++);
        }
      }
    }
    return map;
  }, [isOk, result]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header / input */}
      <div className="px-4 pt-4 pb-3 border-b border-border bg-panel sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            Ask UroFeed
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto w-7 h-7 inline-flex items-center justify-center text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (showSuggest) {
              const pick = suggestions[activeIdx];
              if (pick) {
                applySuggestion(pick);
                return;
              }
            }
            submit();
          }}
        >
          <div className="relative">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
                setSuggestOpen(true);
              }}
              onKeyUp={(e) => {
                const el = e.currentTarget;
                setCaret(el.selectionStart ?? el.value.length);
              }}
              onClick={(e) => {
                const el = e.currentTarget;
                setCaret(el.selectionStart ?? el.value.length);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() =>
                setTimeout(() => setSuggestOpen(false), 120)
              }
              onKeyDown={(e) => {
                if (!showSuggest) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIdx((i) => (i + 1) % suggestions.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIdx(
                    (i) => (i - 1 + suggestions.length) % suggestions.length,
                  );
                } else if (e.key === "Tab") {
                  e.preventDefault();
                  applySuggestion(suggestions[activeIdx]);
                } else if (e.key === "Escape") {
                  setSuggestOpen(false);
                }
              }}
              maxLength={300}
              placeholder={'Ask anything: "What\'s the latest on PSMA imaging?"'}
              className="w-full h-11 bg-panel-elevated border border-border rounded-[3px] px-3 text-[14px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/60"
              autoComplete="off"
              spellCheck={false}
            />
            {showSuggest && (
              <SuggestionList
                items={suggestions}
                activeIdx={activeIdx}
                onPick={applySuggestion}
                onHover={setActiveIdx}
              />
            )}
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <ScopeSelect value={scope} onChange={setScope} />
          <WindowSelect value={windowDays} onChange={setWindowDays} />
          <span className="ml-auto text-[10px] font-mono text-text-muted">
            {query.length}/300
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {ask.isPending && <LoadingState />}

        {!ask.isPending && !result && (
          <StartersAndRecent
            starters={starters}
            recent={recent}
            onPick={(q) => submit(q)}
          />
        )}

        {isError && (
          <ErrorState
            reason={(result as { reason: string }).reason}
            onRetry={() => submit()}
          />
        )}

        {isOk && (
          <AnswerView
            answer={result.answer}
            tweets={result.tweets as AskTweet[]}
            fromCache={result.from_cache}
            cachedAt={result.cached_at}
            citationIndex={citationIndex}
            tweetRefs={tweetRefs}
            onCitationClick={scrollToTweet}
          />
        )}
      </div>
    </div>
  );
}

function ScopeSelect({
  value,
  onChange,
}: {
  value: Scope;
  onChange: (v: Scope) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] font-mono text-text-muted">
      Scope:
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Scope)}
        className="h-7 px-1.5 rounded-[3px] border border-border bg-panel-elevated text-text-primary text-[11px]"
      >
        <option value="following">Following</option>
        <option value="specialty">Specialty</option>
        <option value="all">All</option>
      </select>
    </label>
  );
}

function WindowSelect({
  value,
  onChange,
}: {
  value: Window;
  onChange: (v: Window) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11px] font-mono text-text-muted">
      Window:
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as Window)}
        className="h-7 px-1.5 rounded-[3px] border border-border bg-panel-elevated text-text-primary text-[11px]"
      >
        <option value={7}>Last 7 days</option>
        <option value={30}>Last 30 days</option>
        <option value={90}>Last 90 days</option>
      </select>
    </label>
  );
}

function LoadingState() {
  const [stage, setStage] = React.useState<"searching" | "synth">("searching");
  React.useEffect(() => {
    const t = setTimeout(() => setStage("synth"), 1400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex items-center gap-3 text-[13px] text-text-muted">
      <Loader2 className="w-4 h-4 animate-spin text-accent" />
      {stage === "searching" ? "Searching corpus…" : "Synthesising answer…"}
    </div>
  );
}

function ErrorState({
  reason,
  onRetry,
}: {
  reason: string;
  onRetry: () => void;
}) {
  const messages: Record<string, string> = {
    rate_limited:
      "You've hit the per-user limit (30 questions/hour). Try again shortly.",
    global_rate_limited:
      "Service is busy right now. Try again in a few minutes.",
    llm_failed:
      "The model didn't return a usable answer. Please try rephrasing the question.",
    invalid_query: "Question is invalid.",
  };
  return (
    <div className="border border-amber-500/40 bg-amber-500/5 rounded-[3px] p-4 flex items-start gap-3">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1 text-[13px] text-text-primary">
        <div className="font-medium mb-1">Couldn't answer</div>
        <div className="text-text-muted">{messages[reason] ?? reason}</div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 h-8 px-3 rounded-[3px] border border-border text-[12px] font-mono hover:border-accent/60"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function StartersAndRecent({
  starters,
  recent,
  onPick,
}: {
  starters: string[];
  recent: Array<{ fingerprint: string; query_text: string; created_at: string }>;
  onPick: (q: string) => void;
}) {
  return (
    <div className="space-y-6">
      {recent.length > 0 && (
        <section>
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
            Recent questions
          </div>
          <ul className="space-y-1">
            {recent.map((r) => (
              <li key={r.fingerprint}>
                <button
                  type="button"
                  onClick={() => onPick(r.query_text)}
                  className="w-full text-left px-3 py-2 rounded-[3px] border border-border bg-panel hover:border-accent/40 text-[13px] text-text-primary"
                >
                  <span className="line-clamp-1">{r.query_text}</span>
                  <span className="text-[10px] font-mono text-text-muted">
                    {relativeTime(r.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {starters.length > 0 && (
        <section>
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
            Try one of these
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {starters.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onPick(s)}
                className="text-left px-3 py-2 rounded-[3px] border border-border bg-panel hover:border-accent/40 text-[13px] text-text-primary"
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      )}
      {starters.length === 0 && recent.length === 0 && (
        <div className="text-text-muted text-[13px]">
          Ask anything about the urology corpus.
        </div>
      )}
    </div>
  );
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "high",
  medium: "medium",
  low: "low",
  insufficient_data: "insufficient",
};

function AnswerView({
  answer,
  tweets,
  fromCache,
  cachedAt,
  citationIndex,
  tweetRefs,
  onCitationClick,
}: {
  answer: {
    bullets: Array<{ text: string; cited_tweet_ids: string[] }>;
    confidence: "high" | "medium" | "low" | "insufficient_data";
    caveat: string | null;
    tweet_count_used: number;
  };
  tweets: AskTweet[];
  fromCache: boolean;
  cachedAt: string;
  citationIndex: Map<string, number>;
  tweetRefs: React.MutableRefObject<Record<string, HTMLLIElement | null>>;
  onCitationClick: (id: string) => void;
}) {
  const insufficient = answer.confidence === "insufficient_data";
  return (
    <div className="space-y-4">
      {/* Meta line */}
      <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted flex-wrap">
        <span>
          Based on {answer.tweet_count_used} tweet
          {answer.tweet_count_used === 1 ? "" : "s"}
        </span>
        <span>·</span>
        <span>
          Confidence:{" "}
          <span
            className={cn(
              insufficient ? "text-amber-500" : "text-accent",
              "uppercase",
            )}
          >
            {CONFIDENCE_LABEL[answer.confidence]}
          </span>
        </span>
        {fromCache && (
          <>
            <span>·</span>
            <span title={new Date(cachedAt).toLocaleString()}>
              cached · {relativeTime(cachedAt)}
            </span>
          </>
        )}
      </div>

      {insufficient && (
        <div className="border border-amber-500/40 bg-amber-500/5 rounded-[3px] p-3 flex items-start gap-2 text-[13px] text-text-primary">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Not enough relevant tweets</div>
            <div className="text-text-muted">
              {answer.caveat ??
                "Try broadening the scope or extending the window."}
            </div>
          </div>
        </div>
      )}

      {/* Bullets */}
      <ul className="space-y-3">
        {answer.bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-[14px] leading-relaxed">
            <span className="text-accent select-none mt-0.5">•</span>
            <div className="flex-1">
              <span className="text-text-primary">{b.text}</span>
              {b.cited_tweet_ids.length > 0 && (
                <span className="ml-1 inline-flex flex-wrap gap-1">
                  {b.cited_tweet_ids.map((id) => {
                    const n = citationIndex.get(id);
                    if (!n) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onCitationClick(id)}
                        className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 text-[10px] font-mono rounded-[2px] border border-accent/40 text-accent hover:bg-accent/10"
                        aria-label={`Source ${n}`}
                      >
                        [{n}]
                      </button>
                    );
                  })}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {answer.caveat && !insufficient && (
        <div className="text-[12px] text-text-muted italic border-l-2 border-border pl-3">
          {answer.caveat}
        </div>
      )}

      {/* Sources */}
      {tweets.length > 0 && (
        <section className="pt-4 border-t border-border">
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-3">
            Source tweets ({tweets.length})
          </div>
          <ul className="space-y-2">
            {tweets.map((t) => {
              const n = citationIndex.get(t.id);
              return (
                <li
                  key={t.id}
                  ref={(el) => {
                    tweetRefs.current[t.id] = el;
                  }}
                  className="border border-border rounded-[3px] p-3 bg-panel transition-shadow"
                >
                  <div className="flex items-center gap-2 mb-1.5 text-[11px] font-mono text-text-muted">
                    {n && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 rounded-[2px] border border-accent/40 text-accent">
                        [{n}]
                      </span>
                    )}
                    <span className="text-text-primary">
                      @{t.author_handle}
                    </span>
                    <span>·</span>
                    <span>{relativeTime(t.created_at)}</span>
                    <a
                      href={`https://x.com/${t.author_handle}/status/${t.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto inline-flex items-center gap-1 hover:text-accent"
                    >
                      <ExternalLink className="w-3 h-3" />
                      open
                    </a>
                  </div>
                  <div className="text-[13px] text-text-primary whitespace-pre-wrap">
                    {t.text}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      {t.like_count ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Repeat2 className="w-3 h-3" />
                      {t.retweet_count ?? 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />
                      {t.reply_count ?? 0}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}