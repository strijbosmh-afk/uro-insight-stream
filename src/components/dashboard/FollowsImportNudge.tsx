import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getFollowsImportNudgeStatus,
  dismissFollowsImportNudge,
} from "@/serverFns/x-follows";

/**
 * Two-mode discoverability surface for the X follows-import feature:
 * - `dashboard_recurring`: dismissible, returns after 7 days, max 3 dismisses.
 * - `legacy_one_time`: pre-launch users; one-time prominent welcome banner.
 * Hidden entirely when X isn't connected or the user already imported.
 */
export function FollowsImportNudge() {
  const qc = useQueryClient();
  const [hidden, setHidden] = React.useState(false);
  const { data } = useQuery({
    queryKey: ["follows-import-nudge"],
    queryFn: () => getFollowsImportNudgeStatus(),
    staleTime: 60_000,
  });

  if (hidden || !data?.eligible || !data.kind) return null;

  const onDismiss = async () => {
    setHidden(true);
    try {
      await dismissFollowsImportNudge({ data: { kind: data.kind! } });
      qc.invalidateQueries({ queryKey: ["follows-import-nudge"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dismiss");
    }
  };

  if (data.kind === "legacy_one_time") {
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

  // dashboard_recurring tile
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