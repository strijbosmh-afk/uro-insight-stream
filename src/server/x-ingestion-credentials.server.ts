// Server-only: resolve which credentials a per-user ingestion job should use.
//
// Decision tree per requesting user U:
//   1. If U has active OAuth1 credentials -> use them ("user").
//   2. Else if now < U.profile.x_grace_until AND no successful job in the last
//      24h AND the job's source is among U's top-10 most-recently subscribed
//      sources -> use platform X_BEARER_TOKEN ("platform_grace") at reduced
//      cadence (1x / day per source).
//   3. Else -> skip the job with reason "no_credentials" or "grace_expired"
//      or "grace_capped".

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadCredentials, type XCredentials } from "@/server/x-credentials.server";

export type IngestAuthDecision =
  | { mode: "user"; creds: XCredentials }
  | { mode: "platform_grace"; reason: string }
  | { mode: "skip"; reason: "no_credentials" | "grace_expired" | "grace_capped" };

const GRACE_DAILY_SOURCE_CAP = 10;
const GRACE_MIN_HOURS_BETWEEN_INGESTS = 24;

export async function resolveIngestionAuth(
  userId: string | null | undefined,
  sourceId: string,
): Promise<IngestAuthDecision> {
  // Anonymous / cron-wide jobs (no user context) keep using the platform bearer
  // token. Treat as platform_grace with no caps -- callers pass null.
  if (!userId) {
    return { mode: "platform_grace", reason: "no_user_context" };
  }

  const creds = await loadCredentials(userId).catch(() => null);
  if (creds) return { mode: "user", creds };

  // Check grace window.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("x_grace_until, created_at")
    .eq("id", userId)
    .maybeSingle();
  const graceUntilISO =
    (profile as { x_grace_until?: string | null } | null)?.x_grace_until ??
    (profile?.created_at
      ? new Date(new Date(profile.created_at).getTime() + 14 * 86400_000).toISOString()
      : null);
  if (!graceUntilISO || new Date(graceUntilISO).getTime() < Date.now()) {
    return { mode: "skip", reason: "grace_expired" };
  }

  // Top-10 most recently subscribed sources for this user.
  const { data: subs } = await supabaseAdmin
    .from("user_subscribed_sources")
    .select("source_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(GRACE_DAILY_SOURCE_CAP);
  const allowed = new Set(
    ((subs ?? []) as Array<{ source_id: string }>).map((r) => r.source_id),
  );
  if (!allowed.has(sourceId)) {
    return { mode: "skip", reason: "grace_capped" };
  }

  // Once-daily per source: if a successful run for this source exists within
  // the last 24h, skip.
  const sinceISO = new Date(
    Date.now() - GRACE_MIN_HOURS_BETWEEN_INGESTS * 3600_000,
  ).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("ingestion_runs")
    .select("id")
    .eq("target_type", "handle")
    .eq("target", sourceId)
    .eq("status", "success")
    .gte("started_at", sinceISO)
    .limit(1);
  if ((recent ?? []).length > 0) {
    return { mode: "skip", reason: "grace_capped" };
  }

  return { mode: "platform_grace", reason: "within_grace" };
}

export async function bumpReadCounter(userId: string): Promise<void> {
  // Rolling 15-minute window. Best-effort; failures are swallowed.
  const { data } = await supabaseAdmin
    .from("user_x_credentials")
    .select("id, read_count_window_start, read_count_today")
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return;
  const ws = data.read_count_window_start
    ? new Date(data.read_count_window_start).getTime()
    : 0;
  const expired = !ws || Date.now() - ws > 15 * 60_000;
  await supabaseAdmin
    .from("user_x_credentials")
    .update({
      read_count_today: expired ? 1 : (data.read_count_today ?? 0) + 1,
      read_count_window_start: expired
        ? new Date().toISOString()
        : data.read_count_window_start,
    })
    .eq("id", data.id);
}