// Server-only: classify newly ingested tweets against active user watchlists.
// Two-stage matcher:
//   1. Keyword pass (case-insensitive substring) — cheap and explainable.
//   2. LLM fallback (batched per topic-set) — only when keyword misses AND the
//      user is below their daily classification cap.
// Verdicts are cached in `watchlist_match_cache` keyed by (tweet_id, topic_set_hash)
// so identical topic sets across users only call the LLM once.
//
// This module never throws to the caller — failures are logged and swallowed
// so a classifier hiccup never breaks ingestion.

import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deliverWatchlistMatches } from "@/server/watchlist-delivery.server";
import { emitOpsAlert } from "@/server/ops-alerts.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const DAILY_LLM_CAP = 500;

type WatchlistRow = {
  id: string;
  user_id: string;
  target_kind: "source" | "group";
  target_source_id: string | null;
  target_group_id: string | null;
  is_active: boolean;
  muted_until: string | null;
};

type TopicRow = { watchlist_id: string; topic: string };

type TweetForClassify = {
  id: string;
  source_id: string | null;
  text: string;
  author_handle: string;
};

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeTopic(t: string): string {
  return t.trim().toLowerCase();
}

function topicSetHash(topics: string[]): string {
  const sorted = Array.from(new Set(topics.map(normalizeTopic))).sort();
  return createHash("sha256").update(sorted.join("|")).digest("hex");
}

function keywordMatch(text: string, topic: string): boolean {
  // Word-ish substring match — case-insensitive, tolerant of punctuation.
  return text.toLowerCase().includes(topic.toLowerCase());
}

/**
 * Entry point. Called from the ingestion path after new tweets are persisted.
 * Safe to call with any-size lists; will short-circuit when there's nothing
 * to do.
 */
