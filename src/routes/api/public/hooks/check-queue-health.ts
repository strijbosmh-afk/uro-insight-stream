// Cron-driven hook: monitors ingest_queue for stale rows and creates an
// ops_alerts row when the threshold is crossed. Scheduled every 5 minutes.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/server/cron-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emitOpsAlert } from "@/server/ops-alerts.server";

const STALE_THRESHOLD_ROWS = 20;
const STALE_AGE_MINUTES = 30;
const DEDUPE_WINDOW_HOURS = 6;
// H-O4: rows stuck in `processing` longer than this are reaped back to
// `pending`. Catches crashed workers / partial-batch errors that left rows
// orphaned forever.
const PROCESSING_REAP_MINUTES = 10;
// H-O7: ops alert when signup rate spikes. Cron runs every 5 min; this
// thresholds against the last 10 min so transient bursts trigger.
const SIGNUP_SPIKE_WINDOW_MINUTES = 10;
const SIGNUP_SPIKE_THRESHOLD = 25;

export const Route = createFileRoute("/api/public/hooks/check-queue-health")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireCronAuth(request);
        if (auth) return auth;
        try {
          const cutoff = new Date(
            Date.now() - STALE_AGE_MINUTES * 60_000,
          ).toISOString();
          const nowISO = new Date().toISOString();

          // H-O4: reap stuck `processing` rows back to `pending` so the next
          // tick picks them up. Conservative: bump attempts so the retry-cap
          // logic in process-ingest-queue still applies.
          const reapCutoff = new Date(
            Date.now() - PROCESSING_REAP_MINUTES * 60_000,
          ).toISOString();
          const { data: reaped } = await supabaseAdmin
            .from("ingest_queue")
            .update({
              enrichment_status: "pending",
              error_message: "reaped_from_stale_processing",
            })
            .eq("enrichment_status", "processing")
            .lt("started_at", reapCutoff)
            .select("id");
          const reapedCount = reaped?.length ?? 0;
          if (reapedCount > 0) {
            await emitOpsAlert({
              kind: "stale_processing_jobs",
              severity: "warning",
              message: `${reapedCount} ingest jobs reaped from stuck "processing" state`,
              metadata: { count: reapedCount, age_minutes: PROCESSING_REAP_MINUTES },
              dedupeWindowHours: 1,
            });
          }

          const { count, error } = await supabaseAdmin
            .from("ingest_queue")
            .select("*", { count: "exact", head: true })
            .eq("enrichment_status", "pending")
            .lt("requested_at", cutoff)
            .or(`rate_limited_until.is.null,rate_limited_until.lt.${nowISO}`);
          if (error) throw new Error(error.message);

          let alerted = false;
          if (count && count >= STALE_THRESHOLD_ROWS) {
            const dedupeCutoff = new Date(
              Date.now() - DEDUPE_WINDOW_HOURS * 60 * 60_000,
            ).toISOString();
            const { data: recent } = await supabaseAdmin
              .from("ops_alerts")
              .select("id")
              .eq("alert_kind", "stale_ingest_queue")
              .is("acknowledged_at", null)
              .gt("created_at", dedupeCutoff)
              .maybeSingle();

            if (!recent) {
              await supabaseAdmin.from("ops_alerts").insert({
                alert_kind: "stale_ingest_queue",
                severity: "critical",
                message: `${count} ingest jobs stale > ${STALE_AGE_MINUTES} minutes`,
                metadata: {
                  count,
                  threshold: STALE_THRESHOLD_ROWS,
                  age_minutes: STALE_AGE_MINUTES,
                },
              });
              alerted = true;
            }
          }

          // H-O7: signup spike detector. profiles.created_at tracks signups
          // (a row is created on first auth via the user-profile trigger).
          let signupCount: number | null = null;
          try {
            const sinceISO = new Date(
              Date.now() - SIGNUP_SPIKE_WINDOW_MINUTES * 60_000,
            ).toISOString();
            const { count: cnt } = await supabaseAdmin
              .from("profiles")
              .select("*", { count: "exact", head: true })
              .gt("created_at", sinceISO);
            signupCount = cnt ?? 0;
            if (signupCount && signupCount >= SIGNUP_SPIKE_THRESHOLD) {
              await emitOpsAlert({
                kind: "signup_spike",
                severity: "warning",
                message: `${signupCount} signups in last ${SIGNUP_SPIKE_WINDOW_MINUTES} min`,
                metadata: {
                  count: signupCount,
                  window_minutes: SIGNUP_SPIKE_WINDOW_MINUTES,
                  threshold: SIGNUP_SPIKE_THRESHOLD,
                },
                dedupeWindowHours: 1,
              });
            }
          } catch (e) {
            console.error("[check-queue-health] signup spike check failed", e);
          }

          return new Response(
            JSON.stringify({
              ok: true,
              stale_count: count ?? 0,
              reaped: reapedCount,
              signups_recent: signupCount,
              alerted,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (err) {
          console.error("[check-queue-health] failed", err);
          return new Response(
            JSON.stringify({ ok: false, error: (err as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});