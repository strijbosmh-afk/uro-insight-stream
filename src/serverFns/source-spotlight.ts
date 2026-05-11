// Phase A spotlight RPC for /sources/$handle. One round-trip returning the
// source row, derived cancer-area chips, group memberships, upcoming
// congresses where the source is featured, and the most-recent tweets.
//
// Untracked handles return { not_found: true } so the page can render a
// "Track this source" CTA instead of 404. Subscription state is included
// so the header CTA can render Follow vs Unfollow without a second call.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "@/server/admin-middleware.server";
import {
  computeSourceThemes,
  inferTimezoneFromHourly,
  type SourceTheme,
} from "@/server/source-themes.server";

export type SpotlightSource = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string;
  verified: boolean;
  bio: string | null;
  followers_count: number | null;
  enriched_at: string | null;
  last_enrichment_attempt_at: string | null;
  tweet_count_30d: number;
};

export type SpotlightArea = { id: string; slug: string; name: string };

export type SpotlightGroup = {
  group_id: string;
  slug: string;
  name: string;
  visibility: "official" | "public" | "private";
  member_count: number;
};

export type SpotlightCongress = {
  congress_id: string;
  slug: string | null;
  name: string;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  country: string | null;
  role: string | null;
};

export type SpotlightTweet = {
  tweet_id: string;
  text: string;
  created_at: string;
  hashtags: string[];
  public_metrics: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
  };
  media_urls: string[];
  in_reply_to_tweet_id: string | null;
  engagement_score: number;
};

export type SpotlightCore = {
  source: SpotlightSource | null;
  is_subscribed: boolean;
  cancer_areas: SpotlightArea[];
  group_memberships: SpotlightGroup[];
  upcoming_congresses: SpotlightCongress[];
  recent_tweets: SpotlightTweet[];
  not_found: boolean;
};

const RECENT_LIMIT = 20;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const HandleSchema = z.object({
  handle: z
    .string()
    .min(1)
    .max(50)
    .transform((h) => h.replace(/^@/, "").trim().toLowerCase()),
  // Optional sort: "recent" (default, by created_at desc) or "top" (by engagement)
  sort: z.enum(["recent", "top"]).default("recent"),
  limit: z.number().int().min(1).max(50).default(RECENT_LIMIT),
  cursor: z.string().nullable().optional(), // ISO timestamp (recent) or score sentinel (top)
});

function visibilityOf(v: string): SpotlightGroup["visibility"] {
  return v === "official" || v === "private" ? v : "public";
}