export async function classifyNewTweets(tweetIds: string[]): Promise<void> {
  if (tweetIds.length === 0) return;
  try {
    // Pull tweet rows we need.
    const { data: tweetsRaw } = await supabaseAdmin
      .from("tweets")
      .select("id, source_id, text, author_handle")
      .in("id", tweetIds);
    const tweets = (tweetsRaw ?? []) as TweetForClassify[];
    if (tweets.length === 0) return;

    const sourceIds = Array.from(
      new Set(tweets.map((t) => t.source_id).filter((s): s is string => !!s)),
    );
    if (sourceIds.length === 0) return;

    // Fetch active watchlists whose target matches any of these source ids.
    // We do this with two queries (source-target + group-target via group members)
    // and merge in JS because supabase-js can't express the OR on a joined column.
    const nowIso = new Date().toISOString();

    const { data: srcWatchlists } = await supabaseAdmin
      .from("user_watchlists")
      .select("id, user_id, target_kind, target_source_id, target_group_id, is_active, muted_until")
      .in("target_source_id", sourceIds)
      .eq("is_active", true);

    // Group memberships for these source ids.
    const { data: memberships } = await supabaseAdmin
      .from("source_group_members")
      .select("group_id, source_id")
      .in("source_id", sourceIds);
    const groupIds = Array.from(new Set((memberships ?? []).map((m) => m.group_id as string)));

    let groupWatchlists: WatchlistRow[] = [];
    if (groupIds.length > 0) {
      const { data } = await supabaseAdmin
        .from("user_watchlists")
        .select("id, user_id, target_kind, target_source_id, target_group_id, is_active, muted_until")
        .in("target_group_id", groupIds)
        .eq("is_active", true);
      groupWatchlists = (data ?? []) as WatchlistRow[];
    }

    const allWatchlistsMap = new Map<string, WatchlistRow>();
    for (const w of (srcWatchlists ?? []) as WatchlistRow[]) allWatchlistsMap.set(w.id, w);
    for (const w of groupWatchlists) allWatchlistsMap.set(w.id, w);

    // Filter out muted.
    const watchlists = Array.from(allWatchlistsMap.values()).filter(
      (w) => !w.muted_until || w.muted_until <= nowIso,
    );
    if (watchlists.length === 0) return;

    // Group memberships keyed by group → set of source ids.
    const groupSourceIndex = new Map<string, Set<string>>();
    for (const m of memberships ?? []) {
      const gid = m.group_id as string;
      const sid = m.source_id as string;
      if (!groupSourceIndex.has(gid)) groupSourceIndex.set(gid, new Set());
      groupSourceIndex.get(gid)!.add(sid);
    }

    // Topics for these watchlists.
    const wlIds = watchlists.map((w) => w.id);
    const { data: topicRows } = await supabaseAdmin
      .from("user_watchlist_topics")
      .select("watchlist_id, topic")
      .in("watchlist_id", wlIds)
      .eq("is_active", true);
    const topicsByWl = new Map<string, string[]>();
    for (const r of (topicRows ?? []) as TopicRow[]) {
      if (!topicsByWl.has(r.watchlist_id)) topicsByWl.set(r.watchlist_id, []);
      topicsByWl.get(r.watchlist_id)!.push(r.topic);
    }

    // Quota lookup per user.
    const userIds = Array.from(new Set(watchlists.map((w) => w.user_id)));
    const today = todayUtc();
    const { data: quotaRows } = await supabaseAdmin
      .from("user_llm_quota")
      .select("user_id, classifications")
      .eq("day", today)
      .in("user_id", userIds);
    const quotaMap = new Map<string, number>();
    for (const r of quotaRows ?? []) quotaMap.set(r.user_id as string, (r.classifications as number) ?? 0);

    // For each (tweet, watchlist) pair where the watchlist's target matches the
    // tweet's source: run keyword pass first. Collect LLM-pending pairs grouped
    // by topic-set hash for batch classification.
    type PendingLLM = {
      tweet: TweetForClassify;
      watchlistId: string;
      userId: string;
      topics: string[];
      hash: string;
    };
    const pendingLLM: PendingLLM[] = [];
    const newMatches: Array<{
      watchlist_id: string;
      tweet_id: string;
      matched_topic: string;
      match_reason: { kind: "keyword" | "llm"; matched_topic: string; evidence: string };
    }> = [];

    for (const tweet of tweets) {
      if (!tweet.source_id) continue;
      for (const w of watchlists) {
        const matches =
          w.target_kind === "source"
            ? w.target_source_id === tweet.source_id
            : w.target_group_id
              ? groupSourceIndex.get(w.target_group_id)?.has(tweet.source_id) ?? false
              : false;
        if (!matches) continue;

        const topics = topicsByWl.get(w.id) ?? [];
        if (topics.length === 0) continue;

        // Keyword pass — first hit wins.
        const kwHit = topics.find((t) => keywordMatch(tweet.text, t));
        if (kwHit) {
          newMatches.push({
            watchlist_id: w.id,
            tweet_id: tweet.id,
            matched_topic: kwHit,
            match_reason: { kind: "keyword", matched_topic: kwHit, evidence: kwHit },
          });
          continue;
        }

        // LLM fallback — gated by quota.
        const used = quotaMap.get(w.user_id) ?? 0;
        if (used >= DAILY_LLM_CAP) continue;
        pendingLLM.push({
          tweet,
          watchlistId: w.id,
          userId: w.user_id,
          topics,
          hash: topicSetHash(topics),
        });
      }
    }

    // Resolve LLM via cache first.
    const cacheLookups: Array<{ tweet_id: string; topic_set_hash: string }> = pendingLLM.map(
      (p) => ({ tweet_id: p.tweet.id, topic_set_hash: p.hash }),
    );
    const cacheKey = (tid: string, h: string) => `${tid}::${h}`;
    const cacheVerdicts = new Map<string, { matched_topic: string | null; evidence: string }>();
    if (cacheLookups.length > 0) {
      // Supabase doesn't support multi-column IN, so fetch by tweet_id and filter.
      const tids = Array.from(new Set(cacheLookups.map((c) => c.tweet_id)));
      const { data: cachedRows } = await supabaseAdmin
        .from("watchlist_match_cache")
        .select("tweet_id, topic_set_hash, matches")
        .in("tweet_id", tids);
      for (const r of cachedRows ?? []) {
        const m = (r.matches as unknown as { matched_topic: string | null; evidence: string }) ?? {
          matched_topic: null,
          evidence: "",
        };
        cacheVerdicts.set(cacheKey(r.tweet_id as string, r.topic_set_hash as string), m);
      }
    }

    // Apply cached verdicts and collect remaining for LLM call.
    const remaining: PendingLLM[] = [];
    for (const p of pendingLLM) {
      const v = cacheVerdicts.get(cacheKey(p.tweet.id, p.hash));
      if (v) {
        if (v.matched_topic) {
          newMatches.push({
            watchlist_id: p.watchlistId,
            tweet_id: p.tweet.id,
            matched_topic: v.matched_topic,
            match_reason: { kind: "llm", matched_topic: v.matched_topic, evidence: v.evidence },
          });
        }
        continue;
      }
      remaining.push(p);
    }

    // Batch by topic-set hash and call LLM.
    if (remaining.length > 0) {
      const groups = new Map<string, PendingLLM[]>();
      for (const p of remaining) {
        if (!groups.has(p.hash)) groups.set(p.hash, []);
        groups.get(p.hash)!.push(p);
      }
      for (const [hash, items] of groups) {
        try {
          const tweetsForCall = Array.from(
            new Map(items.map((i) => [i.tweet.id, i.tweet])).values(),
          );
          const verdicts = await classifyTweetsViaLLM(tweetsForCall, items[0].topics);
          // Cache & apply.
          for (const t of tweetsForCall) {
            const v = verdicts[t.id] ?? { matched_topic: null, evidence: "" };
            await supabaseAdmin
              .from("watchlist_match_cache")
              .upsert(
                { tweet_id: t.id, topic_set_hash: hash, matches: v as unknown as never },
                { onConflict: "tweet_id,topic_set_hash" },
              );
          }
          // Bump quotas: one per tweet per distinct user that had this topic-set.
          const distinctUsers = new Set(items.map((i) => i.userId));
          for (const uid of distinctUsers) {
            await bumpQuota(uid, today, tweetsForCall.length);
          }
          // Fan out matches.
          for (const p of items) {
            const v = verdicts[p.tweet.id];
            if (v?.matched_topic) {
              newMatches.push({
                watchlist_id: p.watchlistId,
                tweet_id: p.tweet.id,
                matched_topic: v.matched_topic,
                match_reason: {
                  kind: "llm",
                  matched_topic: v.matched_topic,
                  evidence: v.evidence,
                },
              });
            }
          }
        } catch (err) {
          console.error("[watchlist-classifier] LLM batch failed", err);
        }
      }
    }

    if (newMatches.length === 0) return;

    // Insert matches (UNIQUE on watchlist+tweet+topic dedupes silently via upsert).
    const { data: inserted } = await supabaseAdmin
      .from("user_watchlist_matches")
      .upsert(
        newMatches.map((m) => ({
          watchlist_id: m.watchlist_id,
          tweet_id: m.tweet_id,
          matched_topic: m.matched_topic,
          match_reason: m.match_reason as unknown as never,
        })),
        { onConflict: "watchlist_id,tweet_id,matched_topic", ignoreDuplicates: true },
      )
      .select("id, watchlist_id, tweet_id, matched_topic");

    if (inserted && inserted.length > 0) {
      // Fire-and-forget delivery (email path).
      void deliverWatchlistMatches(
        inserted as Array<{
          id: string;
          watchlist_id: string;
          tweet_id: string;
          matched_topic: string;
        }>,
      ).catch((e: unknown) => console.error("[watchlist-classifier] delivery failed", e));
    }
  } catch (err) {
    console.error("[watchlist-classifier] failed", err);
    void emitOpsAlert({
      kind: "watchlist_classifier_failure",
      severity: "warning",
      message: `Watchlist classifier batch failed: ${(err as Error).message ?? "unknown"}`,
      metadata: { tweet_count: tweetIds.length },
      dedupeWindowHours: 1,
    });
  }
}

