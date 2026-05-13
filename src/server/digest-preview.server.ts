// Server-only helper that builds a "what would this digest look like this week"
// preview. Uses the SAME tweet-selection rules as the real send job
// (buildDigestPayload), then asks Lovable AI Gateway for a structured summary
// (5 takeaways, 3 key quotes, sentiment, model). Returns null on failure so
// callers can surface a friendly empty/error state.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

export type PreviewQuote = {
  text: string;
  author_handle: string;
  tweet_id: string;
};

export type PreviewRendered = {
  digest_name: string;
  window_start: string;
  window_end: string;
  tweet_count: number;
  takeaways: string[];
  key_quotes: PreviewQuote[];
  sentiment: "positive" | "neutral" | "mixed" | "negative";
  model: string;
};

export type PreviewInput = {
  source_ids: string[];
  specialty_id: string | null;
  congress_id: string | null;
  hashtags: string[];
  window_days: number;
  digest_name: string;
};

/**
 * Canonicalised JSON for fingerprint hashing — sort arrays and keys so that
 * filter order does not affect cache hit rate.
 */
export function fingerprintInput(input: PreviewInput): string {
  const canonical = {
    source_ids: [...input.source_ids].sort(),
    specialty_id: input.specialty_id ?? null,
    congress_id: input.congress_id ?? null,
    hashtags: [...input.hashtags].map((h) => h.toLowerCase()).sort(),
    window_days: input.window_days,
  };
  return JSON.stringify(canonical);
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type TweetRow = {
  id: string;
  source_id: string | null;
  author_handle: string;
  text: string;
  created_at: string;
  like_count: number | null;
  retweet_count: number | null;
  reply_count: number | null;
};

/**
 * Run the same tweet-selection logic as buildDigestPayload, but parameterised
 * by the preview inputs (filters that haven't been saved yet) and a window in
 * days. Returns up to 50 tweets ordered by created_at DESC.
 */
async function selectPreviewTweets(input: PreviewInput): Promise<{
  tweets: TweetRow[];
  windowStart: string;
  windowEnd: string;
}> {
  const now = Date.now();
  const windowEnd = new Date(now).toISOString();
  const windowStart = new Date(now - input.window_days * 24 * 60 * 60 * 1000).toISOString();

  let specialtySourceIds: string[] = [];
  if (input.specialty_id) {
    const { data } = await supabaseAdmin
      .from("sources")
      .select("id")
      .contains("specialty", [input.specialty_id]);
    specialtySourceIds = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  }

  const orParts: string[] = [];
  const unionSourceIds = Array.from(new Set([...input.source_ids, ...specialtySourceIds]));
  if (unionSourceIds.length > 0) {
    orParts.push(`source_id.in.(${unionSourceIds.map((s) => `"${s}"`).join(",")})`);
  }
  if (input.congress_id) {
    orParts.push(`congress_id.eq.${input.congress_id}`);
  }
  if (input.hashtags.length > 0) {
    orParts.push(`hashtags.ov.{${input.hashtags.map((h) => `"${h}"`).join(",")}}`);
  }
  if (orParts.length === 0) {
    return { tweets: [], windowStart, windowEnd };
  }

  const { data } = await supabaseAdmin
    .from("tweets")
    .select("id, source_id, author_handle, text, created_at, like_count, retweet_count, reply_count")
    .gte("created_at", windowStart)
    .lte("created_at", windowEnd)
    .or(orParts.join(","))
    .order("created_at", { ascending: false })
    .limit(50);

  return { tweets: (data ?? []) as TweetRow[], windowStart, windowEnd };
}

const TOOL = {
  type: "function" as const,
  function: {
    name: "return_digest_preview",
    description: "Return a structured weekly digest preview.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["takeaways", "key_quotes", "sentiment"],
      properties: {
        takeaways: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: { type: "string" },
        },
        key_quotes: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["tweet_id", "text", "author_handle"],
            properties: {
              tweet_id: { type: "string" },
              text: { type: "string" },
              author_handle: { type: "string" },
            },
          },
        },
        sentiment: {
          type: "string",
          enum: ["positive", "neutral", "mixed", "negative"],
        },
      },
    },
  },
};

