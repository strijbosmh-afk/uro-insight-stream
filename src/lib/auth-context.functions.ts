import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// JSON-serialisable shapes only — TanStack server-fn return types must
// satisfy the framework's serialisable validator.
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type AuthContextPayload = {
  profile: Json;
  roles: string[];
  prefs: Json;
};

export const getMyAuthContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuthContextPayload> => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roleRows }, { data: prefs }] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase
          .from("user_preferences")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
    return {
      profile: (profile as Json) ?? null,
      roles: ((roleRows ?? []) as { role: string }[]).map((r) => r.role),
      prefs: (prefs as Json) ?? null,
    };
  });