import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runIngestionForTarget, loadConfig } from "./ingestion.server";
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
