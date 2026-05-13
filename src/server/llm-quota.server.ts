// Server-only soft quota for "expensive" LLM calls (themes, briefings,
// reply-draft generation). Distinct counter from watchlist classifications
// so a user binge-classifying their feed doesn't lock them out of asking
// for a source briefing (and vice versa).
//
// Backed by the atomic bump_user_llm_quota SQL function (see B11) — safe
// under concurrent invocations.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emitOpsAlert } from "@/server/ops-alerts.server";

/** Per-user daily cap on cache-miss LLM generations. */
export const DAILY_EXPENSIVE_LLM_CAP = 100;
/**
 * H-O5: org-wide ceiling on expensive LLM calls per UTC day. A "regenerate
 * storm" from a single power user (or a handful of new users hammering
 * briefings) can balloon spend; this caps total LLM cost regardless of
 * per-user quotas. Tune in code as the user base grows.
 */
export const DAILY_GLOBAL_EXPENSIVE_LLM_CAP = 2000;

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
  // 1) Global ceiling first — cheaper to short-circuit before per-user RPC.
  const globalOk = await reserveGlobalExpensiveSlot(n);
  if (!globalOk) return false;

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
    // Roll back the global slot too — it was claimed for a call that
    // never happened.
    await supabaseAdmin.rpc("bump_user_llm_quota", {
      _user_id: GLOBAL_QUOTA_USER_ID,
      _day: todayUtc(),
      _kind: "expensive_calls_global",
      _n: -n,
    });
    void emitOpsAlert({
      kind: "llm_quota_exhausted",
      severity: "info",
      message: `User ${userId} hit per-user daily LLM cap (${DAILY_EXPENSIVE_LLM_CAP}).`,
      metadata: { user_id: userId, cap: DAILY_EXPENSIVE_LLM_CAP },
      dedupeWindowHours: 6,
    });
    return false;
  }
  return true;
}

// Sentinel UUID used to bucket the org-wide counter in user_llm_quota.
// Reused row per UTC day; row's `_kind` distinguishes from per-user buckets.
const GLOBAL_QUOTA_USER_ID = "00000000-0000-0000-0000-000000000000";

async function reserveGlobalExpensiveSlot(n: number): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("bump_user_llm_quota", {
    _user_id: GLOBAL_QUOTA_USER_ID,
    _day: todayUtc(),
    _kind: "expensive_calls_global",
    _n: n,
  });
  if (error) {
    console.error("[llm-quota] global reserve failed", error);
    return true; // fail-open
  }
  const totalAfter = typeof data === "number" ? data : Number(data ?? 0);
  if (totalAfter > DAILY_GLOBAL_EXPENSIVE_LLM_CAP) {
    await supabaseAdmin.rpc("bump_user_llm_quota", {
      _user_id: GLOBAL_QUOTA_USER_ID,
      _day: todayUtc(),
      _kind: "expensive_calls_global",
      _n: -n,
    });
    void emitOpsAlert({
      kind: "global_llm_cap_hit",
      severity: "critical",
      message: `Daily org-wide LLM cap (${DAILY_GLOBAL_EXPENSIVE_LLM_CAP}) reached. New generations blocked.`,
      metadata: { cap: DAILY_GLOBAL_EXPENSIVE_LLM_CAP, day: todayUtc() },
      dedupeWindowHours: 6,
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