import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadConfig, runIngestionForTarget } from "@/server/ingestion.server";
import { requireCronAuth } from "@/server/cron-auth.server";

// Cron-triggered tweet ingestion. Enqueues active sources into ingest_queue
// (drained sub-second by process-ingest-queue every minute) and runs hashtag
// searches inline (tiny, bounded set). The previous synchronous shape iterated
// 47+ handles inline and reliably exceeded pg_net's 5s timeout, which made the
// dashboard show this job as "never" even though the worker completed fine.
export const Route = createFileRoute("/api/public/hooks/tweet-ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
        const auth = await requireCronAuth(request);
        if (auth) return auth;
          const cfg = await loadConfig();
          if (!cfg.enabled) {
            return Response.json({ ok: true, skipped: "ingestion_disabled" });
          }
          const sinceISO = new Date(
            Date.now() - cfg.default_lookback_minutes * 60_000,
          ).toISOString();

          // 1) Pick up active source ids (the queue's source_id is the same value
          //    process-ingest-queue feeds to runIngestionForTarget("handle", ...)).
          const sourcesRes = await supabaseAdmin
            .from("sources")
            .select("id, active")
            .eq("active", true)
            .limit(2000);
          const activeSourceIds: string[] = [];
          if (!sourcesRes.error && Array.isArray(sourcesRes.data)) {
            for (const row of sourcesRes.data as Array<{ id: string; active: boolean }>) {
              if (row.id) activeSourceIds.push(row.id);
            }
          }

          // 2) Bulk pre-check: which source_ids already have an in-flight job?
          //    Skip those so re-ticks within the same drain window don't pile up
          //    duplicates. Single round-trip — no N+1.
          let alreadyQueued = new Set<string>();
          if (activeSourceIds.length > 0) {
            const { data: existingRows } = await supabaseAdmin
              .from("ingest_queue")
              .select("source_id")
              .in("source_id", activeSourceIds)
              .in("enrichment_status", ["pending", "processing"]);
            alreadyQueued = new Set(
              ((existingRows ?? []) as Array<{ source_id: string }>).map((r) => r.source_id),
            );
          }
          const toEnqueue = activeSourceIds.filter((id) => !alreadyQueued.has(id));

          let enqueued = 0;
          if (toEnqueue.length > 0) {
            const rows = toEnqueue.map((source_id) => ({
              source_id,
              job_type: "periodic_refresh",
              status: "pending",
              enrichment_status: "pending",
              priority: 50,
              since: sinceISO,
              requested_by: null,
            }));
            const { data: inserted, error: insertErr } = await supabaseAdmin
              .from("ingest_queue")
              .insert(rows)
              .select("id");
            if (insertErr) {
              throw new Error(`enqueue_failed: ${insertErr.message}`);
            }
            enqueued = inserted?.length ?? 0;
          }

          // 3) Hashtags: small bounded set, run inline. Stays well under any
          //    reasonable timeout and avoids extending the queue schema for a
          //    rarely-used path.
          const tagsRes = await supabaseAdmin
            .from("hashtags" as never)
            .select("tag, active")
            .limit(500);
          const tags: string[] = [];
          if (!tagsRes.error && Array.isArray(tagsRes.data)) {
            for (const row of tagsRes.data as Array<{ tag: string; active: boolean }>) {
              if (row.active && row.tag) tags.push(row.tag);
            }
          }
          const hashtagResults = [];
          for (const t of tags) {
            hashtagResults.push(await runIngestionForTarget("hashtag", t, sinceISO));
          }

          return Response.json({
            ok: true,
            adapter: cfg.adapter,
            counts: {
              handles_active: activeSourceIds.length,
              handles_enqueued: enqueued,
              handles_skipped_already_queued: alreadyQueued.size,
              hashtags: tags.length,
            },
            hashtag_results: hashtagResults,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[tweet-ingest] failed:", message);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
