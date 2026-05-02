import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const EnqueueSchema = z.object({
  source_ids: z.array(z.string().min(1).max(50)).min(1).max(100),
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