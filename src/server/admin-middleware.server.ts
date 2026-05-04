// Server-only helper that, given the authenticated supabase client from
// requireSupabaseAuth, asserts that the caller has the admin role.
// Throws a 403 Response on failure (server fns surface it as an error).

import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // Use the user-context client — RLS on user_roles permits self-read.
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) {
    console.error("[assertAdmin] role lookup failed", error);
    throw new Response("Forbidden", { status: 403 });
  }
  if (!data) {
    throw new Response("Forbidden: admin role required", { status: 403 });
  }
}