// Server-only: like / unlike / retweet / unretweet on behalf of an
// authenticated user using their stored OAuth 1.0a credentials.

import { createHmac } from "crypto";
import OAuth from "oauth-1.0a";
import { loadCredentials } from "./x-credentials.server";

export class EngagementError extends Error {
  constructor(
    public code:
      | "not_connected"
      | "invalid_credentials"
      | "read_only_token"
      | "rate_limited"
      | "x_api_error"
      | "network_error",
    message: string
  ) {
    super(message);
  }
}

type Action = "like" | "unlike" | "retweet" | "unretweet";

export async function engage(
  userId: string,
  action: Action,
  tweetId: string
): Promise<{ ok: true }> {
  const creds = await loadCredentials(userId);
  if (!creds) {
    throw new EngagementError(
      "not_connected",
      "Connect your X account in Settings → X (Twitter) first."
    );
  }
  if (!creds.xUserId) {
    throw new EngagementError(
      "invalid_credentials",
      "Your connected X account is missing a user id. Reconnect in Settings."
    );
  }

  const oauth = new OAuth({
    consumer: { key: creds.consumerKey, secret: creds.consumerSecret },
    signature_method: "HMAC-SHA1",
    hash_function(base, key) {
      return createHmac("sha1", key).update(base).digest("base64");
    },
  });

  let url: string;
  let method: "POST" | "DELETE";
  let body: Record<string, unknown> | undefined;

  switch (action) {
    case "like":
      url = `https://api.twitter.com/2/users/${creds.xUserId}/likes`;
      method = "POST";
      body = { tweet_id: tweetId };
      break;
    case "unlike":
      url = `https://api.twitter.com/2/users/${creds.xUserId}/likes/${tweetId}`;
      method = "DELETE";
      break;
    case "retweet":
      url = `https://api.twitter.com/2/users/${creds.xUserId}/retweets`;
      method = "POST";
      body = { tweet_id: tweetId };
      break;
    case "unretweet":
      url = `https://api.twitter.com/2/users/${creds.xUserId}/retweets/${tweetId}`;
      method = "DELETE";
      break;
  }

  const headers = oauth.toHeader(
    oauth.authorize(
      { url, method },
      { key: creds.accessToken, secret: creds.accessTokenSecret }
    )
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(headers as unknown as Record<string, string>),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new EngagementError("network_error", (e as Error).message);
  }

  if (res.ok) return { ok: true };

  const text = await res.text();
  if (res.status === 401) {
    throw new EngagementError(
      "invalid_credentials",
      "X rejected your credentials. Reconnect in Settings."
    );
  }
  if (res.status === 403) {
    throw new EngagementError(
      "read_only_token",
      "Your X token doesn't have write permission. Set the app to Read+Write and regenerate the Access Token."
    );
  }
  if (res.status === 429) {
    throw new EngagementError(
      "rate_limited",
      "X rate limit reached. Try again later."
    );
  }
  console.error("[x-engagement] X API error", res.status, text.slice(0, 200));
  throw new EngagementError(
    "x_api_error",
    `X couldn't complete that action (status ${res.status}). Please try again.`,
  );
}