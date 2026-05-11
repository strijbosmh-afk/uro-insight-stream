import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "@/server/admin-middleware.server";

export type OpsAlert = {
  id: string;
  alert_kind: string;
  severity: "info" | "warning" | "critical";
  message: string;
  metadata: unknown;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
};

export const listOpsAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await supabaseAdmin
      .from("ops_alerts")
      .select(
        "id, alert_kind, severity, message, metadata, acknowledged_at, acknowledged_by, created_at",
      )
      .order("acknowledged_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as OpsAlert[];
  });

const AckSchema = z.object({ id: z.string().uuid() });

export const acknowledgeOpsAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AckSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("ops_alerts")
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });