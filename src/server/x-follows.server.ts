// Server-only: fetch a user's X follow list, score it against the cancer-area
// signal dictionary, and cache the normalized result for ~7 days so repeated
// runs (wizard step + Settings re-run) don't re-burn the X API quota.

import OAuth from "oauth-1.0a";
import { createHmac } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadCredentials } from "@/server/x-credentials.server";
import { emitOpsAlert } from "@/server/ops-alerts.server";

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

const LOW_SOURCE_COUNT_THRESHOLD = 5;
const LOW_SOURCE_MIN_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DIFF_NUDGE_MIN_NEWCOMERS = 3;

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
      const remaining = res.headers.get("x-rate-limit-remaining");
      const retry = reset
        ? Math.max(0, reset - Math.floor(Date.now() / 1000))
        : 900;
      void emitOpsAlert({
        kind: "x_rate_limit_burst",
        severity: "warning",
        message: `X 429 on GET /following (user ${opts.userId}); retry in ${retry}s`,
        metadata: {
          endpoint: "GET /2/users/:id/following",
          user_id: opts.userId,
          rate_limit_remaining: remaining,
          rate_limit_reset: reset || null,
          retry_after_seconds: retry,
        },
        dedupeWindowHours: 1,
      });
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

/**
 * Refresh the cached follow list while preserving the prior set of handles
 * in `previous_handles`. Used by the nightly diff cron so the diff-mode UI
 * can show only newcomers since the last cached snapshot.
 */
export async function refreshFollowsCacheWithDiff(
  userId: string,
  freshItems: XFollowItem[],
  totalSeen: number,
): Promise<{ previous_handles: string[] }> {
  const { data: prior } = await supabaseAdmin
    .from("user_x_follows_cache")
    .select("follows")
    .eq("user_id", userId)
    .maybeSingle();
  const prevItems =
    ((prior?.follows as { items?: XFollowItem[] } | null)?.items ?? []) as XFollowItem[];
  const previous_handles = prevItems.map((p) => p.handle.toLowerCase());

  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await supabaseAdmin.from("user_x_follows_cache").upsert(
    {
      user_id: userId,
      follows: { items: freshItems } as never,
      previous_handles,
      total_count: totalSeen,
      fetched_at: now.toISOString(),
      expires_at: expires.toISOString(),
    },
    { onConflict: "user_id" },
  );
  return { previous_handles };
}

/**
 * Read the previously-cached handle set (snapshot from before the last
 * diff-cron refresh). Used by the import dialog in `mode: 'diff'` to filter
 * the current cache down to newcomers only.
 */
export async function getPreviousHandles(
  userId: string,
): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("user_x_follows_cache")
    .select("previous_handles")
    .eq("user_id", userId)
    .maybeSingle();
  const arr = ((data as { previous_handles?: string[] | null } | null)
    ?.previous_handles) ?? [];
  return new Set(arr.map((h) => h.toLowerCase()));
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

// ---------- Discoverability nudge eligibility ----------

/**
 * Timestamp the user_x_follows_cache migration landed (= when the import
 * feature shipped). Stored as a constant so the legacy-user check doesn't
 * drift if the migration filename changes.
 */
export const FOLLOWS_FEATURE_LAUNCH_DATE = "2026-05-11T12:51:39Z";

const RE_NUDGE_SPACING_MS = 7 * 24 * 60 * 60 * 1000;
const SECOND_SESSION_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_DISMISSALS = 3;

/**
 * True when the user qualifies for the recurring dashboard nudge:
 * - X connected (active, not revoked, scope_read)
 * - never imported follows
 * - dismissed < 3 times
 * - dismissed at least 7 days ago (if ever)
 * - account is at least 24h old (proxy for "second session")
 */