export const getSourceSpotlightCore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => HandleSchema.parse(data))
  .handler(async ({ data, context }): Promise<SpotlightCore> => {
    const { userId } = context;
    const id = data.handle;

    // ---- 1. Source row ------------------------------------------------------
    const { data: srcRow, error: srcErr } = await supabaseAdmin
      .from("sources")
      .select(
        "id, handle, display_name, avatar_url, verified, bio, followers_count, enriched_at, last_enrichment_attempt_at",
      )
      .eq("id", id)
      .maybeSingle();
    if (srcErr) throw new Error(`source: ${srcErr.message}`);

    if (!srcRow) {
      return {
        source: null,
        is_subscribed: false,
        cancer_areas: [],
        group_memberships: [],
        upcoming_congresses: [],
        recent_tweets: [],
        not_found: true,
      };
    }

    // ---- 2. Subscription state ---------------------------------------------
    const subPromise = supabaseAdmin
      .from("user_subscribed_sources")
      .select("source_id")
      .eq("user_id", userId)
      .eq("source_id", id)
      .maybeSingle();

    // ---- 3. Group memberships (and area derivation) ------------------------
    const groupsPromise = supabaseAdmin
      .from("source_group_members")
      .select(
        "group_id, source_groups:group_id ( id, slug, name, visibility, is_archived, member_count )",
      )
      .eq("source_id", id);

    // ---- 4. Featured congresses --------------------------------------------
    const congressPromise = supabaseAdmin
      .from("congress_featured_sources")
      .select(
        "congress_id, role, congresses:congress_id ( id, name, start_date, end_date, city, country, short_code )",
      )
      .eq("source_id", id);

    // ---- 5. Recent tweets ---------------------------------------------------
    const tweetsPromise = (async () => {
      const sinceISO = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
      let q = supabaseAdmin
        .from("tweets")
        .select(
          "id, text, created_at, hashtags, like_count, retweet_count, reply_count, media_urls, parent_tweet_external_id",
        )
        .eq("source_id", id);

      if (data.sort === "top") {
        // For "top": fetch a wider window (last 30d), sort client-side by
        // engagement_score, slice to limit. This avoids a per-row computed sort
        // on the DB and keeps the path simple. Pagination on "top" is best-effort:
        // the cursor is the score of the last item.
        q = q.gte("created_at", sinceISO).order("created_at", { ascending: false }).limit(500);
      } else {
        q = q.order("created_at", { ascending: false }).limit(data.limit);
        if (data.cursor) q = q.lt("created_at", data.cursor);
      }

      const { data: rows, error } = await q;
      if (error) throw new Error(`tweets: ${error.message}`);
      return (rows ?? []) as Array<{
        id: string;
        text: string;
        created_at: string;
        hashtags: string[] | null;
        like_count: number;
        retweet_count: number;
        reply_count: number;
        media_urls: string[] | null;
        parent_tweet_external_id: string | null;
      }>;
    })();

    // ---- 6. 30d tweet count for header stat --------------------------------
    const sinceISO30 = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
    const countPromise = supabaseAdmin
      .from("tweets")
      .select("id", { count: "exact", head: true })
      .eq("source_id", id)
      .gte("created_at", sinceISO30);

    const [subRes, groupsRes, congressRes, tweetsRows, countRes] =
      await Promise.all([
        subPromise,
        groupsPromise,
        congressPromise,
        tweetsPromise,
        countPromise,
      ]);

    if (groupsRes.error) throw new Error(`groups: ${groupsRes.error.message}`);
    if (congressRes.error) throw new Error(`congresses: ${congressRes.error.message}`);

    // Memberships → flatten + filter archived
    type GroupRow = {
      id: string;
      slug: string;
      name: string;
      visibility: string;
      is_archived: boolean;
      member_count: number;
    };
    const groupMemberships: SpotlightGroup[] = [];
    const groupIds: string[] = [];
    for (const row of (groupsRes.data ?? []) as Array<{
      group_id: string;
      source_groups: GroupRow | GroupRow[] | null;
    }>) {
      const g = Array.isArray(row.source_groups) ? row.source_groups[0] : row.source_groups;
      if (!g || g.is_archived) continue;
      groupMemberships.push({
        group_id: g.id,
        slug: g.slug,
        name: g.name,
        visibility: visibilityOf(g.visibility),
        member_count: g.member_count,
      });
      groupIds.push(g.id);
    }
    // Stable order: official first, then alphabetical
    groupMemberships.sort((a, b) => {
      if (a.visibility !== b.visibility) {
        if (a.visibility === "official") return -1;
        if (b.visibility === "official") return 1;
      }
      return a.name.localeCompare(b.name);
    });

    // Cancer areas derived from group → area junction
    let cancerAreas: SpotlightArea[] = [];
    if (groupIds.length > 0) {
      const { data: areaJoin } = await supabaseAdmin
        .from("source_group_cancer_areas")
        .select("group_id, cancer_areas:cancer_area_id ( id, slug, name )")
        .in("group_id", groupIds);
      const byId = new Map<string, SpotlightArea>();
      for (const row of (areaJoin ?? []) as Array<{
        group_id: string;
        cancer_areas: SpotlightArea | SpotlightArea[] | null;
      }>) {
        const a = Array.isArray(row.cancer_areas) ? row.cancer_areas[0] : row.cancer_areas;
        if (a && !byId.has(a.id)) byId.set(a.id, a);
      }
      cancerAreas = Array.from(byId.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    }

    // Congresses: filter to upcoming (start_date >= today), sort asc
    const todayISO = new Date().toISOString().slice(0, 10);
    type CongressRow = {
      id: string;
      name: string;
      start_date: string | null;
      end_date: string | null;
      city: string | null;
      country: string | null;
      short_code: string | null;
    };
    const upcomingCongresses: SpotlightCongress[] = [];
    for (const row of (congressRes.data ?? []) as Array<{
      congress_id: string;
      role: string | null;
      congresses: CongressRow | CongressRow[] | null;
    }>) {
      const c = Array.isArray(row.congresses) ? row.congresses[0] : row.congresses;
      if (!c) continue;
      if (c.start_date && c.start_date < todayISO) continue;
      upcomingCongresses.push({
        congress_id: c.id,
        slug: c.short_code,
        name: c.name,
        start_date: c.start_date,
        end_date: c.end_date,
        city: c.city,
        country: c.country,
        role: row.role,
      });
    }
    upcomingCongresses.sort((a, b) =>
      String(a.start_date ?? "9999").localeCompare(String(b.start_date ?? "9999")),
    );

    // Tweets: shape + (optionally) sort by engagement
    const tweets: SpotlightTweet[] = tweetsRows.map((t) => {
      const score = t.like_count + 2 * t.retweet_count + 3 * t.reply_count;
      return {
        tweet_id: t.id,
        text: t.text,
        created_at: t.created_at,
        hashtags: t.hashtags ?? [],
        public_metrics: {
          like_count: t.like_count,
          retweet_count: t.retweet_count,
          reply_count: t.reply_count,
        },
        media_urls: t.media_urls ?? [],
        in_reply_to_tweet_id: t.parent_tweet_external_id,
        engagement_score: score,
      };
    });
    if (data.sort === "top") {
      tweets.sort((a, b) => b.engagement_score - a.engagement_score);
      tweets.length = Math.min(tweets.length, data.limit);
    }

    return {
      source: {
        id: srcRow.id,
        handle: srcRow.handle,
        display_name: srcRow.display_name,
        avatar_url: srcRow.avatar_url,
        verified: srcRow.verified,
        bio: srcRow.bio,
        followers_count: srcRow.followers_count,
        enriched_at: srcRow.enriched_at,
        last_enrichment_attempt_at: srcRow.last_enrichment_attempt_at,
        tweet_count_30d: countRes.count ?? 0,
      },
      is_subscribed: !!subRes.data,
      cancer_areas: cancerAreas,
      group_memberships: groupMemberships,
      upcoming_congresses: upcomingCongresses,
      recent_tweets: tweets,
      not_found: false,
    };
  });
