// Watchlist CRUD + topic management + mute + matches list/dismiss + unread count.
// All operations run as the signed-in user via requireSupabaseAuth so RLS
// enforces ownership; no service-role escapes.
//
// Note: when a user watches a GROUP, membership is resolved live in the
// classifier (joins source_group_members at classification time). Adding or
// removing a source from the group instantly changes which tweets the
// watchlist matches against — no resync, no cache to invalidate. Do not
// denormalize the group's source list onto the watchlist or you'll break
// this property.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TargetSchema = z.discriminatedUnion("target_kind", [
  z.object({ target_kind: z.literal("source"), target_source_id: z.string().min(1).max(64) }),
  z.object({ target_kind: z.literal("group"), target_group_id: z.string().uuid() }),
]);

const CreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email_enabled: z.boolean().optional().default(false),
    quiet_hours_start: z.number().int().min(0).max(23).optional(),
    quiet_hours_end: z.number().int().min(0).max(23).optional(),
    max_emails_per_day: z.number().int().min(1).max(100).optional(),
    timezone: z.string().trim().max(64).optional().nullable(),
    topics: z.array(z.string().trim().min(2).max(80)).max(20).optional().default([]),
  })
  .and(TargetSchema);

export const createWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const insertRow: {
      user_id: string;
      name: string;
      target_kind: "source" | "group";
      target_source_id: string | null;
      target_group_id: string | null;
      email_enabled: boolean;
      quiet_hours_start?: number;
      quiet_hours_end?: number;
      max_emails_per_day?: number;
      timezone?: string | null;
    } = {
      user_id: userId,
      name: data.name,
      target_kind: data.target_kind,
      target_source_id: data.target_kind === "source" ? data.target_source_id : null,
      target_group_id: data.target_kind === "group" ? data.target_group_id : null,
      email_enabled: data.email_enabled ?? false,
    };
    if (data.quiet_hours_start !== undefined) insertRow.quiet_hours_start = data.quiet_hours_start;
    if (data.quiet_hours_end !== undefined) insertRow.quiet_hours_end = data.quiet_hours_end;
    if (data.max_emails_per_day !== undefined) insertRow.max_emails_per_day = data.max_emails_per_day;
    if (data.timezone !== undefined) insertRow.timezone = data.timezone || null;

    const { data: created, error } = await supabase
      .from("user_watchlists")
      .insert(insertRow)
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "create_failed");

    if (data.topics && data.topics.length > 0) {
      const rows = Array.from(new Set(data.topics.map((t) => t.trim()).filter(Boolean))).map(
        (topic) => ({ watchlist_id: created.id as string, topic }),
      );
      if (rows.length > 0) {
        const { error: tErr } = await supabase.from("user_watchlist_topics").insert(rows);
        if (tErr) throw new Error(tErr.message);
      }
    }
    return { id: created.id as string };
  });

const UpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  email_enabled: z.boolean().optional(),
  quiet_hours_start: z.number().int().min(0).max(23).optional(),
  quiet_hours_end: z.number().int().min(0).max(23).optional(),
  max_emails_per_day: z.number().int().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
  timezone: z.string().trim().max(64).nullable().optional(),
});

export const updateWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { error } = await context.supabase
      .from("user_watchlists")
      .update(rest)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_watchlists")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWatchlists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: wls, error } = await context.supabase
      .from("user_watchlists")
      .select(
        "id, name, target_kind, target_source_id, target_group_id, email_enabled, quiet_hours_start, quiet_hours_end, max_emails_per_day, is_active, muted_until, timezone, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (wls ?? []).map((w) => w.id as string);
    const topicMap = new Map<string, string[]>();
    if (ids.length > 0) {
      const { data: topics } = await context.supabase
        .from("user_watchlist_topics")
        .select("watchlist_id, topic, is_active")
        .in("watchlist_id", ids);
      for (const t of topics ?? []) {
        const wid = t.watchlist_id as string;
        if (!topicMap.has(wid)) topicMap.set(wid, []);
        if (t.is_active) topicMap.get(wid)!.push(t.topic as string);
      }
    }
    return (wls ?? []).map((w) => ({ ...w, topics: topicMap.get(w.id as string) ?? [] }));
  });

const SetTopicsSchema = z.object({
  watchlist_id: z.string().uuid(),
  topics: z.array(z.string().trim().min(2).max(80)).max(20),
});

