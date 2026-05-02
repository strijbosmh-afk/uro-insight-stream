import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runIngestionForTarget } from "@/server/ingestion.server";

const MAX_JOBS_PER_TICK = 10;
const ADVISORY_LOCK_KEY = 8421771; // arbitrary stable bigint

type Job = {
  id: string;
  source_id: string;
  job_type: string;
  attempts: number;
  priority: number;
  since: string;
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function tryAdvisoryLock(): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("pg_try_advisory_lock" as never, { key: ADVISORY_LOCK_KEY } as never);
  if (error) {
    // RPC may not exist; fall back to "no lock" semantics — best-effort
    return true;
  }
  return data === true;
}

async function releaseAdvisoryLock(): Promise<void> {
  await supabaseAdmin.rpc("pg_advisory_unlock" as never, { key: ADVISORY_LOCK_KEY } as never);
}

async function claimJobs(limit: number): Promise<Job[]> {
  const nowISO = new Date().toISOString();
  // Atomic claim using UPDATE…RETURNING via a CTE-like approach with .rpc would be cleanest,
  // but supabase-js doesn't expose CTEs. Two-step: select candidate IDs, then update them in a
  // single statement with an "in" filter. The advisory lock prevents concurrent ticks from racing.
  const { data: candidates } = await supabaseAdmin
    .from("ingest_queue")
    .select("id")
    .eq("enrichment_status", "pending")
    .or(`rate_limited_until.is.null,rate_limited_until.lt.${nowISO}`)
    .order("priority", { ascending: false })
    .order("requested_at", { ascending: true })
    .limit(limit);
  const ids = (candidates ?? []).map((r) => r.id as string);
  if (ids.length === 0) return [];
  const { data: claimed } = await supabaseAdmin
    .from("ingest_queue")
    .update({ enrichment_status: "processing", last_processed_at: nowISO, started_at: nowISO })
    .in("id", ids)
    .eq("enrichment_status", "pending")
    .select("id, source_id, job_type, attempts, priority, since");
  return (claimed ?? []) as Job[];
}

type Outcome = "completed" | "failed" | "rate_limited";

async function processJob(job: Job): Promise<{ outcome: Outcome; xCalls: number; error?: string; rateLimitedUntil?: string }> {
  const handle = job.source_id;
  if (!handle) {
    return { outcome: "failed", xCalls: 0, error: "missing_source_id" };
  }
  try {
    const result = await runIngestionForTarget("handle", handle, job.since, undefined);
    if (result.status === "rate_limited") {
      // Back off 5 minutes (X v2 recent search returns no reset header here; conservative)
      const until = new Date(Date.now() + 5 * 60_000).toISOString();
      return { outcome: "rate_limited", xCalls: 1, rateLimitedUntil: until };
    }
    if (result.status === "error") {
      return { outcome: "failed", xCalls: 1, error: result.error ?? "ingestion_error" };
    }
    return { outcome: "completed", xCalls: 1 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { outcome: "failed", xCalls: 0, error: message };
  }
}

export const Route = createFileRoute("/api/public/hooks/process-ingest-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth: shared X_JOB_SECRET, same pattern as tweet-ingest
        const expected = process.env.X_JOB_SECRET;
        const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!expected || got !== expected) {
          return jsonResponse({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        // Fast no-op when queue is empty
        const { data: peek } = await supabaseAdmin
          .from("ingest_queue")
          .select("id")
          .eq("enrichment_status", "pending")
          .limit(1);
        if (!peek || peek.length === 0) {
          return jsonResponse({ ok: true, processed: 0, skipped: "empty" });
        }

        // Concurrency cap via advisory lock
        const locked = await tryAdvisoryLock();
        if (!locked) {
          return jsonResponse({ ok: true, processed: 0, skipped: "locked" });
        }

        const startedAt = new Date().toISOString();
        const { data: runRow } = await supabaseAdmin
          .from("ingest_queue_run_log")
          .insert({ started_at: startedAt })
          .select("id")
          .single();
        const runId = runRow?.id as string | undefined;

        let completed = 0;
        let failed = 0;
        let rateLimited = 0;
        let xCalls = 0;

        try {
          const jobs = await claimJobs(MAX_JOBS_PER_TICK);
          for (const job of jobs) {
            const out = await processJob(job);
            xCalls += out.xCalls;
            const finishedISO = new Date().toISOString();
            const patch: Record<string, unknown> = {
              enrichment_status: out.outcome,
              last_processed_at: finishedISO,
              finished_at: finishedISO,
              attempts: (job.attempts ?? 0) + 1,
            };
            if (out.outcome === "rate_limited") {
              patch.enrichment_status = "pending"; // re-queue, gated by rate_limited_until
              patch.rate_limited_until = out.rateLimitedUntil;
              rateLimited += 1;
            } else if (out.outcome === "failed") {
              patch.error_message = out.error ?? null;
              // Permanent failure after 3 attempts; otherwise re-queue
              const newAttempts = (job.attempts ?? 0) + 1;
              if (newAttempts < 3) {
                patch.enrichment_status = "pending";
              }
              failed += 1;
            } else {
              completed += 1;
            }
            await supabaseAdmin
              .from("ingest_queue")
              .update(patch as never)
              .eq("id", job.id);
          }

          if (runId) {
            await supabaseAdmin
              .from("ingest_queue_run_log")
              .update({
                finished_at: new Date().toISOString(),
                jobs_picked: jobs.length,
                jobs_completed: completed,
                jobs_failed: failed,
                jobs_rate_limited: rateLimited,
                x_api_calls: xCalls,
              })
              .eq("id", runId);
          }

          return jsonResponse({
            ok: true,
            processed: completed + failed + rateLimited,
            completed,
            failed,
            rate_limited: rateLimited,
          });
        } finally {
          await releaseAdvisoryLock();
        }
      },
    },
  },
});