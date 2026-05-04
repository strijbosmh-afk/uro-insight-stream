import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  DigestSourceGroup,
  DigestTweetItem,
} from "@/lib/email-templates/weekly-digest";

export type DigestFrequency = "daily" | "weekly" | "biweekly" | "monthly";

const MAX_TWEETS_PER_SOURCE = 10;
const MAX_TOTAL_TWEETS = 50;
const MAX_LOOKBACK_DAYS = 30;

function frequencyWindowMs(freq: string): number {
  switch (freq) {
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
 * Compute the next send timestamp (UTC) for a digest based on its frequency,
 * day_of_week (for weekly/biweekly: 0=Sunday..6=Saturday) and send_hour (UTC).
 * For daily: next send at send_hour today or tomorrow. For monthly: ~30 days
 * from now at send_hour. Time math in UTC keeps things simple at this stage —
 * users get an "approximate hour"; full timezone-aware scheduling can come later.
 */
export function computeNextSendAt(args: {
  frequency: string;
  dayOfWeek?: number | null;
  sendHour: number;
  fromMs?: number;
}): Date {
  const fromMs = args.fromMs ?? Date.now();
  const sendHour = Math.max(0, Math.min(23, args.sendHour ?? 9));

  const next = new Date(fromMs);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(sendHour);

  if (args.frequency === "daily") {
    if (next.getTime() <= fromMs) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  if (args.frequency === "weekly" || args.frequency === "biweekly") {
    const targetDow = ((args.dayOfWeek ?? 1) + 7) % 7;
    const currentDow = next.getUTCDay();
    let delta = (targetDow - currentDow + 7) % 7;
    if (delta === 0 && next.getTime() <= fromMs) delta = 7;
    next.setUTCDate(next.getUTCDate() + delta);
    if (args.frequency === "biweekly" && next.getTime() - fromMs < 24 * 60 * 60 * 1000) {
      next.setUTCDate(next.getUTCDate() + 7);
    }
    return next;
  }

  // monthly — ~30 days
  if (next.getTime() <= fromMs) {
    next.setUTCDate(next.getUTCDate() + 30);
  } else {
    next.setUTCDate(next.getUTCDate() + 30);
  }
  return next;
}

type SourceRow = { id: string; handle: string; display_name: string | null };
type TweetRow = {
  id: string;
  source_id: string | null;
  author_handle: string;
  author_display_name: string | null;
  text: string;
  created_at: string;
  like_count: number | null;
  retweet_count: number | null;
  reply_count: number | null;
};

export interface DigestPayload {
  digestId: string;
  digestName: string;
  windowStart: string;
  windowEnd: string;
  totalTweets: number;
  groups: DigestSourceGroup[];
  recipients: string[];
}

/**
 * Build the digest payload (tweet groups + recipients) for one digest.
 * Returns null if there are no recipients or no source subscriptions.
 */
export async function buildDigestPayload(digestId: string): Promise<DigestPayload | null> {
  const { data: digest, error: digestErr } = await supabaseAdmin
    .from("digest_subscriptions")
    .select("id, name, frequency, last_sent_at, next_send_at")
    .eq("id", digestId)
    .maybeSingle();
  if (digestErr || !digest) return null;

  const { data: srcs } = await supabaseAdmin
    .from("digest_subscription_sources")
    .select("source_id")
    .eq("digest_id", digestId);
  const sourceIds = (srcs ?? []).map((r: { source_id: string }) => r.source_id);
  if (sourceIds.length === 0) return null;

  const { data: recs } = await supabaseAdmin
    .from("digest_subscription_recipients")
    .select("email")
    .eq("digest_id", digestId);
  const recipients = (recs ?? []).map((r: { email: string }) => r.email);
  if (recipients.length === 0) return null;

  const now = Date.now();
  const freqWindowStart = now - frequencyWindowMs(digest.frequency);
  const lookbackFloor = now - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const lastSentMs = digest.last_sent_at ? new Date(digest.last_sent_at).getTime() : freqWindowStart;
  const windowStartMs = Math.max(Math.min(lastSentMs, freqWindowStart), lookbackFloor);
  const windowStart = new Date(windowStartMs).toISOString();
  const windowEnd = new Date(now).toISOString();

  // Fetch tweets for sources in the window.
  const { data: tweets } = await supabaseAdmin
    .from("tweets")
    .select(
      "id, source_id, author_handle, author_display_name, text, created_at, like_count, retweet_count, reply_count",
    )
    .in("source_id", sourceIds)
    .gte("created_at", windowStart)
    .lte("created_at", windowEnd)
    .order("created_at", { ascending: false })
    .limit(2000);

  const { data: sources } = await supabaseAdmin
    .from("sources")
    .select("id, handle, display_name")
    .in("id", sourceIds);
  const sourceById = new Map<string, SourceRow>(
    ((sources ?? []) as SourceRow[]).map((s) => [s.id, s]),
  );

  // Group by source, sort by engagement desc, cap per source.
  const bySource = new Map<string, TweetRow[]>();
  for (const t of (tweets ?? []) as TweetRow[]) {
    if (!t.source_id) continue;
    const arr = bySource.get(t.source_id) ?? [];
    arr.push(t);
    bySource.set(t.source_id, arr);
  }

  const engagement = (t: TweetRow) =>
    (t.like_count ?? 0) + (t.retweet_count ?? 0) + (t.reply_count ?? 0);

  const groups: DigestSourceGroup[] = [];
  let totalTaken = 0;

  // Order source groups by their best tweet's engagement (desc).
  const orderedSourceIds = Array.from(bySource.keys()).sort((a, b) => {
    const aMax = Math.max(...(bySource.get(a) ?? []).map(engagement), 0);
    const bMax = Math.max(...(bySource.get(b) ?? []).map(engagement), 0);
    return bMax - aMax;
  });

  for (const sid of orderedSourceIds) {
    if (totalTaken >= MAX_TOTAL_TWEETS) break;
    const items = (bySource.get(sid) ?? [])
      .slice()
      .sort((a, b) => engagement(b) - engagement(a))
      .slice(0, MAX_TWEETS_PER_SOURCE);
    if (items.length === 0) continue;
    const remaining = MAX_TOTAL_TWEETS - totalTaken;
    const taken = items.slice(0, remaining);
    totalTaken += taken.length;
    const src = sourceById.get(sid);
    groups.push({
      source_id: sid,
      display_name: src?.display_name || src?.handle || sid,
      handle: src?.handle || sid,
      tweets: taken.map<DigestTweetItem>((t) => ({
        id: t.id,
        text: t.text,
        author_handle: t.author_handle,
        author_display_name: t.author_display_name,
        created_at: t.created_at,
        like_count: t.like_count ?? 0,
        retweet_count: t.retweet_count ?? 0,
        reply_count: t.reply_count ?? 0,
      })),
    });
  }

  return {
    digestId,
    digestName: digest.name,
    windowStart,
    windowEnd,
    totalTweets: totalTaken,
    groups,
    recipients,
  };
}