async function bumpQuota(userId: string, day: string, n: number): Promise<void> {
  // Atomic: INSERT ... ON CONFLICT DO UPDATE SET classifications = classifications + n
  // (see public.bump_user_llm_quota). Race-safe across concurrent classifier
  // invocations — no lost updates.
  const { error } = await supabaseAdmin.rpc("bump_user_llm_quota", {
    _user_id: userId,
    _day: day,
    _kind: "classifications",
    _n: n,
  });
  if (error) console.error("[watchlist-classifier] bumpQuota failed", error);
}

type Verdict = { matched_topic: string | null; evidence: string };

async function classifyTweetsViaLLM(
  tweets: TweetForClassify[],
  topics: string[],
): Promise<Record<string, Verdict>> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.error("[watchlist-classifier] LOVABLE_API_KEY missing");
    return {};
  }
  if (tweets.length === 0 || topics.length === 0) return {};

  const TOOL = {
    type: "function" as const,
    function: {
      name: "return_topic_matches",
      description:
        "For each tweet, return which (if any) topic from the user's list is semantically discussed by the tweet.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["results"],
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["tweet_id", "matched_topic", "evidence"],
              properties: {
                tweet_id: { type: "string" },
                matched_topic: {
                  type: ["string", "null"],
                  description:
                    "Exact topic string from the provided list, or null if no topic matches.",
                },
                evidence: {
                  type: "string",
                  description:
                    "Short phrase from the tweet (or short explanation) showing why the topic matches. Empty string when matched_topic is null.",
                },
              },
            },
          },
        },
      },
    },
  };

  const prompt = `You are a clinical-oncology topic classifier. Each tweet is from a clinician on X.
For each tweet, determine whether it semantically discusses ANY of these user-tracked topics. The match should be substantive (the topic is discussed or referenced — not just a passing word). Use clinical knowledge: "PARP inhibitors" matches a tweet about olaparib, niraparib, talazoparib, etc. "PSMA-targeted radioligands" matches Lu-177-PSMA, Pluvicto, etc. "BRCA mutations" matches HRR/HRD discussions when in a BRCA-relevant context.

Topics:
${topics.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Tweets:
${tweets
  .map(
    (t) => `---
