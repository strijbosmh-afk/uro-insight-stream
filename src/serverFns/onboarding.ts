import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runIngestionForTarget } from "@/server/ingestion.server";

const EnqueueSchema = z.object({
  source_ids: z.array(z.string().min(1).max(50)).min(1).max(100),
});

const ProcessQueueSchema = z.object({
  limit: z.number().int().min(1).max(10).optional(),
});

export const enqueueUserSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => EnqueueSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const sinceISO = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const rows = data.source_ids.map((source_id) => ({
      source_id,
      job_type: "initial_ingest",
      status: "pending",
      enrichment_status: "pending",
      priority: 90, // high — wizard onboarding
      since: sinceISO,
      requested_by: userId,
    }));
    // Insert via the user-context client would fail RLS for service-side rows,
    // so use admin. Stamp requested_by so it's traceable.
    const { error, data: inserted } = await supabaseAdmin
      .from("ingest_queue")
      .insert(rows)
      .select("id");
    if (error) throw new Error(error.message);
    return { enqueued: inserted?.length ?? 0 };
  });

export const getUserIngestStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data } = await supabaseAdmin
      .from("ingest_queue")
      .select("enrichment_status")
      .eq("requested_by", userId);
    const counts = { queued: 0, processing: 0, completed: 0, failed: 0, rate_limited: 0 };
    for (const row of (data ?? []) as Array<{ enrichment_status: string }>) {
      const s = row.enrichment_status;
      if (s === "pending") counts.queued += 1;
      else if (s === "processing") counts.processing += 1;
      else if (s === "completed") counts.completed += 1;
      else if (s === "failed") counts.failed += 1;
      else if (s === "rate_limited") counts.rate_limited += 1;
    }
    return counts;
  });

export const processUserIngestQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ProcessQueueSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const nowISO = new Date().toISOString();
    const limit = data.limit ?? 5;

    const { data: candidates, error: candidatesError } = await supabaseAdmin
      .from("ingest_queue")
      .select("id")
      .eq("requested_by", userId)
      .eq("enrichment_status", "pending")
      .or(`rate_limited_until.is.null,rate_limited_until.lt.${nowISO}`)
      .order("priority", { ascending: false })
      .order("requested_at", { ascending: true })
      .limit(limit);
    if (candidatesError) throw new Error(candidatesError.message);

    const ids = (candidates ?? []).map((row) => row.id as string);
    if (ids.length === 0) return { processed: 0, completed: 0, failed: 0, rate_limited: 0 };

    const { data: jobs, error: claimError } = await supabaseAdmin
      .from("ingest_queue")
      .update({ enrichment_status: "processing", last_processed_at: nowISO, started_at: nowISO })
      .in("id", ids)
      .eq("requested_by", userId)
      .eq("enrichment_status", "pending")
      .select("id, source_id, attempts, since");
    if (claimError) throw new Error(claimError.message);

    let completed = 0;
    let failed = 0;
    let rateLimited = 0;

    for (const job of (jobs ?? []) as Array<{ id: string; source_id: string; attempts: number; since: string }>) {
      const finishedISO = new Date().toISOString();
      const attempts = (job.attempts ?? 0) + 1;
      const result = await runIngestionForTarget("handle", job.source_id, job.since, userId);

      if (result.status === "rate_limited") {
        rateLimited += 1;
        await supabaseAdmin
          .from("ingest_queue")
          .update({
            enrichment_status: "rate_limited",
            attempts,
            last_processed_at: finishedISO,
            finished_at: finishedISO,
            rate_limited_until: new Date(Date.now() + 5 * 60_000).toISOString(),
            error_message: result.error ?? "rate_limited",
          })
          .eq("id", job.id);
      } else if (result.status === "error") {
        failed += 1;
        await supabaseAdmin
          .from("ingest_queue")
          .update({
            enrichment_status: attempts >= 3 ? "failed" : "pending",
            attempts,
            last_processed_at: finishedISO,
            finished_at: attempts >= 3 ? finishedISO : null,
            error_message: result.error ?? "ingestion_error",
          })
          .eq("id", job.id);
      } else {
        completed += 1;
        await supabaseAdmin
          .from("ingest_queue")
          .update({
            enrichment_status: "completed",
            attempts,
            last_processed_at: finishedISO,
            finished_at: finishedISO,
            error_message: null,
          })
          .eq("id", job.id);
      }
    }

    return { processed: (jobs ?? []).length, completed, failed, rate_limited: rateLimited };
  });

/**
 * Returns the count of recommended sources for the user's current specialties
 * that they are NOT already subscribed to. Drives the dashboard
 * "specialty-changed" banner.
 */
export const getNewRecommendedSourcesCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: specs } = await supabaseAdmin
      .from("user_specialties")
      .select("specialty_id")
      .eq("user_id", userId);
    const specialtyIds = (specs ?? []).map((r: { specialty_id: string }) => r.specialty_id);
    if (specialtyIds.length === 0) return { count: 0 };
    const { data: recs } = await supabaseAdmin
      .from("recommended_sources_by_specialty")
      .select("source_id")
      .in("specialty_id", specialtyIds);
    const recIds = new Set((recs ?? []).map((r: { source_id: string }) => r.source_id));
    if (recIds.size === 0) return { count: 0 };
    const { data: subs } = await supabaseAdmin
      .from("user_subscribed_sources")
      .select("source_id")
      .eq("user_id", userId);
    const subIds = new Set((subs ?? []).map((r: { source_id: string }) => r.source_id));
    let missing = 0;
    for (const id of recIds) if (!subIds.has(id)) missing += 1;
    return { count: missing };
  });