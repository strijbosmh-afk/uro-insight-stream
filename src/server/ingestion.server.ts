import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAdapter, type AdapterName } from "@/adapters/twitter";
import type { NormalizedTweet } from "@/adapters/twitter/types";

export type IngestionConfig = {
  adapter: AdapterName;
  enabled: boolean;
  poll_interval_minutes: number;
  rate_limit_per_15min: number;
  default_lookback_minutes: number;
};

export async function loadConfig(): Promise<IngestionConfig> {
  const { data, error } = await supabaseAdmin
    .from("ingestion_config")
    .select("adapter, enabled, poll_interval_minutes, rate_limit_per_15min, default_lookback_minutes")
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  return data as IngestionConfig;
}

function tagCongressId(tweet: NormalizedTweet, congressTagMap: Map<string, string>): string | null {
  for (const tag of tweet.hashtags) {
    const cid = congressTagMap.get(tag.toLowerCase());
    if (cid) return cid;
  }
  return null;
}

async function buildCongressTagMap(): Promise<Map<string, string>> {
  // congresses table doesn't yet exist server-side; rely on hashtags table congress_id linkage when available.
  const { data } = await supabaseAdmin
    .from("ingestion_config")
    .select("id")
    .limit(0);
  void data;
  return new Map();
}

async function upsertTweets(
  tweets: NormalizedTweet[],
  congressTagMap: Map<string, string>,
): Promise<number> {
  if (tweets.length === 0) return 0;

  // For replies/quotes, look up which parent ids we already have in our DB
  // so we can fill parent_in_db_id (best-effort link to local card).
  const parentExternalIds = Array.from(
    new Set(
      tweets
        .map((t) => t.parentTweetExternalId)
        .filter((id): id is string => !!id),
    ),
  );
  const localParentIds = new Set<string>();
  if (parentExternalIds.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from("tweets")
      .select("id")
      .in("id", parentExternalIds);
    (existing ?? []).forEach((r) => localParentIds.add(r.id as string));
  }

  const rows = tweets.map((t) => ({
    id: t.id,
    source_id: t.sourceId ?? null,
    author_handle: t.authorHandle,
    author_display_name: t.authorDisplayName ?? null,
    text: t.text,
    lang: t.lang ?? null,
    created_at: t.createdAt,
    like_count: t.likeCount,
    retweet_count: t.retweetCount,
    reply_count: t.replyCount,
    media_urls: t.mediaUrls,
    hashtags: t.hashtags,
    congress_id: tagCongressId(t, congressTagMap),
    tweet_type: t.tweetType,
    parent_tweet_external_id: t.parentTweetExternalId ?? null,
    parent_handle: t.parentHandle ?? null,
    parent_text: t.parentText ?? null,
    parent_in_db_id:
      t.parentTweetExternalId && localParentIds.has(t.parentTweetExternalId)
        ? t.parentTweetExternalId
        : null,
    raw: (t.raw ?? null) as never,
  }));
  const { error, count } = await supabaseAdmin
    .from("tweets")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true, count: "exact" });
  if (error) throw new Error(error.message);
  return count ?? rows.length;
}

export type RunResult = {
  target_type: "handle" | "hashtag";
  target: string;
  status: "success" | "error" | "rate_limited";
  fetched: number;
  inserted: number;
  error?: string;
};

export async function runIngestionForTarget(
  targetType: "handle" | "hashtag",
  target: string,
  sinceISO: string,
  triggeredBy?: string,
): Promise<RunResult> {
  const cfg = await loadConfig();
  const adapter = getAdapter(cfg.adapter);
  const startedAt = new Date().toISOString();

  let runId: string | undefined;
  {
    const { data } = await supabaseAdmin
      .from("ingestion_runs")
      .insert({
        target_type: targetType,
        target,
        adapter: adapter.name,
        status: "running",
        started_at: startedAt,
        triggered_by: triggeredBy ?? null,
      })
      .select("id")
      .single();
    runId = data?.id as string | undefined;
  }

  try {
    const tweets =
      targetType === "handle"
        ? await adapter.searchByHandle(target, sinceISO)
        : await adapter.searchByHashtag(target, sinceISO);
    const congressTagMap = await buildCongressTagMap();
    const inserted = await upsertTweets(tweets, congressTagMap);
    if (runId) {
      await supabaseAdmin
        .from("ingestion_runs")
        .update({
          status: "success",
          tweets_fetched: tweets.length,
          tweets_inserted: inserted,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    return { target_type: targetType, target, status: "success", fetched: tweets.length, inserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status: RunResult["status"] = message === "rate_limited" ? "rate_limited" : "error";
    if (runId) {
      await supabaseAdmin
        .from("ingestion_runs")
        .update({
          status,
          error_message: message,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    return { target_type: targetType, target, status, fetched: 0, inserted: 0, error: message };
  }
}