TWEET_ID: ${t.id}
@${t.author_handle}: ${t.text.slice(0, 600)}`,
  )
  .join("\n")}

Return one result per tweet. matched_topic must be one of the topic strings above (verbatim) or null. evidence should be a short snippet from the tweet (or a brief synonym note like "olaparib → PARP inhibitors").`;

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "You classify oncology tweets into user-defined topic buckets. Always call the provided tool." },
          { role: "user", content: prompt },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "return_topic_matches" } },
      }),
    });
    if (!res.ok) {
      console.error("[watchlist-classifier] gateway error", res.status, await res.text().catch(() => ""));
      return {};
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const argsStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) return {};
    const parsed = JSON.parse(argsStr) as { results?: Array<{ tweet_id?: string; matched_topic?: string | null; evidence?: string }> };
    if (!Array.isArray(parsed.results)) return {};
    const topicSet = new Set(topics.map((t) => t));
    const out: Record<string, Verdict> = {};
    for (const r of parsed.results) {
      const tid = r.tweet_id;
      if (!tid) continue;
      const mt = r.matched_topic && topicSet.has(r.matched_topic) ? r.matched_topic : null;
      out[tid] = { matched_topic: mt, evidence: (r.evidence ?? "").slice(0, 200) };
    }
    return out;
  } catch (err) {
    console.error("[watchlist-classifier] LLM call failed", err);
    return {};
  }
}