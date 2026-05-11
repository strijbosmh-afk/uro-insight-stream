import OAuth from "oauth-1.0a";
import { createHmac } from "crypto";
import type { TwitterAdapter, NormalizedTweet } from "./types";

// X API v2 recent search using OAuth 1.0a user-context.
// Mirrors xApiV2.ts but signs each request with the user's consumer + access tokens.

const API = "https://api.twitter.com/2";

export interface OAuth1Creds {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

function makeOAuth(c: OAuth1Creds) {
  return new OAuth({
    consumer: { key: c.consumerKey, secret: c.consumerSecret },
    signature_method: "HMAC-SHA1",
    hash_function(base, key) {
      return createHmac("sha1", key).update(base).digest("base64");
    },
  });
}

function extractHashtags(text: string): string[] {
  const out: string[] = [];
  const re = /#([\p{L}\p{N}_]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1].toLowerCase());
  return out;
}

type XTweet = {
  id: string;
  text: string;
  created_at: string;
  lang?: string;
  author_id?: string;
  public_metrics?: { like_count: number; retweet_count: number; reply_count: number };
  entities?: { hashtags?: { tag: string }[] };
  attachments?: { media_keys?: string[] };
  referenced_tweets?: { type: "retweeted" | "replied_to" | "quoted"; id: string }[];
};
type XUser = { id: string; username: string; name?: string };
type XMedia = { media_key: string; url?: string; preview_image_url?: string };
type XResponse = {
  data?: XTweet[];
  includes?: { users?: XUser[]; media?: XMedia[]; tweets?: XTweet[] };
  errors?: { message: string }[];
};

async function recentSearchOAuth1(
  query: string,
  sinceISO: string,
  creds: OAuth1Creds,
): Promise<NormalizedTweet[]> {
  const url = new URL(`${API}/tweets/search/recent`);
  const params: Record<string, string> = {
    query,
    max_results: "100",
    start_time: sinceISO,
    "tweet.fields":
      "created_at,lang,public_metrics,entities,author_id,attachments,referenced_tweets",
    expansions:
      "author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id",
    "user.fields": "username,name",
    "media.fields": "url,preview_image_url",
  };
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const oauth = makeOAuth(creds);
  // OAuth signature must include the query parameters.
  const requestData = { url: url.toString(), method: "GET" as const, data: params };
  const headers = oauth.toHeader(
    oauth.authorize(requestData, {
      key: creds.accessToken,
      secret: creds.accessTokenSecret,
    }),
  );

  const res = await fetch(url, {
    method: "GET",
    headers: { ...(headers as unknown as Record<string, string>) },
  });
  if (res.status === 429) throw new Error("rate_limited");
  if (!res.ok) throw new Error(`X API error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as XResponse;
  if (!json.data) return [];

  const usersById = new Map<string, XUser>();
  json.includes?.users?.forEach((u) => usersById.set(u.id, u));
  const mediaByKey = new Map<string, XMedia>();
  json.includes?.media?.forEach((m) => mediaByKey.set(m.media_key, m));
  const referencedById = new Map<string, XTweet>();
  json.includes?.tweets?.forEach((t) => referencedById.set(t.id, t));

  const out: NormalizedTweet[] = [];
  for (const t of json.data) {
    const ref = t.referenced_tweets?.[0];
    if (ref?.type === "retweeted") continue;
    const user = t.author_id ? usersById.get(t.author_id) : undefined;
    const tagsFromEntities = t.entities?.hashtags?.map((h) => h.tag.toLowerCase()) ?? [];
    const hashtags = tagsFromEntities.length ? tagsFromEntities : extractHashtags(t.text);
    const mediaUrls = (t.attachments?.media_keys ?? [])
      .map((k) => mediaByKey.get(k))
      .map((m) => m?.url ?? m?.preview_image_url)
      .filter((u): u is string => !!u);

    let tweetType: NormalizedTweet["tweetType"] = "original";
    let parentTweetExternalId: string | undefined;
    let parentHandle: string | undefined;
    let parentText: string | undefined;
    if (ref?.type === "replied_to") tweetType = "reply";
    else if (ref?.type === "quoted") tweetType = "quote";
    if (ref && tweetType !== "original") {
      parentTweetExternalId = ref.id;
      const parent = referencedById.get(ref.id);
      if (parent) {
        parentText = parent.text ? parent.text.slice(0, 280) : undefined;
        if (parent.author_id) parentHandle = usersById.get(parent.author_id)?.username;
      }
    }

    out.push({
      id: t.id,
      sourceId: user?.username?.toLowerCase(),
      authorHandle: user?.username ?? t.author_id ?? "unknown",
      authorDisplayName: user?.name,
      text: t.text,
      lang: t.lang,
      createdAt: t.created_at,
      likeCount: t.public_metrics?.like_count ?? 0,
      retweetCount: t.public_metrics?.retweet_count ?? 0,
      replyCount: t.public_metrics?.reply_count ?? 0,
      mediaUrls,
      hashtags,
      tweetType,
      parentTweetExternalId,
      parentHandle,
      parentText,
      raw: t,
    });
  }
  return out;
}

export function createXApiV2OAuth1Adapter(creds: OAuth1Creds): TwitterAdapter {
  return {
    name: "x_api_v2_user",
    async searchByHandle(handle, sinceISO) {
      const clean = handle.replace(/^@/, "");
      return recentSearchOAuth1(`from:${clean} -is:retweet`, sinceISO, creds);
    },
    async searchByHashtag(tag, sinceISO) {
      const clean = tag.replace(/^#/, "");
      return recentSearchOAuth1(`#${clean} -is:retweet`, sinceISO, creds);
    },
  };
}