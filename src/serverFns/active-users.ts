import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/server/admin-middleware.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getActiveUserCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Admin-only metric. Non-admins silently get 0 so the StatusBar cell
    // simply renders "—" rather than throwing in the UI.
    try {
      await assertAdmin(context.supabase, context.userId);
    } catch {
      return { count: 0 };
    }
    const { data, error } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
    ) => Promise<{ data: number | null; error: unknown }>)(
      "get_active_user_count",
    );
    if (error) {
      console.error("[active-users] rpc failed", error);
      return { count: 0 };
    }
    return { count: typeof data === "number" ? data : 0 };
  });