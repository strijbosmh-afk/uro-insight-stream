import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Returns the count of distinct users with an active (non-expired) Supabase
 * auth session. Updated within the last 30 minutes to approximate "currently
 * logged in".
 */
export async function getActiveUserCount(): Promise<number> {
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  // @ts-expect-error - auth schema not in generated Database types
  const { data, error } = await supabaseAdmin
    .schema("auth")
    .from("sessions")
    .select("user_id, not_after, updated_at");
  if (error) {
    console.error("[active-users] query failed", error);
    return 0;
  }
  const now = Date.now();
  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{
    user_id: string;
    not_after: string | null;
    updated_at: string | null;
  }>) {
    const notAfter = row.not_after ? new Date(row.not_after).getTime() : null;
    if (notAfter !== null && notAfter < now) continue;
    if (row.updated_at && new Date(row.updated_at).toISOString() < since) continue;
    ids.add(row.user_id);
  }
  return ids.size;
}