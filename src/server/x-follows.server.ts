// Server-only: fetch a user's X follow list, score it against the cancer-area
// signal dictionary, and cache the normalized result for ~7 days so repeated
// runs (wizard step + Settings re-run) don't re-burn the X API quota.

import OAuth from "oauth-1.0a";
import { createHmac } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadCredentials } from "@/server/x-credentials.server";

export type XFollowItem = {
  x_user_id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  verified: boolean;
  followers_count: number | null;
};

export type ScoredFollowItem = XFollowItem & {
  score: number;
  matched_signals: Array<{ value: string; weight: number; area_slug: string }>;
  suggested_area_slugs: string[];
};

export type FetchFollowsResult =
  | { ok: true; items: XFollowItem[]; totalSeen: number; capped: boolean }
  | { ok: false; error: "rate_limited"; retry_after_seconds: number }
  | { ok: false; error: "scope_missing"; message: string }
  | { ok: false; error: "not_connected" }
  | { ok: false; error: "x_api"; status: number; message: string };

const HARD_MAX = 1000;
const DEFAULT_LIMIT = 500;

function makeOAuth(consumerKey: string, consumerSecret: string) {
  return new OAuth({
    consumer: { key: consumerKey, secret: consumerSecret },
    signature_method: "HMAC-SHA1",
    hash_function(base, key) {
      return createHmac("sha1", key).update(base).digest("base64");
    },
  });
}

export async function fetchMyXFollows(opts: {
  userId: string;
  limit?: number;
}): Promise<FetchFollowsResult> {
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, HARD_MAX);
  const creds = await loadCredentials(opts.userId);
  if (!creds || !creds.xUserId) return { ok: false, error: "not_connected" };

  const oauth = makeOAuth(creds.consumerKey, creds.consumerSecret);
  const items: XFollowItem[] = [];
  let next: string | undefined;
  let totalSeen = 0;

  for (let page = 0; page < 11; page++) {
    const url = new URL(
      `https://api.twitter.com/2/users/${creds.xUserId}/following`,
    );
    url.searchParams.set("max_results", "100");
    url.searchParams.set(
      "user.fields",
      "name,username,verified,profile_image_url,description,public_metrics",
    );
    if (next) url.searchParams.set("pagination_token", next);

    const headers = oauth.toHeader(
      oauth.authorize(
        { url: url.toString(), method: "GET" },
        { key: creds.accessToken, secret: creds.accessTokenSecret },
      ),
    );

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: { ...(headers as unknown as Record<string, string>) },
      });
    } catch (e) {
      return {
        ok: false,
        error: "x_api",
        status: 0,
        message: (e as Error).message,
      };
    }

    if (res.status === 429) {
      const reset = Number(res.headers.get("x-rate-limit-reset"));
      const retry = reset
        ? Math.max(0, reset - Math.floor(Date.now() / 1000))
        : 900;
      return { ok: false, error: "rate_limited", retry_after_seconds: retry };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: "scope_missing",
        message:
          "Your X token doesn't have permission to read your follow list. Re-run the X setup wizard with Read+Write enabled.",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: "x_api",
        status: res.status,
        message: `x_api_${res.status}`,
      };
    }

    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        username: string;
        name?: string;
        verified?: boolean;
        profile_image_url?: string;
        description?: string;
        public_metrics?: { followers_count?: number };
      }>;
      meta?: { next_token?: string; result_count?: number };
    };

    for (const u of json.data ?? []) {
      totalSeen++;
      if (items.length < limit) {
        items.push({
          x_user_id: u.id,
          handle: u.username,
          display_name: u.name ?? u.username,
          bio: u.description ?? null,
          avatar_url: u.profile_image_url ?? null,
          verified: !!u.verified,
          followers_count: u.public_metrics?.followers_count ?? null,
        });
      }
    }

    next = json.meta?.next_token;
    if (!next || items.length >= limit) break;
  }

  return {
    ok: true,
    items,
    totalSeen,
    capped: items.length >= limit && !!next,
  };
}

// ---------- Scoring ----------

type Signal = {
  value: string;
  weight: number;
  area_id: string;
  area_slug: string;
};
type AreaDict = { bio: Signal[]; hashtags: Signal[] };

const SCORE_THRESHOLD = 1.5;
export const SUGGESTED_SCORE_THRESHOLD = SCORE_THRESHOLD;

export type SignalsBundle = {
  byArea: Map<string, AreaDict>;
  areaSlugById: Map<string, string>;
};

