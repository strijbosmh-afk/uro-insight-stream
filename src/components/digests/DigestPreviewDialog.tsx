import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { previewDigest } from "@/serverFns/digests";

export interface DigestPreviewInput {
  source_ids: string[];
  specialty_id: string | null;
  congress_id: string | null;
  hashtags: string[];
  digest_name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  input: DigestPreviewInput;
}

type PreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "empty"; window_start: string; window_end: string }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      rendered: {
        digest_name: string;
        window_start: string;
        window_end: string;
        tweet_count: number;
        takeaways: string[];
        key_quotes: Array<{ tweet_id: string; text: string; author_handle: string }>;
        sentiment: "positive" | "neutral" | "mixed" | "negative";
        model: string;
      };
      from_cache: boolean;
      cached_at: string;
    };

function relativeFromNow(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  const m = Math.round(ageMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

function formatRange(start: string, end: string): string {
  return `${start.slice(0, 10)} → ${end.slice(0, 10)}`;
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "bg-success/15 text-success border-success/30",
  neutral: "bg-panel-elevated text-text-muted border-border",
  mixed: "bg-warning/15 text-warning border-warning/30",
  negative: "bg-danger/15 text-danger border-danger/30",
};

export function DigestPreviewDialog({ open, onClose, input }: Props) {
  const isMobile = useIsMobile();
  const previewFn = useServerFn(previewDigest);
  const [state, setState] = React.useState<PreviewState>({ kind: "idle" });
  const lastRunRef = React.useRef<string | null>(null);

  const runPreview = React.useCallback(
    async (bypassCache: boolean) => {
      setState({ kind: "loading" });
      try {
        const res = await previewFn({
          data: {
            source_ids: input.source_ids,
            specialty_id: input.specialty_id,
            congress_id: input.congress_id,
            hashtags: input.hashtags,
            window_days: 7,
            digest_name: input.digest_name,
            bypass_cache: bypassCache,
          },
        });
        if (res.status === "ok") {
          setState({
            kind: "ok",
            rendered: res.rendered,
            from_cache: res.from_cache,
            cached_at: res.cached_at,
          });
        } else if (res.status === "empty") {
          setState({
            kind: "empty",
            window_start: res.window_start,
            window_end: res.window_end,
          });
        } else {
          const reason = res.reason;
          const message =
            reason === "rate_limited"
              ? "Too many previews this hour. Try again later (max 20/hour)."
              : reason === "no_bindings"
                ? "Add at least one source, specialty, congress, or hashtag first."
                : "Could not generate the preview. Try again.";
          setState({ kind: "error", message });
        }
      } catch (e) {
        setState({
          kind: "error",
          message: e instanceof Error ? e.message : "Preview failed",
        });
      }
    },
    [previewFn, input],
  );

  // Auto-run once when opened, keyed on a serialised snapshot of the input.
  const inputKey = React.useMemo(
    () =>
      JSON.stringify({
        s: [...input.source_ids].sort(),
        sp: input.specialty_id,
        c: input.congress_id,
        h: [...input.hashtags].sort(),
      }),
    [input.source_ids, input.specialty_id, input.congress_id, input.hashtags],
  );

  React.useEffect(() => {
    if (!open) {
      lastRunRef.current = null;
      return;
    }
    if (lastRunRef.current === inputKey) return;
    lastRunRef.current = inputKey;
    void runPreview(false);
  }, [open, inputKey, runPreview]);

  const title = `Preview · ${input.digest_name?.trim() || "Untitled digest"}`;

  const Body = (
    <PreviewBody
      title={title}
      state={state}
      onRefresh={() => void runPreview(true)}
      onClose={onClose}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent
          side="bottom"
          className="h-[90vh] max-h-[90vh] p-0 overflow-y-auto"
        >
          {Body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        {Body}
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({
  title,
  state,
  onRefresh,
  onClose,
}: {
  title: string;
  state: PreviewState;
  onRefresh: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-0.5">
            Weekly preview
          </div>
          <h2 className="text-[15px] font-semibold text-text-primary truncate">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-text-muted hover:text-text-primary"
          aria-label="Close preview"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-6 py-5">
        {state.kind === "loading" && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
            <p className="text-[13px] text-text-muted">
              Generating preview from up to 50 tweets in the last 7 days…
            </p>
          </div>
        )}

        {state.kind === "empty" && (
          <div className="py-10 text-center space-y-3">
            <div className="text-[14px] text-text-primary">
              No tweets matched your filters in the last 7 days.
            </div>
            <p className="text-[12px] text-text-muted max-w-md mx-auto">
              Try adding more sources, picking a different specialty, or removing
              narrow hashtags. Window: {formatRange(state.window_start, state.window_end)}.
            </p>
            <Button variant="outline" size="sm" onClick={onClose}>
              Adjust filters
            </Button>
          </div>
        )}

        {state.kind === "error" && (
          <div className="py-10 text-center space-y-3">
            <div className="text-[13px] text-danger">{state.message}</div>
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Try again
            </Button>
          </div>
        )}

        {state.kind === "ok" && (
          <div className="space-y-6">
            <div>
              <div className="text-[11px] font-mono text-text-muted">
                Based on {state.rendered.tweet_count} tweets from{" "}
                {formatRange(state.rendered.window_start, state.rendered.window_end)}
              </div>
              {state.from_cache && (
                <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-text-muted">
                  cached · generated {relativeFromNow(state.cached_at)}
                </div>
              )}
            </div>

            <section>
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-2">
                Takeaways
              </div>
              <ul className="space-y-2">
                {state.rendered.takeaways.map((t, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-[13px] leading-snug text-text-primary"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 mt-1" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </section>

            {state.rendered.key_quotes.length > 0 && (
              <section>
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-2">
                  Key quotes
                </div>
                <div className="space-y-3">
                  {state.rendered.key_quotes.map((q) => (
                    <blockquote
                      key={q.tweet_id}
                      className="border-l-2 border-accent pl-3 text-[13px] text-text-primary"
                    >
                      <p className="italic">"{q.text}"</p>
                      <footer className="mt-1 text-[11px] font-mono text-text-muted">
                        —{" "}
                        <a
                          href={`https://x.com/${q.author_handle}/status/${q.tweet_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-accent"
                        >
                          @{q.author_handle}
                        </a>
                      </footer>
                    </blockquote>
                  ))}
                </div>
              </section>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span
                role="img"
                aria-label={`Sentiment: ${state.rendered.sentiment}`}
                className={
                  "inline-flex items-center px-2 py-0.5 rounded-[3px] border text-[10px] font-mono uppercase tracking-[0.14em] " +
                  (SENTIMENT_COLOR[state.rendered.sentiment] ?? SENTIMENT_COLOR.neutral)
                }
              >
                {state.rendered.sentiment}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-text-muted">
                  {state.rendered.model}
                </span>
                <Button variant="outline" size="sm" onClick={onRefresh}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh preview
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DigestPreviewDialog;