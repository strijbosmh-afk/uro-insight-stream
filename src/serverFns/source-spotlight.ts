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
import {
  computeSourceBriefing,
  currentWeekStartUTC,
  type SourceBriefing,
} from "@/server/source-briefing.server";
import {
  reserveExpensiveLlmCall,
  LlmQuotaExceededError,
} from "@/server/llm-quota.server";

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

// =====================================================================
// Phase B — Themes (LLM-derived, cached 7d in source_themes)
// =====================================================================

export type SpotlightThemes = {
  themes: SourceTheme[];
  computed_at: string;
  expires_at: string;
  model: string;
  is_stale: boolean;
  cache_hit: boolean;
};

const ThemesInputSchema = z.object({
  handle: z.string().min(1).max(50).transform((h) => h.replace(/^@/, "").trim().toLowerCase()),
  refresh: z.boolean().optional().default(false),
});

export const getSourceThemes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ThemesInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<SpotlightThemes | null> => {
    const id = data.handle;
    const now = Date.now();

    // If admin requests refresh, validate role.
    if (data.refresh) {
      await assertAdmin(context.supabase, context.userId);
    }

    const { data: cached } = await supabaseAdmin
      .from("source_themes")
      .select("themes, computed_at, expires_at, model")
      .eq("source_id", id)
      .maybeSingle();

    const isStale =
      !cached || new Date(cached.expires_at).getTime() < now;

    if (cached && !isStale && !data.refresh) {
      return {
        themes: cached.themes as unknown as SourceTheme[],
        computed_at: cached.computed_at,
        expires_at: cached.expires_at,
        model: cached.model,
        is_stale: false,
        cache_hit: true,
      };
    }

    // Need to recompute. Fetch bio + recent 100 tweets + cancer area slugs.
    const [{ data: src }, { data: tweetRows }, { data: areas }] = await Promise.all([
      supabaseAdmin.from("sources").select("bio").eq("id", id).maybeSingle(),
      supabaseAdmin
        .from("tweets")
        .select("id, text, hashtags, created_at")
        .eq("source_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin.from("cancer_areas").select("slug"),
    ]);

    const tweets = (tweetRows ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      hashtags: t.hashtags ?? [],
      created_at: t.created_at,
    }));

    if (tweets.length < 20) {
      // Not enough signal — return stale cache if any, otherwise null.
      if (cached) {
        return {
          themes: cached.themes as unknown as SourceTheme[],
          computed_at: cached.computed_at,
          expires_at: cached.expires_at,
          model: cached.model,
          is_stale: true,
          cache_hit: true,
        };
      }
      return null;
    }

    // Cache miss → about to spend an LLM call. Gate non-admin callers
    // behind the per-user daily expensive-LLM budget so a script
    // iterating handles can't burn unbounded credit.
    if (!data.refresh) {
      const ok = await reserveExpensiveLlmCall(context.userId);
      if (!ok) {
        if (cached) {
          return {
            themes: cached.themes as unknown as SourceTheme[],
            computed_at: cached.computed_at,
            expires_at: cached.expires_at,
            model: cached.model,
            is_stale: true,
            cache_hit: true,
          };
        }
        throw new LlmQuotaExceededError();
      }
    }

    const slugs = (areas ?? []).map((a) => a.slug);
    const result = await computeSourceThemes({
      bio: src?.bio ?? null,
      tweets,
      cancerAreaSlugs: slugs,
    });

    if (!result) {
      // LLM failed — return stale cache if available.
      if (cached) {
        return {
          themes: cached.themes as unknown as SourceTheme[],
          computed_at: cached.computed_at,
          expires_at: cached.expires_at,
          model: cached.model,
          is_stale: true,
          cache_hit: true,
        };
      }
      throw new Error("themes_unavailable");
    }

    const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    const computedAt = new Date(now).toISOString();
    await supabaseAdmin
      .from("source_themes")
      .upsert({
        source_id: id,
        themes: result.themes as unknown as never,
        computed_at: computedAt,
        expires_at: expiresAt,
        model: result.model,
      });

    return {
      themes: result.themes,
      computed_at: computedAt,
      expires_at: expiresAt,
      model: result.model,
      is_stale: false,
      cache_hit: false,
    };
  });