export async function loadCancerAreaSignals(): Promise<SignalsBundle> {
  const [{ data: signals }, { data: areas }] = await Promise.all([
    supabaseAdmin
      .from("cancer_area_signals")
      .select("cancer_area_id, signal_type, value, weight, is_active")
      .eq("is_active", true),
    supabaseAdmin.from("cancer_areas").select("id, slug"),
  ]);

  const slugById = new Map<string, string>();
  for (const a of (areas ?? []) as Array<{ id: string; slug: string }>) {
    slugById.set(a.id, a.slug);
  }

  const byArea = new Map<string, AreaDict>();
  for (const s of (signals ?? []) as Array<{
    cancer_area_id: string;
    signal_type: "bio_keyword" | "hashtag";
    value: string;
    weight: number;
  }>) {
    let d = byArea.get(s.cancer_area_id);
    if (!d) {
      d = { bio: [], hashtags: [] };
      byArea.set(s.cancer_area_id, d);
    }
    const sig: Signal = {
      value: s.value,
      weight: Number(s.weight),
      area_id: s.cancer_area_id,
      area_slug: slugById.get(s.cancer_area_id) ?? s.cancer_area_id,
    };
    if (s.signal_type === "bio_keyword") d.bio.push(sig);
    else
      d.hashtags.push({
        ...sig,
        value: s.value.replace(/^#/, "").toLowerCase(),
      });
  }

  return { byArea, areaSlugById: slugById };
}

export function scoreFollowsForCancerAreas(
  items: XFollowItem[],
  bundle: SignalsBundle,
): ScoredFollowItem[] {
  const out: ScoredFollowItem[] = [];
  for (const it of items) {
    const lowerBio = (it.bio ?? "").toLowerCase();
    const matched: ScoredFollowItem["matched_signals"] = [];
    const areaScores = new Map<string, number>();

    if (lowerBio) {
      for (const [areaId, dict] of bundle.byArea) {
        for (const sig of dict.bio) {
          if (lowerBio.includes(sig.value.toLowerCase())) {
            matched.push({
              value: sig.value,
              weight: sig.weight,
              area_slug: sig.area_slug,
            });
            areaScores.set(areaId, (areaScores.get(areaId) ?? 0) + sig.weight);
          }
        }
        for (const sig of dict.hashtags) {
          const needle = sig.value;
          if (!needle) continue;
          if (
            matched.some(
              (m) =>
                m.value.toLowerCase() === needle &&
                m.area_slug === sig.area_slug,
            )
          )
            continue;
          if (lowerBio.includes(needle)) {
            matched.push({
              value: needle,
              weight: sig.weight,
              area_slug: sig.area_slug,
            });
            areaScores.set(areaId, (areaScores.get(areaId) ?? 0) + sig.weight);
          }
        }
      }
    }

    const total = matched.reduce((acc, m) => acc + m.weight, 0);
    const suggested_area_slugs = Array.from(areaScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => bundle.areaSlugById.get(id) ?? id);

    out.push({
      ...it,
      score: total,
      matched_signals: matched,
      suggested_area_slugs,
    });
  }
  return out;
}

// ---------- Cache ----------

async function readCache(userId: string): Promise<{
  items: XFollowItem[];
  total_count: number;
  fetched_at: string;
} | null> {
  const { data } = await supabaseAdmin
    .from("user_x_follows_cache")
    .select("follows, total_count, fetched_at, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  const follows = data.follows as { items?: XFollowItem[] };
  if (!follows?.items) return null;
  return {
    items: follows.items,
    total_count: data.total_count as number,
    fetched_at: data.fetched_at as string,
  };
}

async function writeCache(
  userId: string,
  items: XFollowItem[],
  total_count: number,
): Promise<void> {
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await supabaseAdmin.from("user_x_follows_cache").upsert(
    {
      user_id: userId,
      follows: { items } as never,
      total_count,
      fetched_at: now.toISOString(),
      expires_at: expires.toISOString(),
    },
    { onConflict: "user_id" },
  );
}

export type ImportFollowsResult =
  | {
      ok: true;
      items: ScoredFollowItem[];
      totalSeen: number;
      capped: boolean;
      cached: boolean;
      fetched_at: string;
    }
  | Exclude<FetchFollowsResult, { ok: true }>;

export async function importMyXFollowsFlow(opts: {
  userId: string;
  refresh?: boolean;
}): Promise<ImportFollowsResult> {
  const { userId, refresh } = opts;

  let items: XFollowItem[] | null = null;
  let totalSeen = 0;
  let cached = false;
  let fetched_at = new Date().toISOString();

  if (!refresh) {
    const c = await readCache(userId);
    if (c) {
      items = c.items;
      totalSeen = c.total_count;
      cached = true;
      fetched_at = c.fetched_at;
    }
  }

  if (!items) {
    const fetched = await fetchMyXFollows({ userId });
    if (!fetched.ok) return fetched;
    items = fetched.items;
    totalSeen = fetched.totalSeen;
    await writeCache(userId, items, totalSeen);
  }

  const bundle = await loadCancerAreaSignals();
  const scored = scoreFollowsForCancerAreas(items, bundle);
  return {
    ok: true,
    items: scored,
    totalSeen,
    capped:
      items.length >= HARD_MAX ||
      (items.length >= DEFAULT_LIMIT && totalSeen > items.length),
    cached,
    fetched_at,
  };
}

/** Pull cached follow items for use by bulkSubscribeFromFollows. */
export async function getCachedFollows(
  userId: string,
): Promise<XFollowItem[] | null> {
  const c = await readCache(userId);
  return c?.items ?? null;
}
