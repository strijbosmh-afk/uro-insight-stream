// Server-only helper: resolve the timezone used to evaluate a watchlist's
// quiet hours. Resolution chain:
//   1. user_watchlists.timezone (per-watchlist override)
//   2. user_digest_subscriptions.timezone for the same user (most-recent row)
//   3. 'UTC'
// Keep all callers (delivery, flush, future digest unification) routed
// through this helper so the chain is defined once.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function resolveWatchlistTimezone(args: {
  watchlistTimezone?: string | null;
  userId: string;
}): Promise<string> {
  const direct = (args.watchlistTimezone ?? "").trim();
  if (direct) return direct;
  const { data } = await supabaseAdmin
    .from("digest_subscriptions")
    .select("timezone")
    .eq("user_id", args.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const fromDigest = (data?.timezone as string | undefined)?.trim();
  if (fromDigest) return fromDigest;
  return "UTC";
}

/**
 * Determine whether `now` falls inside the watchlist's quiet hours, evaluated
 * in the resolved timezone. Mirrors the wrap-around semantics of the original
 * UTC helper (start === end → never quiet; start > end → wraps midnight).
 */
export function isInQuietHoursTz(
  start: number,
  end: number,
  tz: string,
  now: Date = new Date(),
): boolean {
  if (start === end) return false;
  let h: number;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
    // Intl returns "24" for midnight in some locales; normalize.
    const parsed = parseInt(hourPart, 10);
    h = Number.isFinite(parsed) ? parsed % 24 : now.getUTCHours();
  } catch {
    h = now.getUTCHours();
  }
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}