import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { previewDigest } from "@/serverFns/digests";
import { styles, theme } from "@/lib/email-templates/_theme";

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

function fmtDateLong(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

const SENTIMENT_TONE: Record<
  string,
  { bg: string; fg: string; border: string }
> = {
  positive: { bg: "rgba(16,185,129,0.12)", fg: theme.success, border: "rgba(16,185,129,0.4)" },
  neutral: { bg: theme.panelElevated, fg: theme.textMuted, border: theme.border },
  mixed: { bg: "rgba(245,158,11,0.12)", fg: theme.amber, border: "rgba(245,158,11,0.4)" },
  negative: { bg: "rgba(239,68,68,0.12)", fg: theme.danger, border: "rgba(239,68,68,0.4)" },
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
          className="h-[90vh] max-h-[90vh] p-0 overflow-y-auto bg-white"
        >
          {Body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0 bg-white border-0">
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
  const digestName =
    state.kind === "ok" ? state.rendered.digest_name : title.replace(/^Preview · /, "");
  const windowStart = state.kind === "ok" ? state.rendered.window_start : undefined;
  const windowEnd = state.kind === "ok" ? state.rendered.window_end : undefined;
  const totalTweets = state.kind === "ok" ? state.rendered.tweet_count : 0;

  return (
    <div style={styles.main} className="relative">
      {/* Floating close button — overlays the email shell */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute top-3 right-3 z-10 rounded-sm p-1 text-neutral-500 hover:text-neutral-900 bg-white/80"
      >
        <X className="w-4 h-4" />
      </button>

      <div style={styles.outer}>
        {/* Brand bar */}
        <div style={styles.brandBar}>
          <span style={styles.brandAccent}>UROFEED</span>
          {" · CLINICAL CONGRESS INTELLIGENCE"}
        </div>

        {/* Dark panel — mirrors the email body */}
        <div style={styles.panel}>
          <hr style={styles.accentRule} />
          <div style={styles.eyebrow}>Digest · {digestName}</div>
          <h1 style={styles.h1}>Your urology feed digest</h1>

          {state.kind === "ok" && windowStart && windowEnd && (
            <div style={styles.muted}>
              {fmtDateLong(windowStart)} → {fmtDateLong(windowEnd)} · {totalTweets} posts
              {state.from_cache && (
                <>
                  {" · "}
                  <span style={{ ...styles.footer, display: "inline" }}>
                    cached · {relativeFromNow(state.cached_at)}
                  </span>
                </>
              )}
            </div>
          )}

          {state.kind === "loading" && (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: theme.accent }} />
              <p style={{ ...styles.muted, margin: 0 }}>
                Generating preview from up to 50 tweets in the last 7 days…
              </p>
            </div>
          )}

          {state.kind === "empty" && (
            <div className="py-8 text-center space-y-3">
              <div style={styles.text}>
                No tweets matched your filters in the last 7 days.
              </div>
              <p style={{ ...styles.muted, maxWidth: 420, margin: "0 auto" }}>
                Try adding more sources, picking a different specialty, or removing
                narrow hashtags. Window: {formatRange(state.window_start, state.window_end)}.
              </p>
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Adjust filters
                </Button>
              </div>
            </div>
          )}

          {state.kind === "error" && (
            <div className="py-8 text-center space-y-3">
              <div style={{ ...styles.text, color: theme.danger }}>
                {state.message}
              </div>
              <Button variant="outline" size="sm" onClick={onRefresh}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Try again
              </Button>
            </div>
          )}

          {state.kind === "ok" && (
            <>
              {/* Takeaways — bullets */}
              <section style={{ marginTop: 20 }}>
                <div style={{ ...styles.eyebrow, margin: "0 0 10px" }}>Takeaways</div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {state.rendered.takeaways.map((t, i) => (
                    <li
                      key={i}
                      style={{
                        display: "flex",
                        gap: 10,
                        padding: "8px 0",
                        borderTop: i === 0 ? "none" : `1px solid ${theme.border}`,
                        fontFamily: theme.bodyFont,
                        fontSize: 14,
                        color: theme.textPrimary,
                        lineHeight: 1.55,
                      }}
                    >
                      <Sparkles
                        className="shrink-0"
                        style={{ color: theme.accent, width: 14, height: 14, marginTop: 4 }}
                      />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {state.rendered.key_quotes.length > 0 && (
                <section style={{ marginTop: 24 }}>
                  <div style={{ ...styles.eyebrow, margin: "0 0 10px" }}>Key quotes</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {state.rendered.key_quotes.map((q) => (
                      <div
                        key={q.tweet_id}
                        style={{
                          backgroundColor: theme.panelElevated,
                          border: `1px solid ${theme.border}`,
                          borderRadius: 4,
                          padding: "12px 14px",
                        }}
                      >
                        <p
                          style={{
                            fontFamily: theme.bodyFont,
                            fontSize: 13,
                            color: theme.textPrimary,
                            lineHeight: 1.55,
                            margin: "0 0 8px",
                            fontStyle: "italic",
                          }}
                        >
                          “{q.text}”
                        </p>
                        <div
                          style={{
                            fontFamily: theme.monoFont,
                            fontSize: 10,
                            letterSpacing: "0.08em",
                            color: theme.textMuted,
                            margin: 0,
                            textTransform: "uppercase",
                          }}
                        >
                          —{" "}
                          <a
                            href={`https://x.com/${q.author_handle}/status/${q.tweet_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: theme.accent, textDecoration: "none" }}
                          >
                            @{q.author_handle}
                          </a>
                          {" · "}
                          <a
                            href={`https://x.com/${q.author_handle}/status/${q.tweet_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: theme.textMuted, textDecoration: "underline" }}
                          >
                            open on X
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Sentiment chip + actions */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginTop: 24,
                }}
              >
                {(() => {
                  const tone =
                    SENTIMENT_TONE[state.rendered.sentiment] ?? SENTIMENT_TONE.neutral;
                  return (
                    <span
                      aria-label={`Sentiment: ${state.rendered.sentiment}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "3px 8px",
                        borderRadius: 3,
                        border: `1px solid ${tone.border}`,
                        backgroundColor: tone.bg,
                        color: tone.fg,
                        fontFamily: theme.monoFont,
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                      }}
                    >
                      sentiment · {state.rendered.sentiment}
                    </span>
                  );
                })()}
                <Button variant="outline" size="sm" onClick={onRefresh}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
                </Button>
              </div>

              <hr style={styles.divider} />
              <div style={styles.footer}>
                Generated by {state.rendered.model} · Manage or pause this digest in
                your UroFeed dashboard.
              </div>
            </>
          )}
        </div>

        <div style={styles.outerFooter}>
          UroFeed · preview of weekly digest email
        </div>
      </div>
    </div>
  );
}

export default DigestPreviewDialog;