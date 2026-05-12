import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AuthContextPayload = {
  profile: Record<string, unknown> | null;
  roles: string[];
  prefs: Record<string, unknown> | null;
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
      profile: (profile as Record<string, unknown> | null) ?? null,
      roles: ((roleRows ?? []) as { role: string }[]).map((r) => r.role),
      prefs: (prefs as Record<string, unknown> | null) ?? null,
    };
  });