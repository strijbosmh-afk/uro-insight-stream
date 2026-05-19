// Super-admin check used by app-wide configuration endpoints.
//
// Pattern matches the existing hard-coded email check used by
// admin.users.tsx + admin-users.ts (the "protected account" guard) — kept
// in lockstep so promoting another account requires changing one constant.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const SUPER_ADMIN_EMAIL = "strijbosmh@gmail.com";

/**
 * Throws a 403 Response unless the caller is the super-admin account.
 * Use BEFORE `assertAdmin` is sufficient — super-admin is a strict subset.
 */
export async function assertSuperAdmin(userId: string): Promise<void> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = data?.user?.email?.toLowerCase();
  if (!email || email !== SUPER_ADMIN_EMAIL) {
    throw new Response("Forbidden: super-admin only", { status: 403 });
  }
}
