import * as React from "react";
import { Sparkles, AlertTriangle, X, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { CongressSuggestion } from "@/hooks/useCongressSuggest";

const confidenceColor: Record<string, string> = {
  high: "text-cyan-400",
  medium: "text-amber-400",
  low: "text-red-400",
};

export function CongressSuggestionCard({
  matches,
  loading,
  fromCache,
  onApply,
  onDismiss,
}: {
  matches: CongressSuggestion[];
  loading?: boolean;
  fromCache?: boolean;
  onApply: (m: CongressSuggestion) => void;
  onDismiss: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    setDismissed(false);
    setExpanded(false);
  }, [matches]);

  if (loading) {
    return (
      <div className="text-[11px] font-mono text-cyan-400 flex items-center gap-2">
        <span className="inline-block h-3 w-3 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
        looking up congress …
      </div>
    );
  }
  if (dismissed || matches.length === 0) return null;

  const primary = matches[0];
  const visible = expanded ? matches : [primary];

  return (
    <div className="space-y-2">
      {visible.map((m, i) => (
        <SuggestionRow
          key={`${m.short_code}-${i}`}
          match={m}
          onApply={() => onApply(m)}
          fromCache={fromCache && i === 0}
          showMoreCount={i === 0 && !expanded && matches.length > 1 ? matches.length - 1 : 0}
          onShowMore={() => setExpanded(true)}
          onDismiss={() => {
            setDismissed(true);
            onDismiss();
          }}
        />
      ))}
    </div>
  );
}

function SuggestionRow({
  match,
  onApply,
  onDismiss,
  fromCache,
  showMoreCount,
  onShowMore,
}: {
  match: CongressSuggestion;
  onApply: () => void;
  onDismiss: () => void;
  fromCache?: boolean;
  showMoreCount: number;
  onShowMore: () => void;
}) {
  const m = match;
  const color = confidenceColor[m.confidence] ?? "text-text-muted";

  if (m.already_exists && m.existing_id) {
    return (
      <div className="border border-border bg-panel-elevated/40 p-3 rounded-[2px] space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" /> Already in database
          </div>
          <button onClick={onDismiss} className="text-text-muted hover:text-text-primary">
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="text-sm text-text-primary">{m.name}</div>
        <div className="text-[11px] text-text-muted font-mono">
          {m.short_code} {m.city ? `· ${m.city}` : ""}
        </div>
        <div className="flex gap-2">
          <Link
            to="/congresses/$congressId"
            params={{ congressId: m.existing_id }}
            className="h-7 px-2 text-[11px] font-mono border border-accent text-accent hover:bg-accent/10 rounded-[2px] inline-flex items-center"
          >
            Use existing
          </Link>
          <button
            onClick={onApply}
            className="h-7 px-2 text-[11px] font-mono border border-border text-text-muted hover:text-text-primary rounded-[2px]"
          >
            Add as duplicate anyway
          </button>
        </div>
      </div>
    );
  }

  const dateRange =
    m.start_date && m.end_date ? `${m.start_date} → ${m.end_date}` : m.start_date || "dates tbd";
  const verifyHref = `https://www.google.com/search?q=${encodeURIComponent(`${m.name} ${dateRange} official`)}`;

  return (
    <div className="border border-border bg-panel-elevated/40 p-3 rounded-[2px] space-y-2">
      <div className="flex items-center justify-between">
        <div className={`text-[11px] font-mono uppercase tracking-wider ${color} flex items-center gap-1.5`}>
          <Sparkles className="h-3 w-3" /> AI suggestion · {m.confidence} confidence
          {fromCache && <span className="text-text-muted">· cached</span>}
        </div>
        <button onClick={onDismiss} className="text-text-muted hover:text-text-primary">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="text-sm text-text-primary">{m.name}</div>
      <div className="text-[11px] text-text-muted font-mono">
        {[m.city, m.country].filter(Boolean).join(", ")}
        {(m.city || m.country) && " · "}
        {dateRange}
        {m.primary_hashtags?.length ? ` · #${m.primary_hashtags[0].replace(/^#/, "")}` : ""}
      </div>
      {m.notes && (
        <div className="text-[11px] text-amber-400 flex items-start gap-1">
          <AlertTriangle className="h-3 w-3 mt-[2px]" /> {m.notes}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onApply}
          className="h-7 px-2 text-[11px] font-mono border border-accent text-accent hover:bg-accent/10 rounded-[2px]"
        >
          Apply suggestion
        </button>
        {showMoreCount > 0 && (
          <button
            onClick={onShowMore}
            className="h-7 px-2 text-[11px] font-mono border border-border text-text-muted hover:text-text-primary rounded-[2px]"
          >
            Show {showMoreCount} more
          </button>
        )}
        <a
          href={verifyHref}
          target="_blank"
          rel="noreferrer"
          className="h-7 px-2 text-[11px] font-mono text-text-muted hover:text-text-primary inline-flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" /> Verify on official site
        </a>
      </div>
    </div>
  );
}