import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  computeAsk,
  listRecentForUser,
  listStarters,
  type AskScope,
} from "@/server/ask.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ScopeEnum = z.enum(["all", "following", "specialty"]);

const AskSchema = z.object({
  query: z
    .string()
    .trim()
    .min(3, "Question is too short")
    .max(300, "Question is too long")
    .regex(/\S/, "Question cannot be empty"),
  scope: ScopeEnum.default("following"),
  window_days: z.number().int().min(1).max(365).default(30),
  max_sources: z.number().int().min(5).max(50).default(30),
});

export const askUroFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AskSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const result = await computeAsk({
      query: data.query,
      scope: data.scope as AskScope,
      window_days: data.window_days,
      max_sources: data.max_sources,
      user_id: userId,
    });
    return result;
  });

export const listAskRecent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return listRecentForUser(context.userId, 5);
  });

export const listAskStarters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: spec } = await supabaseAdmin
      .from("user_specialties")
      .select("specialty_id")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();
    const primary = (spec as { specialty_id?: string } | null)?.specialty_id ?? null;
    return listStarters(primary);
  });

const SuggestSchema = z.object({
  term: z.string().trim().min(1).max(60),
  limit: z.number().int().min(1).max(10).default(6),
});

export type SourceSuggestion = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  verified: boolean;
  followers_count: number | null;
  followed: boolean;
};

export const suggestAskSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SuggestSchema.parse(data))
  .handler(async ({ data, context }): Promise<SourceSuggestion[]> => {
    const { userId } = context;
    const raw = data.term.replace(/^@+/, "").trim();
    if (raw.length < 1) return [];
    // Escape PostgREST OR special chars
    const safe = raw.replace(/[%,()]/g, " ").trim();
    if (!safe) return [];
    const pattern = `%${safe}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("sources")
      .select("id, handle, display_name, avatar_url, verified, followers_count")
      .eq("active", true)
      .or(`handle.ilike.${pattern},display_name.ilike.${pattern}`)
      .order("followers_count", { ascending: false, nullsFirst: false })
      .limit(data.limit * 3);
    if (error) return [];
    const list = (rows ?? []) as Array<{
      id: string;
      handle: string;
      display_name: string;
      avatar_url: string | null;
      verified: boolean;
      followers_count: number | null;
    }>;
    if (list.length === 0) return [];
    const ids = list.map((r) => r.id);
    const { data: subRows } = await supabaseAdmin
      .from("user_subscribed_sources")
      .select("source_id")
      .eq("user_id", userId)
      .in("source_id", ids);
    const followed = new Set(
      ((subRows ?? []) as Array<{ source_id: string }>).map((r) => r.source_id),
    );
    const lower = raw.toLowerCase();
    // Score: prefer prefix matches on handle/display_name and followed sources.
    const scored = list.map((r) => {
      const h = r.handle.toLowerCase();
      const d = (r.display_name ?? "").toLowerCase();
      let score = 0;
      if (h === lower) score += 100;
      else if (h.startsWith(lower)) score += 60;
      else if (h.includes(lower)) score += 20;
      if (d.startsWith(lower)) score += 50;
      else if (d.includes(` ${lower}`) || d.split(" ").some((w) => w.startsWith(lower)))
        score += 30;
      else if (d.includes(lower)) score += 10;
      if (followed.has(r.id)) score += 25;
      score += Math.min(10, Math.log10((r.followers_count ?? 0) + 1));
      return { r, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, data.limit).map(({ r }) => ({
      id: r.id,
      handle: r.handle,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
      verified: r.verified,
      followers_count: r.followers_count,
      followed: followed.has(r.id),
    }));
  });