export const setWatchlistTopics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SetTopicsSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Replace strategy: delete existing then insert. RLS gates both.
    const { error: dErr } = await context.supabase
      .from("user_watchlist_topics")
      .delete()
      .eq("watchlist_id", data.watchlist_id);
    if (dErr) throw new Error(dErr.message);
    const cleaned = Array.from(
      new Set(data.topics.map((t) => t.trim()).filter(Boolean)),
    );
    if (cleaned.length > 0) {
      const { error: iErr } = await context.supabase
        .from("user_watchlist_topics")
        .insert(cleaned.map((topic) => ({ watchlist_id: data.watchlist_id, topic })));
      if (iErr) throw new Error(iErr.message);
    }
    return { ok: true, count: cleaned.length };
  });

const MuteSchema = z.object({
  id: z.string().uuid(),
  hours: z.number().int().min(0).max(168), // 0 = unmute
});

export const muteWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => MuteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const muted_until =
      data.hours === 0
        ? null
        : new Date(Date.now() + data.hours * 3600 * 1000).toISOString();
    const { error } = await context.supabase
      .from("user_watchlists")
      .update({ muted_until })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, muted_until };
  });

const ListMatchesSchema = z.object({
  limit: z.number().int().min(1).max(200).optional().default(50),
  watchlist_id: z.string().uuid().optional(),
  include_dismissed: z.boolean().optional().default(false),
  // Composite cursor "<classified_at_iso>|<id>" to page beyond the limit.
  cursor: z.string().optional(),
});

export const listMyMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListMatchesSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    // RLS limits to matches whose watchlist belongs to the user.
    let q = context.supabase
      .from("user_watchlist_matches")
      .select(
        "id, watchlist_id, tweet_id, matched_topic, match_reason, classified_at, dismissed_at, delivered_via",
      )
      .order("classified_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(data.limit);
    if (data.watchlist_id) q = q.eq("watchlist_id", data.watchlist_id);
    if (!data.include_dismissed) q = q.is("dismissed_at", null);
    if (data.cursor) {
      const [cAt, cId] = data.cursor.split("|");
      if (cAt && cId) {
        q = q.or(
          `and(classified_at.lt.${cAt}),and(classified_at.eq.${cAt},id.lt.${cId})`,
        );
      }
    }
    const { data: matches, error } = await q;
    if (error) throw new Error(error.message);
    const tweetIds = Array.from(new Set((matches ?? []).map((m) => m.tweet_id as string)));
    let tweetMap = new Map<string, unknown>();
    if (tweetIds.length > 0) {
      const { data: tweets } = await context.supabase
        .from("tweets")
        .select(
          "id, text, author_handle, author_display_name, created_at, like_count, retweet_count, reply_count",
        )
        .in("id", tweetIds);
      tweetMap = new Map((tweets ?? []).map((t) => [t.id as string, t]));
    }
    return (matches ?? []).map((m) => ({
      ...m,
      tweet: tweetMap.get(m.tweet_id as string) ?? null,
    }));
  });

export const dismissMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_watchlist_matches")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const dismissAllMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ watchlist_id: z.string().uuid().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("user_watchlist_matches")
      .update({ dismissed_at: new Date().toISOString() })
      .is("dismissed_at", null);
    if (data.watchlist_id) q = q.eq("watchlist_id", data.watchlist_id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getUnreadMatchCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("user_watchlist_matches")
      .select("id", { count: "exact", head: true })
      .is("dismissed_at", null);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const getMyLlmQuotaToday = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await context.supabase
      .from("user_llm_quota")
      .select("classifications")
      .eq("user_id", context.userId)
      .eq("day", today)
      .maybeSingle();
    return { used: (data?.classifications as number | undefined) ?? 0, cap: 500 };
  });
const TargetLookupSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("source"), id: z.string().min(1).max(64) }),
  z.object({ kind: z.literal("group"), id: z.string().uuid() }),
]);

/**
 * Returns the current user's watchlist for the given source/group, or null
 * if none exists. Used by Spotlight + group "Set up alerts" CTAs to flip
 * between create and edit mode.
 */
export const getMyWatchlistForTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TargetLookupSchema.parse(data))
  .handler(async ({ data, context }) => {
    const col = data.kind === "source" ? "target_source_id" : "target_group_id";
    const { data: row } = await context.supabase
      .from("user_watchlists")
      .select(
        "id, name, target_kind, target_source_id, target_group_id, email_enabled, quiet_hours_start, quiet_hours_end, max_emails_per_day, is_active, muted_until, timezone",
      )
      .eq(col, data.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) return null;
    const { data: topics } = await context.supabase
      .from("user_watchlist_topics")
      .select("topic, is_active")
      .eq("watchlist_id", row.id as string);
    return {
      ...row,
      topics: (topics ?? []).filter((t) => t.is_active).map((t) => t.topic as string),
    };
  });
