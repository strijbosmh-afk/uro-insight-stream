// Server-only: shared Anthropic SDK client + small helpers.
//
// Requires ANTHROPIC_API_KEY in the environment. Locally: set it in `.env`.
// In production (Cloudflare Workers): `wrangler secret put ANTHROPIC_API_KEY`.

import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null = null;

/**
 * Returns a cached Anthropic SDK client. Throws if `ANTHROPIC_API_KEY` is not
 * configured — callers should let this propagate so the UI surfaces a clear
 * error instead of silently degrading.
 */
export function getAnthropic(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "anthropic_not_configured: ANTHROPIC_API_KEY is missing — set it in .env (local) or via `wrangler secret put` (prod).",
    );
  }
  cached = new Anthropic({ apiKey });
  return cached;
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