export async function isEligibleForFollowsImportNudge(
  userId: string,
): Promise<boolean> {
  const [{ data: cred }, { data: prof }] = await Promise.all([
    supabaseAdmin
      .from("user_x_credentials")
      .select("follows_imported_at, scope_read, revoked_at, is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .is("revoked_at", null)
      .maybeSingle(),
    supabaseAdmin
      .from("profiles")
      .select(
        "created_at, follows_import_nudge_dismissed_count, follows_import_nudge_last_dismissed_at",
      )
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (!cred) return false;
  const c = cred as {
    follows_imported_at: string | null;
    scope_read: boolean;
  };
  if (!c.scope_read) return false;
  if (c.follows_imported_at) return false;

  const p = (prof ?? {}) as {
    created_at?: string;
    follows_import_nudge_dismissed_count?: number;
    follows_import_nudge_last_dismissed_at?: string | null;
  };
  if ((p.follows_import_nudge_dismissed_count ?? 0) >= MAX_DISMISSALS)
    return false;

  // "Second session" proxy: account at least 24h old
  const created = p.created_at ? new Date(p.created_at).getTime() : Date.now();
  if (Date.now() - created < SECOND_SESSION_AGE_MS) return false;

  // 7-day spacing after the most recent dismiss
  if (p.follows_import_nudge_last_dismissed_at) {
    const last = new Date(p.follows_import_nudge_last_dismissed_at).getTime();
    if (Date.now() - last < RE_NUDGE_SPACING_MS) return false;
  }

  return true;
}

/**
 * True when the user predates the feature launch and hasn't seen the legacy
 * one-time prompt yet (and is otherwise eligible).
 */
export async function isEligibleForLegacyFollowsImportPrompt(
  userId: string,
): Promise<boolean> {
  const [{ data: cred }, { data: prof }] = await Promise.all([
    supabaseAdmin
      .from("user_x_credentials")
      .select("follows_imported_at, scope_read, revoked_at, is_active")
      .eq("user_id", userId)
      .eq("is_active", true)
      .is("revoked_at", null)
      .maybeSingle(),
    supabaseAdmin
      .from("profiles")
      .select("created_at, legacy_user_import_prompt_seen_at")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  if (!cred) return false;
  const c = cred as { follows_imported_at: string | null; scope_read: boolean };
  if (!c.scope_read || c.follows_imported_at) return false;

  const p = (prof ?? {}) as {
    created_at?: string;
    legacy_user_import_prompt_seen_at?: string | null;
  };
  if (p.legacy_user_import_prompt_seen_at) return false;
  if (!p.created_at) return false;
  return (
    new Date(p.created_at).getTime() <
    new Date(FOLLOWS_FEATURE_LAUNCH_DATE).getTime()
  );
}

/**
 * True when the user has X connected, never imported, has manually added
 * fewer than 5 sources, the account is at least 7 days old, and the
 * contextual nudge hasn't been dismissed yet.
 */
export async function isEligibleForLowSourceCountNudge(
  userId: string,
): Promise<boolean> {
  const [{ data: cred }, { data: prof }, { count: subCount }] =
    await Promise.all([
      supabaseAdmin
        .from("user_x_credentials")
        .select("follows_imported_at, scope_read, revoked_at, is_active")
        .eq("user_id", userId)
        .eq("is_active", true)
        .is("revoked_at", null)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("created_at, low_source_count_nudge_dismissed_at")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_subscribed_sources")
        .select("source_id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);
  if (!cred) return false;
  const c = cred as { follows_imported_at: string | null; scope_read: boolean };
  if (!c.scope_read || c.follows_imported_at) return false;
  const p = (prof ?? {}) as {
    created_at?: string;
    low_source_count_nudge_dismissed_at?: string | null;
  };
  if (p.low_source_count_nudge_dismissed_at) return false;
  if (!p.created_at) return false;
  if (Date.now() - new Date(p.created_at).getTime() < LOW_SOURCE_MIN_ACCOUNT_AGE_MS)
    return false;
  if ((subCount ?? 0) >= LOW_SOURCE_COUNT_THRESHOLD) return false;
  return true;
}

/**
 * True when the user has already imported once but the nightly diff cron
 * has surfaced new oncology-relevant follows since then, and the user
 * hasn't dismissed *this* batch yet.
 */
export async function isEligibleForDiffNudge(
  userId: string,
): Promise<{ eligible: boolean; new_count: number }> {
  const { data: cred } = await supabaseAdmin
    .from("user_x_credentials")
    .select(
      "follows_imported_at, scope_read, revoked_at, is_active, follows_new_since_last_import, follows_diff_dismissed_at, follows_diff_last_checked_at",
    )
    .eq("user_id", userId)
    .eq("is_active", true)
    .is("revoked_at", null)
    .maybeSingle();
  if (!cred) return { eligible: false, new_count: 0 };
  const c = cred as {
    follows_imported_at: string | null;
    scope_read: boolean;
    follows_new_since_last_import: number | null;
    follows_diff_dismissed_at: string | null;
    follows_diff_last_checked_at: string | null;
  };
  if (!c.scope_read || !c.follows_imported_at)
    return { eligible: false, new_count: 0 };
  const newCount = c.follows_new_since_last_import ?? 0;
  if (newCount < DIFF_NUDGE_MIN_NEWCOMERS)
    return { eligible: false, new_count: newCount };
  // Re-arm: if the dismissal predates the latest check, this is a fresh batch.
  if (c.follows_diff_dismissed_at && c.follows_diff_last_checked_at) {
    if (
      new Date(c.follows_diff_dismissed_at).getTime() >=
      new Date(c.follows_diff_last_checked_at).getTime()
    ) {
      return { eligible: false, new_count: newCount };
    }
  }
  return { eligible: true, new_count: newCount };
}