// =====================================================================
// Phase B — Rhythm (pure SQL aggregations over recent tweets)
// =====================================================================

export type SpotlightRhythm = {
  hourly: number[];
  dow: number[];
  inferred_timezone: string | null;
  offset_hours: number | null;
  total_tweets_30d: number;
  peak_hour: number;
  peak_dow: number;
};

const HandleOnlySchema = z.object({
  handle: z.string().min(1).max(50).transform((h) => h.replace(/^@/, "").trim().toLowerCase()),
});

export const getSourceRhythm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => HandleOnlySchema.parse(data))
  .handler(async ({ data }): Promise<SpotlightRhythm> => {
    const id = data.handle;
    const sinceISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabaseAdmin
      .from("tweets")
      .select("created_at")
      .eq("source_id", id)
      .gte("created_at", sinceISO)
      .limit(2000);
    if (error) throw new Error(error.message);

    const hourly = new Array(24).fill(0) as number[];
    const dow = new Array(7).fill(0) as number[]; // 0=Mon..6=Sun
    for (const r of rows ?? []) {
      const d = new Date(r.created_at);
      hourly[d.getUTCHours()]++;
      // JS getUTCDay: 0=Sun..6=Sat. Remap to 0=Mon..6=Sun.
      const js = d.getUTCDay();
      const idx = js === 0 ? 6 : js - 1;
      dow[idx]++;
    }

    let peakHour = 0;
    for (let i = 1; i < 24; i++) if (hourly[i] > hourly[peakHour]) peakHour = i;
    let peakDow = 0;
    for (let i = 1; i < 7; i++) if (dow[i] > dow[peakDow]) peakDow = i;

    const tz = inferTimezoneFromHourly(hourly);

    return {
      hourly,
      dow,
      inferred_timezone: tz.inferred_timezone,
      offset_hours: tz.offset_hours,
      total_tweets_30d: rows?.length ?? 0,
      peak_hour: peakHour,
      peak_dow: peakDow,
    };
  });

// =====================================================================
// Phase B — Inner circle (conversation network, 30d)
// =====================================================================

export type InnerCircleEntry = {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  count: number;
  is_tracked: boolean;
};

export type SpotlightInnerCircle = {
  outgoing: InnerCircleEntry[]; // who this source replies-to/quotes most
  incoming: InnerCircleEntry[]; // who replies to this source most
};

