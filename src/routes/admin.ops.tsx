import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/auth/AuthProvider";
import { listOpsAlerts, acknowledgeOpsAlert } from "@/serverFns/ops-alerts";

export const Route = createFileRoute("/admin/ops")({
  head: () => ({ meta: [{ title: "Ops alerts — UroFeed admin" }] }),
  component: OpsPage,
});

function OpsPage() {
  const { isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["ops-alerts"],
    queryFn: () => listOpsAlerts(),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="p-6">
        <Panel title="Access denied">
          <p className="text-sm text-text-muted">
            This page is admin-only.{" "}
            <Link to="/dashboard" className="text-accent underline">
              Go to dashboard
            </Link>
            .
          </p>
        </Panel>
      </div>
    );
  }

  const onAck = async (id: string) => {
    try {
      await acknowledgeOpsAlert({ data: { id } });
      toast.success("Acknowledged");
      qc.invalidateQueries({ queryKey: ["ops-alerts"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const unack = (alerts ?? []).filter((a) => !a.acknowledged_at);
  const acked = (alerts ?? []).filter((a) => a.acknowledged_at);

  return (
    <div className="p-6 space-y-4">
      <h1 className="font-mono text-sm uppercase tracking-[0.18em] text-text-muted">
        Admin · Ops alerts
      </h1>
      <Panel title={`Unacknowledged (${unack.length})`}>
        {isLoading ? (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading alerts…
          </div>
        ) : unack.length === 0 ? (
          <div className="text-sm text-text-muted flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success" /> No active alerts.
          </div>
        ) : (
          <ul className="space-y-2">
            {unack.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-3 p-3 border border-border rounded-[3px] bg-panel-elevated"
              >
                <AlertTriangle
                  className={
                    "w-4 h-4 mt-0.5 shrink-0 " +
                    (a.severity === "critical"
                      ? "text-destructive"
                      : a.severity === "warning"
                        ? "text-warning"
                        : "text-text-muted")
                  }
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] font-mono uppercase">
                      {a.alert_kind}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] font-mono uppercase">
                      {a.severity}
                    </Badge>
                    <span className="text-[11px] text-text-muted">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-text-primary">{a.message}</p>
                  {a.metadata ? (
                    <pre className="mt-1 text-[11px] text-text-muted overflow-auto">
                      {JSON.stringify(a.metadata, null, 2)}
                    </pre>
                  ) : null}
                </div>
                <Button size="sm" variant="outline" onClick={() => void onAck(a.id)}>
                  Acknowledge
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {acked.length > 0 && (
        <Panel title={`Recently acknowledged (${acked.length})`}>
          <ul className="space-y-1.5 text-xs text-text-muted">
            {acked.slice(0, 25).map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3 text-success" />
                <span className="font-mono">{a.alert_kind}</span>
                <span className="truncate flex-1">{a.message}</span>
                <span>{new Date(a.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}