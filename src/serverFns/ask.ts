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