async function summariseWithLLM(args: {
  digestName: string;
  tweets: TweetRow[];
  windowStart: string;
  windowEnd: string;
}): Promise<{ rendered: Omit<PreviewRendered, "digest_name" | "window_start" | "window_end" | "tweet_count">; tokens: number } | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.error("[digest-preview] LOVABLE_API_KEY missing");
    return null;
  }

  const block = args.tweets
    .map((t) => {
      const eng = `❤${t.like_count ?? 0}/RT${t.retweet_count ?? 0}/💬${t.reply_count ?? 0}`;
      return `[${t.id}] @${t.author_handle} (${t.created_at.slice(0, 10)}) ${eng} ${t.text.replace(/\s+/g, " ").slice(0, 320)}`;
    })
    .join("\n");

  const userPrompt = `Summarise this week of urology / oncology X activity into a digest preview.

DIGEST: ${args.digestName}
WINDOW: ${args.windowStart.slice(0, 10)} → ${args.windowEnd.slice(0, 10)}

TWEETS (id, author, date, engagement, text):
${block}

Rules:
- 5 takeaways: short single-sentence bullet points (max ~140 chars each), grounded in the tweets.
- 3 key quotes: pick the most representative tweets and copy a verbatim short snippet (≤ 200 chars) along with the tweet_id and author_handle EXACTLY as listed above.
- sentiment: overall tone of the week ("positive" | "neutral" | "mixed" | "negative").
- Do not invent tweet IDs or handles. Only use ones from the list above.`;

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
          {
            role: "system",
            content:
              "You write concise, grounded digest previews for clinical professionals. Always call the provided tool. Ground every claim in the listed tweets — never fabricate.",
          },
          { role: "user", content: userPrompt },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "return_digest_preview" } },
      }),
    });
    if (!res.ok) {
      console.error("[digest-preview] gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
      usage?: { total_tokens?: number };
    };
    const argsStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) return null;
    const parsed = JSON.parse(argsStr) as Record<string, unknown>;

    const validIds = new Set(args.tweets.map((t) => t.id));
    const handleById = new Map(args.tweets.map((t) => [t.id, t.author_handle]));

    const takeaways = Array.isArray(parsed.takeaways)
      ? (parsed.takeaways as unknown[])
          .map((s) => String(s).trim())
          .filter((s) => s.length > 0)
          .slice(0, 5)
      : [];

    const key_quotes: PreviewQuote[] = Array.isArray(parsed.key_quotes)
      ? (parsed.key_quotes as unknown[])
          .filter((q): q is Record<string, unknown> => !!q && typeof q === "object")
          .map((q) => {
            const tweet_id = String(q.tweet_id ?? "");
            return {
              tweet_id,
              text: String(q.text ?? "").slice(0, 280),
              author_handle:
                handleById.get(tweet_id) ??
                String(q.author_handle ?? "").replace(/^@/, ""),
            };
          })
          .filter((q) => q.tweet_id.length > 0 && validIds.has(q.tweet_id) && q.text.length > 0)
          .slice(0, 3)
      : [];

    const sentimentRaw = String(parsed.sentiment ?? "neutral");
    const sentiment: PreviewRendered["sentiment"] =
      sentimentRaw === "positive" || sentimentRaw === "negative" || sentimentRaw === "mixed"
        ? (sentimentRaw as PreviewRendered["sentiment"])
        : "neutral";

    if (takeaways.length === 0) return null;

    return {
      rendered: { takeaways, key_quotes, sentiment, model: MODEL },
      tokens: json.usage?.total_tokens ?? 0,
    };
  } catch (e) {
    console.error("[digest-preview] failed", e);
    return null;
  }
}

export type PreviewResult =
  | { status: "ok"; rendered: PreviewRendered; from_cache: boolean; cached_at: string }
  | { status: "empty"; window_start: string; window_end: string }
  | { status: "error"; reason: string };

export async function computeDigestPreview(
  input: PreviewInput,
  opts: { bypassCache?: boolean } = {},
): Promise<PreviewResult> {
  const fp = await sha256Hex(fingerprintInput(input));

  if (!opts.bypassCache) {
    const { data: cached } = await supabaseAdmin
      .from("digest_preview_cache")
      .select("rendered, tweet_count, created_at, hit_count")
      .eq("fingerprint", fp)
      .maybeSingle();
    if (cached) {
      const ageMs = Date.now() - new Date(cached.created_at).getTime();
      if (ageMs < 60 * 60 * 1000) {
        // Bump hit counter (best effort).
        await supabaseAdmin
          .from("digest_preview_cache")
          .update({ hit_count: (cached.hit_count ?? 0) + 1 })
          .eq("fingerprint", fp);
        return {
          status: "ok",
          rendered: cached.rendered as unknown as PreviewRendered,
          from_cache: true,
          cached_at: cached.created_at as string,
        };
      }
    }
  }

  const { tweets, windowStart, windowEnd } = await selectPreviewTweets(input);
  if (tweets.length === 0) {
    return { status: "empty", window_start: windowStart, window_end: windowEnd };
  }

  const llm = await summariseWithLLM({
    digestName: input.digest_name || "Untitled digest",
    tweets,
    windowStart,
    windowEnd,
  });
  if (!llm) {
    return { status: "error", reason: "summary_failed" };
  }

  const rendered: PreviewRendered = {
    digest_name: input.digest_name || "Untitled digest",
    window_start: windowStart,
    window_end: windowEnd,
    tweet_count: tweets.length,
    ...llm.rendered,
  };

  await supabaseAdmin
    .from("digest_preview_cache")
    .upsert(
      [{
        fingerprint: fp,
        rendered: rendered as unknown as import("@/integrations/supabase/types").Json,
        tweet_count: tweets.length,
        llm_tokens_used: llm.tokens,
        hit_count: 0,
        created_at: new Date().toISOString(),
      }],
      { onConflict: "fingerprint" },
    );

  return { status: "ok", rendered, from_cache: false, cached_at: new Date().toISOString() };
}

/**
 * Sliding-hour rate limit: max 20 preview calls per user per 60 minutes.
 * Returns true when the call should be allowed.
 */
export async function consumePreviewRateLimit(userId: string, max = 20): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime());
  windowStart.setUTCMinutes(0, 0, 0);
  const windowKey = windowStart.toISOString();

  const { data: row } = await supabaseAdmin
    .from("rate_limit_preview")
    .select("count")
    .eq("user_id", userId)
    .eq("window_start", windowKey)
    .maybeSingle();

  const current = row?.count ?? 0;
  if (current >= max) return false;

  await supabaseAdmin
    .from("rate_limit_preview")
    .upsert(
      [{
        user_id: userId,
        window_start: windowKey,
        count: current + 1,
        updated_at: now.toISOString(),
      }],
      { onConflict: "user_id,window_start" },
    );
  return true;
}