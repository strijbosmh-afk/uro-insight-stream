import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getXSetupProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data } = await supabaseAdmin
      .from("user_x_setup_progress")
      .select("current_step, completed_steps, tier_chosen, notes, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("x_grace_until")
      .eq("id", userId)
      .maybeSingle();
    return {
      progress: data ?? {
        current_step: 1,
        completed_steps: [] as number[],
        tier_chosen: null as string | null,
        notes: null as string | null,
      },
      grace_until: (prof as { x_grace_until?: string | null } | null)?.x_grace_until ?? null,
    };
  });

const SaveSchema = z.object({
  current_step: z.number().int().min(1).max(8),
  completed_steps: z.array(z.number().int().min(1).max(8)).max(8).optional(),
  tier_chosen: z.enum(["free", "basic", "pro", "enterprise"]).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const saveXSetupProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const row = {
      user_id: userId,
      current_step: data.current_step,
      completed_steps: data.completed_steps ?? [],
      tier_chosen: data.tier_chosen ?? null,
      notes: data.notes ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin
      .from("user_x_setup_progress")
      .upsert(row, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    // Mirror tier on the active credentials row when present.
    if (data.tier_chosen) {
      await supabaseAdmin
        .from("user_x_credentials")
        .update({ tier: data.tier_chosen })
        .eq("user_id", userId)
        .eq("is_active", true);
    }
    return { ok: true as const };
  });

export const dismissXOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    await supabaseAdmin
      .from("user_x_setup_progress")
      .upsert(
        {
          user_id: userId,
          current_step: 1,
          notes: "dismissed_onboarding",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    return { ok: true as const };
  });