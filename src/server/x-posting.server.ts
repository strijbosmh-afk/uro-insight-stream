// Server-only: posts tweets/replies on behalf of an authenticated user.
// IMPORTANT: This module NEVER uses the platform-wide X_BEARER_TOKEN.
// All requests are signed with the calling user's own OAuth 1.0a credentials.

import { createHmac } from "crypto";
import OAuth from "oauth-1.0a";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadCredentials } from "./x-credentials.server";

const DAILY_POST_CAP = 50;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface PostTweetInput {
  userId: string;
  text: string;
  inReplyToTweetId?: string;
}

export interface PostTweetResult {
  id: string;
  url: string;
}

export class PostTweetError extends Error {
  constructor(
    public code:
      | "not_connected"
      | "rate_limited"
      | "read_only_token"
      | "invalid_credentials"
      | "x_api_error"
      | "network_error"
      | "internal",
    message: string,
    public detail?: unknown
  ) {
    super(message);
  }
}

async function logPost(args: {
  userId: string;
  text: string;
  inReplyTo?: string;
  status: "sent" | "failed" | "rate_limited";
  postedTweetId?: string;
  errorCode?: string;
  errorMessage?: string;
}) {
  await supabaseAdmin.from("user_x_post_log").insert([
    {
      user_id: args.userId,
      text: args.text,
      in_reply_to_tweet_id: args.inReplyTo ?? null,
      status: args.status,
      posted_tweet_id: args.postedTweetId ?? null,
      error_code: args.errorCode ?? null,
      error_message: args.errorMessage ?? null,
    },
  ]);
}

/**
 * Reserve a slot in the per-user 24h posting window.
 * Returns true if allowed, false if cap reached.
 */
async function reserveRateLimitSlot(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("user_x_credentials")
    .select("post_count_today, post_count_window_start")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;

  const now = Date.now();
  const windowStart = data.post_count_window_start
    ? new Date(data.post_count_window_start).getTime()
    : 0;
  const windowExpired = !windowStart || now - windowStart > WINDOW_MS;
  const currentCount = windowExpired ? 0 : data.post_count_today ?? 0;

  if (currentCount >= DAILY_POST_CAP) return false;

  const { error: upErr } = await supabaseAdmin
    .from("user_x_credentials")
    .update({
      post_count_today: currentCount + 1,
      post_count_window_start: windowExpired
        ? new Date(now).toISOString()
        : new Date(windowStart).toISOString(),
    })
    .eq("user_id", userId);
  if (upErr) throw new Error(upErr.message);

  return true;
}

