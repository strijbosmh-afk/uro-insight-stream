// Server-only helper for emitting ops_alerts rows with dedup. Used by the
// classifier, X clients, LLM quota guard, and the queue-health cron.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type OpsAlertKind =
  | "stale_ingest_queue"
  | "stale_processing_jobs"
  | "llm_quota_exhausted"
  | "global_llm_cap_hit"
  | "x_rate_limit_burst"
  | "watchlist_classifier_failure"
  | "signup_spike";

export type OpsAlertSeverity = "info" | "warning" | "critical";

export async function emitOpsAlert(args: {
  kind: OpsAlertKind;
  severity: OpsAlertSeverity;
  message: string;
  metadata?: Record<string, unknown>;
  dedupeWindowHours?: number;
}): Promise<void> {
  const dedupeHours = args.dedupeWindowHours ?? 1;
  try {
    const cutoff = new Date(
      Date.now() - dedupeHours * 60 * 60_000,
    ).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("ops_alerts")
      .select("id")
      .eq("alert_kind", args.kind)
      .is("acknowledged_at", null)
      .gt("created_at", cutoff)
      .maybeSingle();
    if (recent) return;
    await supabaseAdmin.from("ops_alerts").insert({
      alert_kind: args.kind,
      severity: args.severity,
      message: args.message,
      metadata: (args.metadata ?? {}) as never,
    });
  } catch (err) {
    console.error("[ops-alerts] emit failed", args.kind, err);
  }
}