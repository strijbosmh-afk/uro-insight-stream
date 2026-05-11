// Cron-driven hook: monitors ingest_queue for stale rows and creates an
// ops_alerts row when the threshold is crossed. Scheduled every 5 minutes.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/server/cron-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STALE_THRESHOLD_ROWS = 20;
const STALE_AGE_MINUTES = 30;
const DEDUPE_WINDOW_HOURS = 6;

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

          return new Response(
            JSON.stringify({ ok: true, stale_count: count ?? 0, alerted }),
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