export async function postTweet(input: PostTweetInput): Promise<PostTweetResult> {
  // Sandboxed demo accounts: never hit the real X API. Insert into
  // demo_posts and also log a "sent" entry in user_x_post_log so the
  // existing /me/posts UI shows the new entry without changes.
  const { data: demoProfile } = await supabaseAdmin
    .from("profiles")
    .select("is_demo")
    .eq("id", input.userId)
    .maybeSingle();
  if (demoProfile?.is_demo) {
    const simulatedId = `demo_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    await supabaseAdmin.from("demo_posts").insert({
      user_id: input.userId,
      text: input.text,
      in_reply_to_tweet_id: input.inReplyToTweetId ?? null,
      simulated_tweet_id: simulatedId,
    });
    await logPost({
      userId: input.userId,
      text: input.text,
      inReplyTo: input.inReplyToTweetId,
      status: "sent",
      postedTweetId: simulatedId,
    });
    return {
      id: simulatedId,
      url: `https://x.com/i/web/status/${simulatedId}`,
    };
  }

  const creds = await loadCredentials(input.userId);
  if (!creds) {
    throw new PostTweetError(
      "not_connected",
      "Connect your X account in Settings → X (Twitter) to post."
    );
  }

  const allowed = await reserveRateLimitSlot(input.userId);
  if (!allowed) {
    await logPost({
      userId: input.userId,
      text: input.text,
      inReplyTo: input.inReplyToTweetId,
      status: "rate_limited",
      errorCode: "rate_limited",
      errorMessage: `Daily cap of ${DAILY_POST_CAP} posts reached. Try again later.`,
    });
    throw new PostTweetError(
      "rate_limited",
      `You've reached the per-user daily limit of ${DAILY_POST_CAP} posts. Try again tomorrow.`
    );
  }

  const oauth = new OAuth({
    consumer: { key: creds.consumerKey, secret: creds.consumerSecret },
    signature_method: "HMAC-SHA1",
    hash_function(base, key) {
      return createHmac("sha1", key).update(base).digest("base64");
    },
  });

  const url = "https://api.twitter.com/2/tweets";
  const body: Record<string, unknown> = { text: input.text };
  if (input.inReplyToTweetId) {
    body.reply = { in_reply_to_tweet_id: input.inReplyToTweetId };
  }

  // OAuth 1.0a signature for JSON body must NOT include body params in the
  // signature base string — only the URL + method + oauth params.
  const headers = oauth.toHeader(
    oauth.authorize(
      { url, method: "POST" },
      { key: creds.accessToken, secret: creds.accessTokenSecret }
    )
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        ...(headers as unknown as Record<string, string>),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    await logPost({
      userId: input.userId,
      text: input.text,
      inReplyTo: input.inReplyToTweetId,
      status: "failed",
      errorCode: "network_error",
      errorMessage: (e as Error).message,
    });
    throw new PostTweetError("network_error", (e as Error).message);
  }

  const text = await res.text();
  if (!res.ok) {
    let errCode = "x_api_error";
    let errMsg = `X API error ${res.status}: ${text.slice(0, 500)}`;
    if (res.status === 401) {
      errCode = "invalid_credentials";
      errMsg = "X rejected your credentials. Reconnect in Settings.";
    } else if (res.status === 403) {
      // Often "you don't have write permission" for read-only tokens.
      errCode = "read_only_token";
      errMsg =
        "Your X token doesn't have write permission. In your X app settings, set permissions to Read+Write and regenerate the Access Token.";
      // Roll back scope_write so UI reflects this.
      await supabaseAdmin
        .from("user_x_credentials")
        .update({ scope_write: false })
        .eq("user_id", input.userId);
    } else if (res.status === 429) {
      errCode = "rate_limited";
      errMsg = "X rate limit reached for your account. Try again later.";
    }
    await logPost({
      userId: input.userId,
      text: input.text,
      inReplyTo: input.inReplyToTweetId,
      status: "failed",
      errorCode: errCode,
      errorMessage: errMsg,
    });
    throw new PostTweetError(
      errCode === "rate_limited"
        ? "rate_limited"
        : errCode === "read_only_token"
          ? "read_only_token"
          : errCode === "invalid_credentials"
            ? "invalid_credentials"
            : "x_api_error",
      errMsg
    );
  }

  const json = JSON.parse(text) as { data?: { id: string; text: string } };
  const tweetId = json.data?.id;
  if (!tweetId) {
    await logPost({
      userId: input.userId,
      text: input.text,
      inReplyTo: input.inReplyToTweetId,
      status: "failed",
      errorCode: "x_api_error",
      errorMessage: "X did not return a tweet id.",
    });
    throw new PostTweetError("x_api_error", "X did not return a tweet id.");
  }

  const username =
    (await supabaseAdmin
      .from("user_x_credentials")
      .select("x_username")
      .eq("user_id", input.userId)
      .maybeSingle()).data?.x_username ?? "i";

  const tweetUrl = `https://x.com/${username}/status/${tweetId}`;

  await Promise.all([
    logPost({
      userId: input.userId,
      text: input.text,
      inReplyTo: input.inReplyToTweetId,
      status: "sent",
      postedTweetId: tweetId,
    }),
    supabaseAdmin
      .from("user_x_credentials")
      .update({ last_post_at: new Date().toISOString(), scope_write: true })
      .eq("user_id", input.userId),
  ]);

  return { id: tweetId, url: tweetUrl };
}