import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getFollowsImportNudgeStatus,
  dismissFollowsImportNudge,
} from "@/serverFns/x-follows";

/**
 * Three-mode discoverability surface for the X follows-import feature:
 * - `first_time_dashboard`: dismissible, returns after 7 days, max 3 dismisses.
 * - `legacy_one_time`: pre-launch users; one-time prominent welcome banner.
 * - `diff_dashboard`: post-import users with new oncology-relevant follows.
 * Hidden entirely when X isn't connected or the user already imported.
 *
 * `forcePrompt` overrides the eligibility check so an email link with
 * `?import=prompt` can always show the recurring tile, even after the
 * dismissal counter is exhausted.
 */
export function FollowsImportNudge({
  forcePrompt = false,
}: { forcePrompt?: boolean } = {}) {
  const qc = useQueryClient();
  const [hidden, setHidden] = React.useState(false);
  const { data } = useQuery({
    queryKey: ["follows-import-nudge"],
    queryFn: () => getFollowsImportNudgeStatus(),
    staleTime: 60_000,
  });

  const eligibleKind = data?.eligible ? data.kind : null;
  const effectiveKind = eligibleKind ?? (forcePrompt ? "first_time_dashboard" : null);
  if (hidden || !effectiveKind) return null;

  const onDismiss = async () => {
    setHidden(true);
    try {
      if (eligibleKind) {
        await dismissFollowsImportNudge({ data: { kind: eligibleKind } });
      }
      qc.invalidateQueries({ queryKey: ["follows-import-nudge"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dismiss");
    }
  };

  if (effectiveKind === "legacy_one_time") {
    return (
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{
          background: "color-mix(in oklab, var(--accent) 10%, var(--panel))",
          border: "1px solid var(--accent)",
        }}
      >
        <Sparkles className="w-5 h-5 text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary">
            Welcome back — we added a feature you might want
          </div>
          <div className="text-xs text-text-secondary mt-0.5">
            Import the people you already follow on X. We'll pre-select the
            ones relevant to your cancer areas — about 30 seconds.
          </div>
        </div>
        <Button asChild size="sm" onClick={() => setHidden(true)}>
          <Link to="/sources" search={{ import: true }}>
            Try it now
          </Link>
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-text-muted hover:text-text-primary text-sm px-2"
          aria-label="Dismiss permanently"
        >
          ×
        </button>
      </div>
    );
  }

  if (effectiveKind === "diff_dashboard") {
    const n = data?.new_count ?? 0;
    return (
      <div
        className="flex items-center gap-3 px-3 py-2.5 shrink-0"
        style={{
          background: "color-mix(in oklab, var(--accent) 8%, var(--panel))",
          border: "1px solid var(--accent)",
        }}
      >
        <RefreshCw className="w-4 h-4 text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary">
            {n} new account{n === 1 ? "" : "s"} you follow on X match your cancer areas
          </div>
          <div className="text-xs text-text-secondary">
            Looks like you've started following more KOLs since your last
            import. Review them in 30 seconds.
          </div>
        </div>
        <Button asChild size="sm" onClick={() => setHidden(true)}>
          <Link to="/sources" search={{ import: "diff" }}>
            Review new follows
          </Link>
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-text-muted hover:text-text-primary text-xs font-mono uppercase px-1"
        >
          Not now
        </button>
      </div>
    );
  }

  // first_time_dashboard tile
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 shrink-0"
      style={{
        background: "var(--panel-elevated)",
        border: "1px solid var(--border)",
      }}
    >
      <Download className="w-4 h-4 text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary">
          Import the people you follow on X
        </div>
        <div className="text-xs text-text-secondary">
          We'll pre-select the ones relevant to your cancer areas — usually
          about 30 seconds.
        </div>
      </div>
      <Button asChild size="sm" onClick={() => setHidden(true)}>
        <Link to="/sources" search={{ import: true }}>
          Browse my follows
        </Link>
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        className="text-text-muted hover:text-text-primary text-xs font-mono uppercase px-1"
      >
        Not now
      </button>
    </div>
  );
}