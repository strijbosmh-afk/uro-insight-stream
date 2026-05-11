// Shared X-API enrichment helper.
//
// Single source of truth for "fetch a profile from X v2 users/by". Two write
// paths consume the same response:
//   1. source_candidates (handle-keyed; populated by the discovery aggregator)
//   2. sources           (id-keyed; powers the rules engine's bio scoring)
//
// Keeping one fetch + two writes prevents the two tables from drifting
// out of sync and avoids duplicate X API calls.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type EnrichedProfile = {
  external_user_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  verified: boolean;
  followers_count: number | null;
};

export type EnrichBatchResult = {
  /** Map keyed by lowercased handle. */
  found: Map<string, EnrichedProfile>;
  /** Lowercased handles X did not return. */
  notFound: string[];
  /** True if X returned 429; caller should stop and retry later. */
  rateLimited: boolean;
  /** Non-2xx HTTP status if the call hard-failed. */
  errorStatus?: number;
  /** Free-form error string (network errors). */
  errorMessage?: string;
};

const NORMALIZE = (h: string) => h.replace(/^@/, "").trim().toLowerCase();

/**
 * Fetch up to 100 X profiles in a single users/by call. The shared bearer
 * token is read inside the function (per server-fn rules — never at module
 * top-level).
 */
export async function enrichHandlesViaX(handles: string[]): Promise<EnrichBatchResult> {
  const result: EnrichBatchResult = {
    found: new Map(),
    notFound: [],
    rateLimited: false,
  };
  const cleaned = Array.from(new Set(handles.map(NORMALIZE).filter(Boolean))).slice(0, 100);
  if (cleaned.length === 0) return result;

  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    result.errorMessage = "missing_x_bearer_token";
    return result;
  }

  const url = new URL("https://api.twitter.com/2/users/by");
  url.searchParams.set("usernames", cleaned.join(","));
  url.searchParams.set(
    "user.fields",
    "name,username,verified,profile_image_url,description,public_metrics",
  );

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    result.errorMessage = err instanceof Error ? err.message : String(err);
    return result;
  }

  if (res.status === 429) {
    result.rateLimited = true;
    return result;
  }
  if (!res.ok) {
    result.errorStatus = res.status;
    result.errorMessage = `x_api_${res.status}`;
    return result;
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
  };

  for (const u of json.data ?? []) {
    const handle = NORMALIZE(u.username);
    result.found.set(handle, {
      external_user_id: u.id,
      handle: u.username,
      display_name: u.name ?? u.username,
      avatar_url: u.profile_image_url ?? null,
      bio: u.description ?? null,
      verified: !!u.verified,
      followers_count: u.public_metrics?.followers_count ?? null,
    });
  }

  result.notFound = cleaned.filter((h) => !result.found.has(h));
  return result;
}

/**
 * Mirror an enriched profile onto the canonical `sources` row keyed by handle.
 * No-op if no sources row exists for that handle (the row may live only in
 * source_candidates as a discovery suggestion).
 */
export async function upsertSourceProfileByHandle(
  handle: string,
  profile: EnrichedProfile,
): Promise<void> {
  const h = NORMALIZE(handle);
  const nowISO = new Date().toISOString();
  await supabaseAdmin
    .from("sources")
    .update({
      display_name: profile.display_name,
      avatar_url: profile.avatar_url ?? "",
      verified: profile.verified,
      bio: profile.bio,
      followers_count: profile.followers_count,
      enriched_at: nowISO,
      last_enrichment_attempt_at: nowISO,
    })
    .eq("handle", h);
}

/**
 * Stamp last_enrichment_attempt_at on a sources row when X did NOT return the
 * handle (so the cron doesn't re-pick it every minute). enriched_at stays as
 * it was so the row is still considered stale data-wise.
 */
export async function markSourceEnrichmentAttempt(handle: string): Promise<void> {
  const h = NORMALIZE(handle);
  await supabaseAdmin
    .from("sources")
    .update({ last_enrichment_attempt_at: new Date().toISOString() })
    .eq("handle", h);
}