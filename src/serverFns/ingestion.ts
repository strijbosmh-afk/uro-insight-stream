import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runIngestionForTarget, loadConfig } from "@/server/ingestion.server";
import type { SupabaseClient } from "@supabase/supabase-js";

const TargetSchema = z.object({
  targetType: z.enum(["handle", "hashtag"]),
  target: z.string().min(1).max(200),
  lookbackMinutes: z.number().int().min(5).max(60 * 24 * 7).optional(),
});

async function assertEditor(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("admin") && !roles.includes("editor")) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export type CronHealthRow = {
  jobname: string;
  schedule: string;
  expected_interval_seconds: number;
  last_success_at: string | null;
  age_seconds: number | null;
  is_stale: boolean;
};

let cronHealthCache: { expiresAt: number; rows: CronHealthRow[] } | null = null;

export const getIngestionCronHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const now = Date.now();
    if (cronHealthCache && cronHealthCache.expiresAt > now) return cronHealthCache.rows;

    const rpcClient = supabaseAdmin as unknown as {
      rpc: (fn: string) => Promise<{ data: CronHealthRow[] | null; error: { message: string } | null }>;
    };
    const { data, error } = await rpcClient.rpc("get_ingestion_cron_health");
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    cronHealthCache = { expiresAt: now + 30_000, rows };
    return rows;
  });

export const triggerIngestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TargetSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertEditor(supabase, userId);
    const cfg = await loadConfig();
    const lookback = data.lookbackMinutes ?? cfg.default_lookback_minutes;
    const sinceISO = new Date(Date.now() - lookback * 60_000).toISOString();
    return runIngestionForTarget(data.targetType, data.target, sinceISO, userId);
  });

export const getIngestionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const cfg = await loadConfig();
    const { data: runs } = await supabaseAdmin
      .from("ingestion_runs")
      .select("id, target_type, target, adapter, status, tweets_fetched, tweets_inserted, error_message, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(50);
    const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count: recentCount } = await supabaseAdmin
      .from("ingestion_runs")
      .select("id", { count: "exact", head: true })
      .gte("started_at", fifteenMinAgo);

    // Matcher stats (unmatched tweets + last-24h matcher activity)
    const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { count: unmatchedCount } = await supabaseAdmin
      .from("tweets")
      .select("id", { count: "exact", head: true })
      .is("session_id", null);
    const { data: matchRuns } = await supabaseAdmin
      .from("tweet_match_run_log")
      .select(
        "hashtag_matches, time_window_matches, llm_matches, llm_calls, llm_tokens_used",
      )
      .gte("started_at", dayAgo);
    const matchedLast24h = (matchRuns ?? []).reduce(
      (acc, r) =>
        acc +
        (r.hashtag_matches ?? 0) +
        (r.time_window_matches ?? 0) +
        (r.llm_matches ?? 0),
      0,
    );
    const llmCallsLast24h = (matchRuns ?? []).reduce(
      (acc, r) => acc + (r.llm_calls ?? 0),
      0,
    );
    const llmTokensLast24h = (matchRuns ?? []).reduce(
      (acc, r) => acc + (r.llm_tokens_used ?? 0),
      0,
    );

    // ---- Lookup rate gauge (global, last 15 min window) ----
    const { data: globalLookup } = await supabaseAdmin
      .from("rate_limit_global_lookups")
      .select("count, window_start")
      .eq("id", 1)
      .maybeSingle();
    const lookupWindowStart = globalLookup?.window_start ?? null;
    const lookupWindowFresh =
      !!lookupWindowStart &&
      Date.now() - new Date(lookupWindowStart).getTime() < 15 * 60_000;
    const lookupCount = lookupWindowFresh ? globalLookup?.count ?? 0 : 0;

    // ---- Queue depth gauge ----
    const [{ count: queuePending }, { count: queueProcessing }] = await Promise.all([
      supabaseAdmin
        .from("ingest_queue")
        .select("id", { count: "exact", head: true })
        .eq("enrichment_status", "pending"),
      supabaseAdmin
        .from("ingest_queue")
        .select("id", { count: "exact", head: true })
        .eq("enrichment_status", "processing"),
    ]);
    const { data: lastDrain } = await supabaseAdmin
      .from("ingest_queue_run_log")
      .select("finished_at")
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1);

    // ---- Top lookup users (last hour) ----
    const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: topUsageRaw } = await supabaseAdmin
      .from("rate_limit_lookups")
      .select("user_id, count, window_start")
      .gte("window_start", hourAgo)
      .order("count", { ascending: false })
      .limit(20);
    const usageByUser = new Map<string, number>();
    for (const r of (topUsageRaw ?? []) as Array<{ user_id: string; count: number }>) {
      usageByUser.set(r.user_id, (usageByUser.get(r.user_id) ?? 0) + (r.count ?? 0));
    }
    const topIds = [...usageByUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    let topUsers: Array<{ user_id: string; handle: string; count: number }> = [];
    if (topIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, email, display_name")
        .in("id", topIds.map(([id]) => id));
      const profMap = new Map(
        ((profs ?? []) as Array<{ id: string; email: string; display_name: string | null }>).map(
          (p) => [p.id, p.display_name ?? p.email.split("@")[0]],
        ),
      );
      topUsers = topIds.map(([id, count]) => ({
        user_id: id,
        handle: profMap.get(id) ?? id.slice(0, 8),
        count,
      }));
    }

    return {
      config: cfg,
      runs: runs ?? [],
      recentRunCount: recentCount ?? 0,
      matcher: {
        unmatched: unmatchedCount ?? 0,
        matchedLast24h,
        llmCallsLast24h,
        llmTokensLast24h,
      },
      lookup: {
        count: lookupCount,
        limit: 200,
        windowStart: lookupWindowFresh ? lookupWindowStart : null,
      },
      queue: {
        pending: queuePending ?? 0,
        processing: queueProcessing ?? 0,
        lastDrainAt: lastDrain?.[0]?.finished_at ?? null,
      },
      topLookupUsers: topUsers,
    };
  });

const ConfigPatchSchema = z.object({
  adapter: z.enum(["x_api_v2", "mock", "socialdata", "twitterapi_io"]).optional(),
  enabled: z.boolean().optional(),
  poll_interval_minutes: z.number().int().min(1).max(60 * 24).optional(),
  rate_limit_per_15min: z.number().int().min(1).max(10000).optional(),
  default_lookback_minutes: z.number().int().min(5).max(60 * 24 * 7).optional(),
});

export const updateIngestionConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ConfigPatchSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) {
      throw new Response("Admin required", { status: 403 });
    }
    const { error } = await supabaseAdmin
      .from("ingestion_config")
      .update({ ...data, updated_at: new Date().toISOString(), updated_by: userId })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return loadConfig();
  });
