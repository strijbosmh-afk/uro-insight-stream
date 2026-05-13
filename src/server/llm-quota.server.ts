// Server-only soft quota for "expensive" LLM calls (themes, briefings,
// reply-draft generation). Distinct counter from watchlist classifications
// so a user binge-classifying their feed doesn't lock them out of asking
// for a source briefing (and vice versa).
//
// Backed by the atomic bump_user_llm_quota SQL function (see B11) — safe
// under concurrent invocations.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Per-user daily cap on cache-miss LLM generations. */
export const DAILY_EXPENSIVE_LLM_CAP = 100;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Atomically reserve `n` expensive-LLM calls against the caller's daily
 * budget. Returns true if the reservation succeeded (caller may proceed),
 * false if the cap would be exceeded.
 *
 * Note: this both checks AND increments in a single round-trip. Callers
 * should NOT increment again after the LLM call succeeds.
 */
export async function reserveExpensiveLlmCall(
  userId: string,
  n: number = 1,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("bump_user_llm_quota", {
    _user_id: userId,
    _day: todayUtc(),
    _kind: "expensive_calls",
    _n: n,
  });
  if (error) {
    // Fail-open on infrastructure errors so a transient DB hiccup doesn't
    // brick LLM-backed features for everyone — but log loudly.
    console.error("[llm-quota] reserveExpensiveLlmCall failed", error);
    return true;
  }
  const totalAfter = typeof data === "number" ? data : Number(data ?? 0);
  if (totalAfter > DAILY_EXPENSIVE_LLM_CAP) {
    // Roll back the slot we just claimed so users get exactly `cap`
    // successful reservations per day, not `cap - 1`.
    await supabaseAdmin.rpc("bump_user_llm_quota", {
      _user_id: userId,
      _day: todayUtc(),
      _kind: "expensive_calls",
      _n: -n,
    });
    return false;
  }
  return true;
}

export class LlmQuotaExceededError extends Error {
  code = "llm_quota_exceeded" as const;
  constructor() {
    super(
      `Daily AI generation limit reached (${DAILY_EXPENSIVE_LLM_CAP} per user). Try again tomorrow.`,
    );
  }
}