export const getSourceInnerCircle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => HandleOnlySchema.parse(data))
  .handler(async ({ data }): Promise<SpotlightInnerCircle> => {
    const id = data.handle;
    const sinceISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Outgoing: tweets authored by this source that are replies/quotes,
    // grouped by parent_handle.
    const outgoingPromise = supabaseAdmin
      .from("tweets")
      .select("parent_handle")
      .eq("source_id", id)
      .in("tweet_type", ["reply", "quote"])
      .gte("created_at", sinceISO)
      .not("parent_handle", "is", null)
      .limit(2000);

    // Incoming: tweets where parent_handle = this source's handle.
    const incomingPromise = supabaseAdmin
      .from("tweets")
      .select("author_handle")
      .eq("parent_handle", id)
      .gte("created_at", sinceISO)
      .limit(2000);

    const [outRes, inRes] = await Promise.all([outgoingPromise, incomingPromise]);
    if (outRes.error) throw new Error(outRes.error.message);
    if (inRes.error) throw new Error(inRes.error.message);

    const tally = (rows: Array<Record<string, string | null>>, key: string) => {
      const counts = new Map<string, number>();
      for (const r of rows) {
        const raw = r[key];
        if (!raw) continue;
        const h = raw.toLowerCase().replace(/^@/, "");
        if (!h || h === id) continue;
        counts.set(h, (counts.get(h) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    };

    const outgoingTop = tally((outRes.data ?? []) as Array<Record<string, string | null>>, "parent_handle");
    const incomingTop = tally((inRes.data ?? []) as Array<Record<string, string | null>>, "author_handle");

    const allHandles = Array.from(new Set([...outgoingTop, ...incomingTop].map(([h]) => h)));
    if (allHandles.length === 0) return { outgoing: [], incoming: [] };

    const [{ data: srcRows }, { data: candRows }] = await Promise.all([
      supabaseAdmin
        .from("sources")
        .select("id, handle, display_name, avatar_url")
        .in("id", allHandles),
      supabaseAdmin
        .from("source_candidates")
        .select("handle, display_name, avatar_url")
        .in("handle", allHandles),
    ]);

    const trackedById = new Map<string, { display_name: string | null; avatar_url: string | null }>();
    for (const s of srcRows ?? []) trackedById.set(s.id, { display_name: s.display_name, avatar_url: s.avatar_url });
    const candByHandle = new Map<string, { display_name: string | null; avatar_url: string | null }>();
    for (const c of candRows ?? []) candByHandle.set(c.handle.toLowerCase(), { display_name: c.display_name, avatar_url: c.avatar_url });

    const enrich = (rows: Array<[string, number]>): InnerCircleEntry[] =>
      rows.map(([handle, count]) => {
        const tracked = trackedById.get(handle);
        if (tracked) {
          return {
            handle,
            display_name: tracked.display_name,
            avatar_url: tracked.avatar_url,
            count,
            is_tracked: true,
          };
        }
        const cand = candByHandle.get(handle);
        return {
          handle,
          display_name: cand?.display_name ?? null,
          avatar_url: cand?.avatar_url ?? null,
          count,
          is_tracked: false,
        };
      });

    return {
      outgoing: enrich(outgoingTop),
      incoming: enrich(incomingTop),
    };
  });

// =====================================================================
// Phase C — Briefing (LLM-derived one-pager, cached weekly)
// =====================================================================

export type SpotlightBriefing = {
  briefing: SourceBriefing;
  week_start: string;
  computed_at: string;
  expires_at: string;
  model: string;
  is_stale: boolean;
  cache_hit: boolean;
};

const BriefingInputSchema = z.object({
  handle: z
    .string()
    .min(1)
    .max(50)
    .transform((h) => h.replace(/^@/, "").trim().toLowerCase()),
  refresh: z.boolean().optional().default(false),
});

export const getSourceBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => BriefingInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<SpotlightBriefing | null> => {
    const id = data.handle;
    const now = Date.now();
    const weekStart = currentWeekStartUTC();

    if (data.refresh) {
      await assertAdmin(context.supabase, context.userId);
    }

    // Confirm source exists
    const { data: src } = await supabaseAdmin
      .from("sources")
      .select("id, bio")
      .eq("id", id)
      .maybeSingle();
    if (!src) return null;

    // Cache lookup keyed by (source_id, week_start).
    const { data: cached } = await supabaseAdmin
      .from("source_briefings")
      .select("briefing, computed_at, expires_at, model")
      .eq("source_id", id)
      .eq("week_start", weekStart)
      .maybeSingle();

    const isStale = !cached || new Date(cached.expires_at).getTime() < now;
    if (cached && !isStale && !data.refresh) {
      return {
        briefing: cached.briefing as unknown as SourceBriefing,
        week_start: weekStart,
        computed_at: cached.computed_at,
        expires_at: cached.expires_at,
        model: cached.model,
        is_stale: false,
        cache_hit: true,
      };
    }

    // Pull inputs in parallel.
    const sinceISO = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: tweetRows }, { data: areas }, { data: groupsRes }, { data: congressRes }] =
      await Promise.all([
        supabaseAdmin
          .from("tweets")
          .select(
            "id, text, hashtags, created_at, like_count, retweet_count, reply_count, tweet_type, parent_handle",
          )
          .eq("source_id", id)
          .gte("created_at", sinceISO)
          .order("created_at", { ascending: false })
          .limit(150),
        supabaseAdmin.from("cancer_areas").select("slug"),
        supabaseAdmin
          .from("source_group_members")
          .select("source_groups:group_id ( name, is_archived )")
          .eq("source_id", id),
        supabaseAdmin
          .from("congress_featured_sources")
          .select(
            "role, congresses:congress_id ( name, start_date, city, country )",
          )
          .eq("source_id", id),
      ]);

    const tweets = (tweetRows ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      hashtags: t.hashtags ?? [],
      created_at: t.created_at,
      like_count: t.like_count ?? 0,
      retweet_count: t.retweet_count ?? 0,
      reply_count: t.reply_count ?? 0,
      tweet_type: t.tweet_type ?? null,
      parent_handle: t.parent_handle ?? null,
    }));

    if (tweets.length < 10) {
      // Not enough signal — return stale cache if available, else null.
      if (cached) {
        return {
          briefing: cached.briefing as unknown as SourceBriefing,
          week_start: weekStart,
          computed_at: cached.computed_at,
          expires_at: cached.expires_at,
          model: cached.model,
          is_stale: true,
          cache_hit: true,
        };
      }
      return null;
    }

    type GroupNameRow = { name: string; is_archived: boolean };
    const groupNames: string[] = [];
    for (const r of (groupsRes ?? []) as Array<{
      source_groups: GroupNameRow | GroupNameRow[] | null;
    }>) {
      const g = Array.isArray(r.source_groups) ? r.source_groups[0] : r.source_groups;
      if (g && !g.is_archived) groupNames.push(g.name);
    }

    type CongressMini = {
      name: string;
      start_date: string | null;
      city: string | null;
      country: string | null;
    };
    const todayISO = new Date().toISOString().slice(0, 10);
    const upcomingCongresses: Array<{
      name: string;
      start_date: string | null;
      city: string | null;
      country: string | null;
      role: string | null;
    }> = [];
    for (const r of (congressRes ?? []) as Array<{
      role: string | null;
      congresses: CongressMini | CongressMini[] | null;
    }>) {
      const c = Array.isArray(r.congresses) ? r.congresses[0] : r.congresses;
      if (!c) continue;
      if (c.start_date && c.start_date < todayISO) continue;
      upcomingCongresses.push({
        name: c.name,
        start_date: c.start_date,
        city: c.city,
        country: c.country,
        role: r.role,
      });
    }

    const slugs = (areas ?? []).map((a) => a.slug);
    // Cache miss → gate the LLM call on the per-user daily budget.
    if (!data.refresh) {
      const ok = await reserveExpensiveLlmCall(context.userId);
      if (!ok) {
        if (cached) {
          return {
            briefing: cached.briefing as unknown as SourceBriefing,
            week_start: weekStart,
            computed_at: cached.computed_at,
            expires_at: cached.expires_at,
            model: cached.model,
            is_stale: true,
            cache_hit: true,
          };
        }
        throw new LlmQuotaExceededError();
      }
    }
    const result = await computeSourceBriefing({
      handle: id,
      bio: src.bio ?? null,
      tweets,
      cancerAreaSlugs: slugs,
      upcomingCongresses,
      groupNames,
    });

    if (!result) {
      if (cached) {
        return {
          briefing: cached.briefing as unknown as SourceBriefing,
          week_start: weekStart,
          computed_at: cached.computed_at,
          expires_at: cached.expires_at,
          model: cached.model,
          is_stale: true,
          cache_hit: true,
        };
      }
      throw new Error("briefing_unavailable");
    }

    const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    const computedAt = new Date(now).toISOString();
    await supabaseAdmin
      .from("source_briefings")
      .upsert({
        source_id: id,
        week_start: weekStart,
        briefing: result.briefing as unknown as never,
        computed_at: computedAt,
        expires_at: expiresAt,
        model: result.model,
      });

    return {
      briefing: result.briefing,
      week_start: weekStart,
      computed_at: computedAt,
      expires_at: expiresAt,
      model: result.model,
      is_stale: false,
      cache_hit: false,
    };
  });
