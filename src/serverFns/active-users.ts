import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getActiveUserCount = createServerFn({ method: "GET" }).handler(
  async () => {
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
  },
);