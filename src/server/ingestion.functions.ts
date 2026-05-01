import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runIngestionForTarget, loadConfig } from "./ingestion.server";

const TargetSchema = z.object({
  targetType: z.enum(["handle", "hashtag"]),
  target: z.string().min(1).max(200),
  lookbackMinutes: z.number().int().min(5).max(60 * 24 * 7).optional(),
});

async function assertEditor(supabase: Awaited<ReturnType<typeof requireSupabaseAuth.server>> extends never ? never : any, userId: string) {
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
    return {
      config: cfg,
      runs: runs ?? [],
      recentRunCount: recentCount ?? 0,
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
