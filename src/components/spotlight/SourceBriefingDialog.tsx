import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useCanAdmin } from "@/auth/permissions";
import {
  getSourceBriefing,
  type SpotlightBriefing,
} from "@/serverFns/source-spotlight";
import type { SourceBriefing } from "@/server/source-briefing.server";

type Props = {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  trigger: React.ReactNode;
};

export function SourceBriefingDialog({ handle, displayName, avatarUrl, trigger }: Props) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="max-w-3xl w-full p-0 gap-0 overflow-hidden print:max-w-full print:shadow-none print:border-0"
        // Disable Radix's built-in close button so we control header chrome.
      >
        {/* B9: Radix requires a DialogTitle/Description for screen readers.
            The visible header has its own styled heading, so we expose the
            accessible name/description via the sr-only utility class. */}
        <DialogTitle className="sr-only">
          Briefing — {displayName || `@${handle}`}
        </DialogTitle>
        <DialogDescription className="sr-only">
          AI-generated weekly briefing for @{handle}.
        </DialogDescription>
        <BriefingBody
          handle={handle}
          displayName={displayName}
          avatarUrl={avatarUrl}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function BriefingBody({
  handle,
  displayName,
  avatarUrl,
  onClose,
}: {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  onClose: () => void;
}) {
  const fetchBriefing = useServerFn(getSourceBriefing);
  const isAdmin = useCanAdmin();
  const qc = useQueryClient();
  const queryKey = ["source-briefing", handle] as const;

  const { data, isLoading, error, refetch, isFetching } = useQuery<SpotlightBriefing | null>({
    queryKey,
    queryFn: () => fetchBriefing({ data: { handle } }),
    staleTime: 60 * 1000,
  });

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = async () => {
    if (!isAdmin) return;
    setRefreshing(true);
    try {
      await fetchBriefing({ data: { handle, refresh: true } });
      await qc.invalidateQueries({ queryKey });
      toast.success("Briefing regenerated");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "refresh failed";
      toast.error(msg);
    } finally {
      setRefreshing(false);
    }
  };

  const onPrint = () => {
    // Scope the print stylesheet so it only applies when this dialog
    // initiates the print job. Otherwise rules like
    // `body * { visibility: hidden }` would clobber any other print
    // (e.g. a browser-initiated Ctrl+P from elsewhere on the page) just
    // because the dialog happens to be mounted.
    document.body.classList.add("printing-briefing");
    const cleanup = () => {
      document.body.classList.remove("printing-briefing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  };
  const onCopy = async () => {
    if (!data?.briefing) return;
    try {
      await navigator.clipboard.writeText(briefingToText(handle, displayName, data));
      toast.success("Copied briefing to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <>
      {/* Header — hidden when printing */}
      <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-border print:hidden">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="w-10 h-10 rounded-[4px] border border-border bg-panel-elevated shrink-0"
          />
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent shrink-0" />
            <h2 className="text-sm font-semibold text-text-primary truncate">
              Briefing — {displayName || `@${handle}`}
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] font-mono text-text-muted">
            {data ? `Week of ${formatWeek(data.week_start)} · generated ${formatTimestamp(data.computed_at)}` : "Loading…"}
            {data?.is_stale ? " · stale" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 h-8"
              onClick={onRefresh}
              disabled={refreshing || isFetching}
              title="Regenerate (admin)"
            >
              <RefreshCw className={"w-3.5 h-3.5" + (refreshing ? " animate-spin" : "")} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 h-8"
            onClick={onPrint}
            disabled={!data?.briefing}
            title="Print briefing"
          >
            <Printer className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 h-8"
            onClick={onClose}
            title="Close"
          >
            <XIcon className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block px-6 pt-6 pb-3 border-b border-black">
        <h1 className="text-xl font-serif font-semibold">
          Briefing — {displayName || `@${handle}`}
        </h1>
        <p className="text-xs font-mono mt-1">
          {data ? `Week of ${formatWeek(data.week_start)}` : ""}
        </p>
      </div>

      {/* Body */}
      <ScrollArea className="max-h-[78vh] print:max-h-none print:overflow-visible">
        <div className="px-5 py-4 print:px-8 print:py-4 briefing-print">
          {isLoading ? (
            <BriefingSkeleton />
          ) : error ? (
            <ErrorTile
              message={error instanceof Error ? error.message : "Failed to load briefing"}
              onRetry={() => refetch()}
            />
          ) : !data?.briefing ? (
            <ErrorTile
              message="Not enough recent activity to generate a briefing for this source yet."
              onRetry={() => refetch()}
            />
          ) : (
            <BriefingContent handle={handle} briefing={data.briefing} />
          )}
        </div>
      </ScrollArea>

      {/* Footer — hidden when printing */}
      <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border print:hidden">
        <p className="text-[11px] text-text-muted">
          Verify quoted claims before citing externally.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCopy} disabled={!data?.briefing} className="gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Copy as text
          </Button>
          <Button size="sm" onClick={onPrint} disabled={!data?.briefing} className="gap-1.5">
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
        </div>
      </div>

      {/* Print-only footer */}
      <div className="hidden print:block px-8 py-4 border-t border-black mt-6 text-[10px] font-mono">
        UroFeed briefing — Generated {data ? formatTimestamp(data.computed_at) : ""} from public X activity. Verify any quoted claims before citing externally.
      </div>

      <PrintStyles />
    </>
  );
}

function BriefingContent({
  handle,
  briefing,
}: {
  handle: string;
  briefing: SourceBriefing;
}) {
  return (
    <div className="space-y-6">
      {/* Executive summary */}
      <section className="briefing-section">
        <SectionHeader>Executive summary</SectionHeader>
        <p className="text-[14px] leading-relaxed text-text-primary print:font-serif print:text-[13px]">
          {briefing.executive_summary}
        </p>
      </section>

      {briefing.main_themes.length > 0 && (
        <section className="briefing-section briefing-pagebreak">
          <SectionHeader>Main themes</SectionHeader>
          <ul className="space-y-3">
            {briefing.main_themes.map((t, i) => (
              <li
                key={i}
                className="border border-border rounded-[4px] p-3 print:border-black/30"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-text-primary">
                      {t.label}
                    </div>
                    {t.cancer_area_slug && (
                      <Badge
                        variant="outline"
                        className="mt-1 text-[10px] uppercase tracking-wider border-accent/40 text-accent"
                      >
                        {t.cancer_area_slug}
                      </Badge>
                    )}
                  </div>
                  <WeightBar weight={t.weight} />
                </div>
                <p className="mt-2 text-[12px] text-text-primary leading-relaxed print:font-serif">
                  {t.summary}
                </p>
                {t.example_tweet_ids.length > 0 && (
                  <TweetChipRow handle={handle} ids={t.example_tweet_ids} label="Examples" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {briefing.notable_stances.length > 0 && (
        <section className="briefing-section">
          <SectionHeader>Notable stances</SectionHeader>
          <ul className="space-y-2">
            {briefing.notable_stances.map((s, i) => (
              <li
                key={i}
                className="border border-border rounded-[4px] p-3 print:border-black/30"
              >
                <div className="text-[13px] text-text-primary leading-snug print:font-serif">
                  {s.position}
                </div>
                {s.context && (
                  <p className="mt-1 text-[12px] text-text-muted print:font-serif">
                    {s.context}
                  </p>
                )}
                {s.evidence_tweet_ids.length > 0 && (
                  <TweetChipRow handle={handle} ids={s.evidence_tweet_ids} label="Evidence" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {briefing.points_of_disagreement.length > 0 && (
        <section className="briefing-section">
          <SectionHeader>Points of disagreement</SectionHeader>
          <ul className="space-y-2">
            {briefing.points_of_disagreement.map((d, i) => (
              <li
                key={i}
                className="border border-border rounded-[4px] p-3 print:border-black/30"
              >
                <div className="text-[13px] text-text-primary leading-snug print:font-serif">
                  {d.description}
                </div>
                {d.counterparties.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.counterparties.map((cp) => (
                      <Link
                        key={cp}
                        to="/sources_/$handle"
                        params={{ handle: cp }}
                        className="inline-flex items-center text-[11px] font-mono text-accent hover:underline px-1.5 py-0.5 rounded bg-accent/10 print:bg-transparent print:text-black"
                      >
                        @{cp}
                      </Link>
                    ))}
                  </div>
                )}
                {d.evidence_tweet_ids.length > 0 && (
                  <TweetChipRow handle={handle} ids={d.evidence_tweet_ids} label="Evidence" />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {briefing.conversation_partners.length > 0 && (
        <section className="briefing-section">
          <SectionHeader>Conversation partners</SectionHeader>
          <div className="flex flex-wrap gap-2">
            {briefing.conversation_partners.map((p) => (
              <Link
                key={p.handle}
                to="/sources_/$handle"
                params={{ handle: p.handle }}
                className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded border border-border hover:border-accent/60 hover:text-accent print:border-black/30"
              >
                <span>@{p.handle}</span>
                <span className="text-text-muted">·</span>
                <span className="text-text-muted">
                  {labelInteraction(p.interaction_kind)} ×{p.count}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {briefing.upcoming_relevance.length > 0 && (
        <section className="briefing-section">
          <SectionHeader>Upcoming relevance</SectionHeader>
          <ul className="space-y-2">
            {briefing.upcoming_relevance.map((u, i) => (
              <li
                key={i}
                className="border border-border rounded-[4px] p-3 print:border-black/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-text-primary print:font-serif">
                      {u.label}
                    </div>
                    <p className="mt-0.5 text-[12px] text-text-primary print:font-serif">
                      {u.detail}
                    </p>
                  </div>
                  {u.starts_at && (
                    <span className="text-[11px] font-mono text-text-muted shrink-0">
                      {u.starts_at}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {briefing.recommended_angles.length > 0 && (
        <section className="briefing-section briefing-pagebreak-before">
          <SectionHeader emphasis>Recommended angles</SectionHeader>
          <ul className="space-y-3">
            {briefing.recommended_angles.map((a, i) => (
              <li
                key={i}
                className="border border-accent/40 bg-accent/5 rounded-[4px] p-3 print:border-black/40 print:bg-transparent"
              >
                <p className="text-[14px] font-medium text-text-primary leading-snug print:font-serif print:text-[13px]">
                  {a.angle}
                </p>
                <p className="mt-1 text-[12px] text-text-muted print:font-serif">
                  {a.reasoning}
                </p>
                {a.related_tweet_id && (
                  <a
                    href={`https://x.com/${handle}/status/${a.related_tweet_id}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline print:text-black"
                  >
                    View tweet <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {briefing.caveats && (
        <section className="briefing-section">
          <p className="text-[11px] italic text-text-muted print:font-serif">
            {briefing.caveats}
          </p>
        </section>
      )}
    </div>
  );
}

function SectionHeader({
  children,
  emphasis,
}: {
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <h3
      className={
        "mb-2 text-[11px] font-mono uppercase tracking-[0.18em] " +
        (emphasis ? "text-accent" : "text-text-muted") +
        " print:text-black print:tracking-[0.12em]"
      }
    >
      {children}
    </h3>
  );
}

function WeightBar({ weight }: { weight: number }) {
  const pct = Math.round(weight * 100);
  return (
    <div className="flex items-center gap-2 shrink-0 w-[120px] print:hidden">
      <div className="flex-1 h-1.5 bg-panel-elevated rounded-full overflow-hidden">
        <div
          className="h-full bg-accent"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-text-muted tabular-nums">{pct}%</span>
    </div>
  );
}

function TweetChipRow({
  handle,
  ids,
  label,
}: {
  handle: string;
  ids: string[];
  label: string;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1 items-center">
      <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
        {label}:
      </span>
      {ids.map((id) => (
        <a
          key={id}
          href={`https://x.com/${handle}/status/${id}`}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[11px] font-mono text-accent hover:underline px-1.5 py-0.5 rounded bg-accent/10 print:bg-transparent print:text-black"
        >
          {id.slice(-6)}
        </a>
      ))}
    </div>
  );
}

function BriefingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

function ErrorTile({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="py-10 flex flex-col items-center gap-3 text-[12px] text-text-muted">
      <AlertTriangle className="w-5 h-5 text-amber-400" />
      <p className="text-center max-w-md">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
        <RefreshCw className="w-3 h-3" /> Retry
      </Button>
    </div>
  );
}

function PrintStyles() {
  return (
    <style>{`
      @media print {
        body.printing-briefing * { visibility: hidden !important; }
        body.printing-briefing [data-radix-dialog-content],
        body.printing-briefing [data-radix-dialog-content] * {
          visibility: visible !important;
        }
        body.printing-briefing [data-radix-dialog-content] {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          transform: none !important;
          background: white !important;
          color: black !important;
          box-shadow: none !important;
          border: none !important;
        }
        body.printing-briefing [data-radix-dialog-overlay] { display: none !important; }
        body.printing-briefing .briefing-print { color: black !important; background: white !important; }
        body.printing-briefing .briefing-pagebreak { page-break-after: always; }
        body.printing-briefing .briefing-pagebreak-before { page-break-before: always; }
        body.printing-briefing .briefing-section { break-inside: avoid; }
      }
    `}</style>
  );
}

function labelInteraction(k: string): string {
  if (k === "frequent_quote") return "quotes";
  if (k === "frequent_mention") return "mentions";
  return "replies";
}

function formatWeek(weekStart: string): string {
  try {
    return new Date(weekStart + "T00:00:00Z").toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return weekStart;
  }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function briefingToText(
  handle: string,
  displayName: string,
  d: SpotlightBriefing,
): string {
  const b = d.briefing;
  const lines: string[] = [];
  lines.push(`Briefing — ${displayName || `@${handle}`}`);
  lines.push(`Week of ${formatWeek(d.week_start)} · generated ${formatTimestamp(d.computed_at)}`);
  lines.push("");
  lines.push("EXECUTIVE SUMMARY");
  lines.push(b.executive_summary);
  if (b.main_themes.length) {
    lines.push("", "MAIN THEMES");
    for (const t of b.main_themes) {
      lines.push(`• ${t.label} (${Math.round(t.weight * 100)}%)`);
      lines.push(`  ${t.summary}`);
      if (t.example_tweet_ids.length)
        lines.push(`  evidence: ${t.example_tweet_ids.join(", ")}`);
    }
  }
  if (b.notable_stances.length) {
    lines.push("", "NOTABLE STANCES");
    for (const s of b.notable_stances) {
      lines.push(`• ${s.position}`);
      if (s.context) lines.push(`  ${s.context}`);
    }
  }
  if (b.points_of_disagreement.length) {
    lines.push("", "POINTS OF DISAGREEMENT");
    for (const dd of b.points_of_disagreement) {
      lines.push(`• ${dd.description}`);
      if (dd.counterparties.length)
        lines.push(`  with: ${dd.counterparties.map((c) => "@" + c).join(", ")}`);
    }
  }
  if (b.conversation_partners.length) {
    lines.push("", "CONVERSATION PARTNERS");
    for (const p of b.conversation_partners) {
      lines.push(`• @${p.handle} — ${labelInteraction(p.interaction_kind)} ×${p.count}`);
    }
  }
  if (b.upcoming_relevance.length) {
    lines.push("", "UPCOMING RELEVANCE");
    for (const u of b.upcoming_relevance) {
      lines.push(`• ${u.label}${u.starts_at ? ` (${u.starts_at})` : ""}`);
      lines.push(`  ${u.detail}`);
    }
  }
  if (b.recommended_angles.length) {
    lines.push("", "RECOMMENDED ANGLES");
    for (const a of b.recommended_angles) {
      lines.push(`• ${a.angle}`);
      lines.push(`  ${a.reasoning}`);
    }
  }
  if (b.caveats) {
    lines.push("", "CAVEATS");
    lines.push(b.caveats);
  }
  return lines.join("\n");
}

export default SourceBriefingDialog;