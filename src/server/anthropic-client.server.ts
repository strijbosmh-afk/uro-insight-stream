// Server-only: shared Anthropic SDK client + small helpers.
//
// Key resolution order:
//   1. `app_secrets.anthropic_api_key` row managed by the super admin via
//      the in-app settings panel (see src/serverFns/admin-secrets.ts).
//   2. `ANTHROPIC_API_KEY` environment variable (local dev fallback,
//      wrangler secret in prod).
//
// Resolved keys are cached in module memory for 60s so a busy
// congress-lookup loop doesn't hit Supabase on every call.

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ANTHROPIC_KEY_NAME = "anthropic_api_key";
const KEY_CACHE_TTL_MS = 60_000;

let cache: { key: string; client: Anthropic; expiresAt: number } | null = null;

/** Wipe the cached key + client so the next `getAnthropic()` re-resolves
 *  from DB/env. Call from `setAnthropicKey` / `clearAnthropicKey`. */
export function invalidateAnthropicCache(): void {
  cache = null;
}

async function resolveKey(): Promise<string> {
  // 1. DB-managed key (super-admin can rotate without redeploy).
  try {
    const { data } = await supabaseAdmin
      .from("app_secrets" as never)
      .select("value")
      .eq("key_name", ANTHROPIC_KEY_NAME)
      .maybeSingle();
    const row = data as { value?: string } | null;
    if (row?.value) return row.value;
  } catch (e) {
    // app_secrets table missing (migration not yet applied) is fine — fall
    // through to env. Anything else is logged but non-fatal.
    console.warn("[anthropic-client] app_secrets read failed; falling back to env", e);
  }
  // 2. Env-var fallback.
  const env = process.env.ANTHROPIC_API_KEY;
  if (env) return env;
  throw new Error(
    "anthropic_not_configured: no API key in app_secrets and no ANTHROPIC_API_KEY env var.",
  );
}

/**
 * Returns a cached Anthropic SDK client. Async because the key may live in
 * Supabase rather than the process env. Cached for 60s in module memory.
 */
export async function getAnthropic(): Promise<Anthropic> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.client;
  const key = await resolveKey();
  // Only rebuild the client when the key actually changes; otherwise just
  // bump the TTL (avoids tearing down/recreating the SDK's keepalive pool).
  if (cache && cache.key === key) {
    cache.expiresAt = now + KEY_CACHE_TTL_MS;
    return cache.client;
  }
  const client = new Anthropic({ apiKey: key });
  cache = { key, client, expiresAt: now + KEY_CACHE_TTL_MS };
  return client;
}

/**
 * Convert Anthropic SDK errors to the error-string contract the rest of the
 * app's server functions already speak (`rate_limited`, `payment_required`,
 * `anthropic_overloaded`, `anthropic_unconfigured`). Anything else is rethrown
 * unchanged.
 */
export function normalizeAnthropicError(e: unknown): never {
  if (e instanceof Anthropic.RateLimitError) throw new Error("rate_limited");
  if (e instanceof Anthropic.AuthenticationError) throw new Error("anthropic_unauthorized");
  if (e instanceof Anthropic.PermissionDeniedError) throw new Error("anthropic_forbidden");
  // 529 = Overloaded. SDK ≤0.97 exposes it only as APIError with status 529,
  // not a dedicated OverloadedError class.
  if (e instanceof Anthropic.APIError && e.status === 529) {
    throw new Error("anthropic_overloaded");
  }
  if (e instanceof Error && e.message.startsWith("anthropic_not_configured")) {
    throw new Error("anthropic_not_configured");
  }
  throw e;
}
