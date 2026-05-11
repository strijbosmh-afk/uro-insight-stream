import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getLowSourceCountNudgeStatus,
  dismissFollowsImportNudge,
} from "@/serverFns/x-follows";

/**
 * Contextual Sources-page nudge for users who connected X, manually added a
 * few sources, but never imported. Single dismiss kills it permanently.
 */
export function LowSourceCountNudge() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [hidden, setHidden] = React.useState(false);
  const { data } = useQuery({
    queryKey: ["low-source-count-nudge"],
    queryFn: () => getLowSourceCountNudgeStatus(),
    staleTime: 60_000,
  });

  if (hidden || !data?.eligible) return null;

  const onDismiss = async () => {
    setHidden(true);
    try {
      await dismissFollowsImportNudge({
        data: { kind: "low_source_count" },
      });
      qc.invalidateQueries({ queryKey: ["low-source-count-nudge"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dismiss");
    }
  };

  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 shrink-0"
      style={{
        background: "var(--panel-elevated)",
        border: "1px dashed var(--accent)",
      }}
    >
      <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary">
          Did you know you could import them all at once?
        </div>
        <div className="text-xs text-text-secondary mt-0.5">
          You've added a few sources manually. The accounts you already follow
          on X can come in as a batch — pre-filtered to your cancer areas.
        </div>
      </div>
      <Button
        size="sm"
        onClick={() => {
          setHidden(true);
          void navigate({
            to: "/sources",
            search: { import: "true" },
            replace: false,
          });
        }}
      >
        Open import
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        className="text-text-muted hover:text-text-primary text-xs font-mono uppercase px-1"
      >
        Got it, hide this
      </button>
    </div>
  );
}