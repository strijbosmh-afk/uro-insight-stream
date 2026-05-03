// Cron-route auth helper.
//
// Audit fix C1: routes now read X_JOB_SECRET from the Postgres vault via
// `public.get_cron_job_secret()` instead of `process.env.X_JOB_SECRET`.
// Vault is the single source of truth — env-var drift can no longer break cron.
//
// A 60-second in-memory cache keeps the per-tick DB lookup cheap.
//
// IMPORTANT: do NOT add `process.env.X_JOB_SECRET` back into the codebase or
// to Lovable secrets. The whole drift-prone path is intentionally gone.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CACHE_TTL_MS = 60_000;
let cachedSecret: { value: string; expiresAt: number } | null = null;

async function getCronJobSecret(): Promise<string | null> {
  const now = Date.now();
  if (cachedSecret && cachedSecret.expiresAt > now) return cachedSecret.value;
  const rpc = supabaseAdmin as unknown as {
    rpc: (fn: string) => Promise<{ data: string | null; error: { message: string } | null }>;
  };
  const { data, error } = await rpc.rpc("get_cron_job_secret");
  if (error || !data) {
    cachedSecret = null;
    return null;
  }
  cachedSecret = { value: data, expiresAt: now + CACHE_TTL_MS };
  return data;
}

/**
 * Verify a cron-route request. Returns null on success; returns a 401 Response
 * to be returned directly by the handler on failure.
 *
 * Usage:
 *   const auth = await requireCronAuth(request);
 *   if (auth) return auth;
 */
export async function requireCronAuth(request: Request): Promise<Response | null> {
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!got) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing_authorization" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  const expected = await getCronJobSecret();
  if (!expected) {
    return new Response(
      JSON.stringify({ ok: false, error: "vault_unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  if (got !== expected) {
    return new Response(
      JSON.stringify({ ok: false, error: "unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

/**
 * Diagnostic helper. Returns SHA-256 prefix of the cached vault secret so
 * an admin endpoint can confirm "the secret in vault matches what routes
 * see" without exposing the value itself.
 */
export async function getCronJobSecretFingerprint(): Promise<string | null> {
  const v = await getCronJobSecret();
  if (!v) return null;
  const buf = new TextEncoder().encode(v);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
