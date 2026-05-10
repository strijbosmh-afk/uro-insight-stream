import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ensureDemoAuthUser,
  resetAllDemoUsers,
  seedDemoUser,
  wipeDemoUser,
} from "@/server/demo-seed.server";

async function assertAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("admin role required");
}

/** Create or repair the demo auth user + seed it. Admin-only. */
export const provisionDemoAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { userId, created } = await ensureDemoAuthUser();
    await wipeDemoUser(userId);
    const totals = await seedDemoUser(userId);
    return { ok: true as const, userId, created, totals };
  });

/** Wipe + reseed every is_demo profile. Admin-only. */
export const resetDemoAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const result = await resetAllDemoUsers();
    return { ok: true as const, ...result };
  });