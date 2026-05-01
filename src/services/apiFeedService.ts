// Hybrid backend.
//
// REAL (Supabase): sources, hashtags, tweets, ingestion_config, ingestion_runs.
// MOCK (delegated to mockFeedService): source lists, congresses, sessions,
// abstracts, summaries.
//
// Real tweets ingested by the X API adapter carry sessionId=null and
// abstractId=null. There is NO classifier yet — never synthesize them.
// Tweets without a sessionId must not appear on session detail pages;
// listTweets({ sessionId }) deliberately falls through to the mock store
// so SessionDetail keeps its mock context, while listTweets() with no
// session/abstract filter returns ONLY real tweets so the Live Feed
// proves the live ingestion pipeline.
//
// TODO(next-turn): migrate the mock-delegated methods to Supabase in this
// order — congresses → sessions → abstracts → summaries. After each
// migration, drop the corresponding mock delegate below and switch the
// matching listTweets branch off the mock fallback.

import type { FeedService, TweetFilter } from "./feedService";
import type { Source, Hashtag, Tweet } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { mockFeedService } from "./mockFeedService";

const id = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function rowToSource(r: {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string;
  role: string;
  specialty: string[];
  verified: boolean;
  active: boolean;
  list_ids: string[];
  last_seen_at: string | null;
  tweet_count: number;
}): Source {
  return {
    id: r.id,
    handle: r.handle,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    role: r.role as Source["role"],
    specialty: r.specialty,
    verified: r.verified,
    active: r.active,
    listIds: r.list_ids,
    lastSeenAt: r.last_seen_at ?? undefined,
    tweetCount: r.tweet_count,
  };
}
function sourceToRow(s: Partial<Source> & { id?: string }) {
  return {
    ...(s.id ? { id: s.id } : {}),
    ...(s.handle !== undefined ? { handle: s.handle } : {}),
    ...(s.displayName !== undefined ? { display_name: s.displayName } : {}),
    ...(s.avatarUrl !== undefined ? { avatar_url: s.avatarUrl } : {}),
    ...(s.role !== undefined ? { role: s.role } : {}),
    ...(s.specialty !== undefined ? { specialty: s.specialty } : {}),
    ...(s.verified !== undefined ? { verified: s.verified } : {}),
    ...(s.active !== undefined ? { active: s.active } : {}),
    ...(s.listIds !== undefined ? { list_ids: s.listIds } : {}),
    ...(s.lastSeenAt !== undefined ? { last_seen_at: s.lastSeenAt } : {}),
    ...(s.tweetCount !== undefined ? { tweet_count: s.tweetCount } : {}),
  };
}

function rowToTweet(r: {
  id: string;
  source_id: string | null;
  text: string;
  created_at: string;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  media_urls: string[];
  hashtags: string[];
  session_id: string | null;
  abstract_id: string | null;
  lang: string | null;
  author_handle: string;
}): Tweet {
  return {
    id: r.id,
    // Real ingested tweets have no source_id link until we match author_handle
    // back to the sources table. Surface the handle so UI can still render
    // an attribution; never invent an id that pretends to match a Source row.
    sourceId: r.source_id ?? `@${r.author_handle.replace(/^@/, "")}`,
    text: r.text,
    createdAt: r.created_at,
    likeCount: r.like_count,
    retweetCount: r.retweet_count,
    replyCount: r.reply_count,
    mediaUrls: r.media_urls,
    hashtags: r.hashtags,
    sessionId: r.session_id ?? undefined,
    abstractId: r.abstract_id ?? undefined,
    lang: r.lang ?? "en",
  };
}

