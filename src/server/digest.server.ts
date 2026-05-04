import * as React from "react";
import { render } from "@react-email/components";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { template as digestTemplate, type DigestSourceGroup } from "@/lib/email-templates/digest";

const SITE_NAME = "UroFeed";
const SENDER_DOMAIN = "notify.urofeed.com";
const FROM_DOMAIN = "urofeed.com";

// Hard cap so a long-paused digest never sends a 6-month firehose.
const MAX_LOOKBACK_DAYS = 30;

function frequencyWindowMs(frequency: string): number {
  switch (frequency) {
    case "daily":
      return 24 * 60 * 60 * 1000;
    case "weekly":
      return 7 * 24 * 60 * 60 * 1000;
    case "biweekly":
      return 14 * 24 * 60 * 60 * 1000;
    case "monthly":
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

/**
 * Compute next_send_at from a given anchor in the user's local timezone.
 * For "daily": next occurrence of sendHour today/tomorrow.
 * For "weekly"/"biweekly": next occurrence of dayOfWeek at sendHour, +1 or +2 weeks.
 * For "monthly": same day-of-month next month at sendHour.
 *
 * Implementation runs in UTC math with a TZ offset estimate from
 * Intl.DateTimeFormat — accurate enough for hourly granularity.
 */
export function computeNextSendAt(params: {
  frequency: string;
  dayOfWeek?: number | null;
  sendHour: number;
  timezone: string;
  fromISO?: string;
}): string {
  const { frequency, dayOfWeek, sendHour, timezone } = params;
  const from = params.fromISO ? new Date(params.fromISO) : new Date();

  // Get the offset (in minutes) for the target tz at "from".
  const tzOffsetMin = getTimezoneOffsetMinutes(timezone, from);
  // Convert "now" to a wall-clock Date in the target tz.
  const localNow = new Date(from.getTime() + tzOffsetMin * 60_000);

  const candidate = new Date(localNow);
  candidate.setUTCMinutes(0, 0, 0);
  candidate.setUTCHours(sendHour);

  if (frequency === "daily") {
    if (candidate <= localNow) candidate.setUTCDate(candidate.getUTCDate() + 1);
  } else if (frequency === "weekly" || frequency === "biweekly") {
    const target = (dayOfWeek ?? 1) % 7; // 0=Sun..6=Sat
    const cur = candidate.getUTCDay();
    let delta = (target - cur + 7) % 7;
    if (delta === 0 && candidate <= localNow) delta = frequency === "biweekly" ? 14 : 7;
    candidate.setUTCDate(candidate.getUTCDate() + delta);
    if (frequency === "biweekly" && delta < 14 && candidate <= localNow) {
      candidate.setUTCDate(candidate.getUTCDate() + 14);
    }
  } else if (frequency === "monthly") {
    if (candidate <= localNow) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  }

  // Convert candidate (in target-tz wall clock) back to true UTC.
  return new Date(candidate.getTime() - tzOffsetMin * 60_000).toISOString();
}

function getTimezoneOffsetMinutes(timezone: string, at: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = dtf.formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    const asUTC = Date.UTC(
      get("year"), get("month") - 1, get("day"),
      get("hour"), get("minute"), get("second"),
    );
    return Math.round((asUTC - at.getTime()) / 60_000);
  } catch {
    return 0;
  }
}

type DigestRow = {
  id: string;
  user_id: string;
  name: string;
  frequency: string;
  day_of_week: number | null;
  send_hour: number;
  timezone: string;
  is_active: boolean;
  last_sent_at: string | null;
  next_send_at: string;
};

export async function gatherDigestContent(digest: DigestRow): Promise<{
  groups: DigestSourceGroup[];
  windowStart: string;
  windowEnd: string;
  totalTweets: number;
}> {
  const windowEnd = new Date();
  // Determine since: max(last_sent_at, frequencyWindow, now - MAX_LOOKBACK)
  const freqWindowStart = new Date(windowEnd.getTime() - frequencyWindowMs(digest.frequency));
  const hardCap = new Date(windowEnd.getTime() - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const lastSent = digest.last_sent_at ? new Date(digest.last_sent_at) : freqWindowStart;
  const since = new Date(Math.max(lastSent.getTime(), hardCap.getTime()));

  // Get configured sources for the digest
  const { data: srcRows } = await supabaseAdmin
    .from("digest_subscription_sources")
    .select("source_id")
    .eq("digest_id", digest.id);
  const sourceIds = (srcRows ?? []).map((r: { source_id: string }) => r.source_id);
  if (sourceIds.length === 0) {
    return { groups: [], windowStart: since.toISOString(), windowEnd: windowEnd.toISOString(), totalTweets: 0 };
  }

  // Source metadata
  const { data: sourceMeta } = await supabaseAdmin
    .from("sources")
    .select("id, handle, display_name")
    .in("id", sourceIds);
  const metaById = new Map(
    ((sourceMeta ?? []) as Array<{ id: string; handle: string; display_name: string }>).map(
      (s) => [s.id, s],
    ),
  );

  // Pull tweets per source (top 10 by engagement). Postgres can't do windowed
  // limits cheaply via PostgREST, so we batch per source.
  const groups: DigestSourceGroup[] = [];
  for (const sid of sourceIds) {
    const { data: tweets } = await supabaseAdmin
      .from("tweets")
      .select("id, text, author_handle, author_display_name, created_at, like_count, retweet_count, reply_count")
      .eq("source_id", sid)
      .gte("created_at", since.toISOString())
      .lt("created_at", windowEnd.toISOString())
      .limit(80);
    const arr = (tweets ?? []) as Array<{
      id: string; text: string; author_handle: string; author_display_name: string | null;
      created_at: string; like_count: number; retweet_count: number; reply_count: number;
    }>;
    if (arr.length === 0) continue;
    arr.sort((a, b) => {
      const sa = (a.like_count ?? 0) + (a.retweet_count ?? 0) + (a.reply_count ?? 0);
      const sb = (b.like_count ?? 0) + (b.retweet_count ?? 0) + (b.reply_count ?? 0);
      return sb - sa;
    });
    const top = arr.slice(0, 10);
    const meta = metaById.get(sid);
    groups.push({
      source_id: sid,
      handle: meta?.handle ?? sid,
      display_name: meta?.display_name ?? meta?.handle ?? sid,
      tweets: top.map((t) => ({
        id: t.id,
        text: t.text,
        author_handle: t.author_handle,
        author_display_name: t.author_display_name,
        created_at: t.created_at,
        like_count: t.like_count,
        retweet_count: t.retweet_count,
      })),
    });
  }

  // Global cap of 50 tweets (proportional trim — keep top per source first)
  let total = groups.reduce((acc, g) => acc + g.tweets.length, 0);
  while (total > 50) {
    // remove last tweet from the group with the most tweets
    let largest = groups[0];
    for (const g of groups) if (g.tweets.length > largest.tweets.length) largest = g;
    largest.tweets.pop();
    total -= 1;
  }
  // Drop empty groups defensively
  const final = groups.filter((g) => g.tweets.length > 0);

  return {
    groups: final,
    windowStart: since.toISOString(),
    windowEnd: windowEnd.toISOString(),
    totalTweets: final.reduce((a, g) => a + g.tweets.length, 0),
  };
}

function windowLabel(sinceISO: string, untilISO: string): string {
  const since = new Date(sinceISO);
  const until = new Date(untilISO);
  const days = Math.max(1, Math.round((until.getTime() - since.getTime()) / (24 * 3600 * 1000)));
  return `Last ${days} day${days === 1 ? "" : "s"}`;
}

export async function sendDigestEmail(digest: DigestRow): Promise<{
  sent: number;
  skipped: number;
  totalTweets: number;
}> {
  const content = await gatherDigestContent(digest);

  // Get recipients
  const { data: rcptRows } = await supabaseAdmin
    .from("digest_subscription_recipients")
    .select("email, is_default")
    .eq("digest_id", digest.id);
  const recipients = (rcptRows ?? []) as Array<{ email: string; is_default: boolean }>;

  if (recipients.length === 0) return { sent: 0, skipped: 0, totalTweets: content.totalTweets };
  if (content.totalTweets === 0) {
    // Still update last_sent_at so we don't keep re-evaluating. Caller handles updates.
    return { sent: 0, skipped: recipients.length, totalTweets: 0 };
  }

  const props = {
    digestName: digest.name,
    windowLabel: windowLabel(content.windowStart, content.windowEnd),
    groups: content.groups,
  };
  const element = React.createElement(digestTemplate.component, props);
  const html = await render(element);
  const plainText = await render(element, { plainText: true });
  const subject = typeof digestTemplate.subject === "function"
    ? digestTemplate.subject(props as Record<string, unknown>)
    : digestTemplate.subject;

  let sent = 0;
  let skipped = 0;
  for (const r of recipients) {
    const normalized = r.email.toLowerCase();
    // suppression check
    const { data: sup } = await supabaseAdmin
      .from("suppressed_emails")
      .select("email")
      .eq("email", normalized)
      .maybeSingle();
    if (sup) {
      skipped += 1;
      continue;
    }
    const messageId = crypto.randomUUID();
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "digest",
      recipient_email: normalized,
      status: "pending",
    } as never);
    const rpc = supabaseAdmin as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
    const { error: enqErr } = await rpc.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: normalized,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text: plainText,
        purpose: "transactional",
        label: "digest",
        idempotency_key: `digest-${digest.id}-${normalized}-${Date.now()}`,
        queued_at: new Date().toISOString(),
      },
    });
    if (enqErr) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "digest",
        recipient_email: normalized,
        status: "failed",
        error_message: enqErr.message.slice(0, 1000),
      } as never);
      skipped += 1;
    } else {
      sent += 1;
    }
  }
  return { sent, skipped, totalTweets: content.totalTweets };
}