export const apiFeedService: FeedService = {
  // ---------- Sources (Supabase) ----------
  async listSources() {
    const { data, error } = await supabase.from("sources").select("*").order("handle");
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToSource);
  },
  async addSource(input) {
    const row = { ...sourceToRow(input as Source), id: id("src") } as never;
    const { data, error } = await supabase.from("sources").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return rowToSource(data);
  },
  async updateSource(idArg, patch) {
    const { data, error } = await supabase
      .from("sources")
      .update(sourceToRow(patch) as never)
      .eq("id", idArg)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToSource(data);
  },
  async removeSource(idArg) {
    const { error } = await supabase.from("sources").delete().eq("id", idArg);
    if (error) throw new Error(error.message);
  },
  async testSource(idArg) {
    // Show last 5 tweets we already have for this source.
    const { data, error } = await supabase
      .from("tweets")
      .select("*")
      .eq("source_id", idArg)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToTweet);
  },

  // ---------- Source lists (mock for now) ----------
  listSourceLists: () => mockFeedService.listSourceLists(),
  addSourceList: (i) => mockFeedService.addSourceList(i),
  updateSourceList: (i, p) => mockFeedService.updateSourceList(i, p),
  removeSourceList: (i) => mockFeedService.removeSourceList(i),

  // ---------- Hashtags (Supabase) ----------
  async listHashtags(): Promise<Hashtag[]> {
    const { data, error } = await supabase.from("hashtags").select("*").order("tag");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      tag: r.tag,
      congressId: r.congress_id ?? undefined,
      active: r.active,
    }));
  },
  async addHashtag(input) {
    const row = {
      id: id("tag"),
      tag: input.tag,
      congress_id: input.congressId ?? null,
      active: input.active ?? true,
    };
    const { data, error } = await supabase.from("hashtags").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return {
      id: data.id,
      tag: data.tag,
      congressId: data.congress_id ?? undefined,
      active: data.active,
    };
  },
  async updateHashtag(idArg, patch) {
    const row: Record<string, unknown> = {};
    if (patch.tag !== undefined) row.tag = patch.tag;
    if (patch.congressId !== undefined) row.congress_id = patch.congressId;
    if (patch.active !== undefined) row.active = patch.active;
    const { data, error } = await supabase
      .from("hashtags")
      .update(row as never)
      .eq("id", idArg)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: data.id,
      tag: data.tag,
      congressId: data.congress_id ?? undefined,
      active: data.active,
    };
  },
  async removeHashtag(idArg) {
    const { error } = await supabase.from("hashtags").delete().eq("id", idArg);
    if (error) throw new Error(error.message);
  },
  async countHashtagTweets(tag, sinceMs) {
    const sinceISO = new Date(Date.now() - sinceMs).toISOString();
    const norm = tag.replace(/^#/, "");
    const { count, error } = await supabase
      .from("tweets")
      .select("id", { count: "exact", head: true })
      .contains("hashtags", [norm])
      .gte("created_at", sinceISO);
    if (error) return 0;
    return count ?? 0;
  },

  // ---------- Congresses / sessions / abstracts (mock for now) ----------
  listCongresses: () => mockFeedService.listCongresses(),
  getCongress: (i) => mockFeedService.getCongress(i),
  addCongress: (i) => mockFeedService.addCongress(i),
  updateCongress: (i, p) => mockFeedService.updateCongress(i, p),
  removeCongress: (i) => mockFeedService.removeCongress(i),
  congressActivity: (i, h) => mockFeedService.congressActivity(i, h),
  countCongressTweets: (i) => mockFeedService.countCongressTweets(i),
  listSessions: (i) => mockFeedService.listSessions(i),
  getSession: (i) => mockFeedService.getSession(i),
  listAbstracts: (i) => mockFeedService.listAbstracts(i),
  getAbstract: (i) => mockFeedService.getAbstract(i),

  // ---------- Tweets (Supabase, falls back to mock when empty) ----------
  async listTweets(filter: TweetFilter) {
    // Session/abstract filters target MOCK data because real tweets do not
    // carry session_id/abstract_id yet. Delegate fully so SessionDetail and
    // AbstractDetail keep working on the mock dataset until the classifier
    // (and the migrated sessions/abstracts tables) land.
    if (filter.sessionId || filter.abstractId) {
      return mockFeedService.listTweets(filter);
    }

    // Otherwise return ONLY real tweets from Supabase. No mock blend — the
    // Live Feed must visibly prove the ingestion pipeline.
    let q = supabase.from("tweets").select("*").order("created_at", { ascending: false });
    if (filter.sourceIds?.length) q = q.in("source_id", filter.sourceIds);
    if (filter.hashtags?.length) {
      q = q.overlaps("hashtags", filter.hashtags.map((h) => h.replace(/^#/, "")));
    }
    if (filter.since) q = q.gte("created_at", filter.since);
    if (filter.until) q = q.lte("created_at", filter.until);
    q = q.limit(filter.limit ?? 200);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToTweet);
  },

  // ---------- Summaries (mock store for now) ----------
  getSummary: (t, i) => mockFeedService.getSummary(t, i),
  listSummaries: () => mockFeedService.listSummaries(),
  saveSummary: (t, i, s) => mockFeedService.saveSummary(t, i, s),
};