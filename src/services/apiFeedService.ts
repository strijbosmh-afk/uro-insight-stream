// Hybrid backend: real Supabase for sources, hashtags, and tweets;
// delegates the rest (congresses, sessions, abstracts, source lists,
// summaries) to the in-memory mock service until those tables are migrated.

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
    sourceId: r.source_id ?? r.author_handle,
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
    const row = { ...sourceToRow(input as Source), id: id("src") };
    const { data, error } = await supabase.from("sources").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    return rowToSource(data);
  },
  async updateSource(idArg, patch) {
    const { data, error } = await supabase
      .from("sources")
      .update(sourceToRow(patch))
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
      .update(row)
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
    let q = supabase.from("tweets").select("*").order("created_at", { ascending: false });
    if (filter.sessionId) q = q.eq("session_id", filter.sessionId);
    if (filter.abstractId) q = q.eq("abstract_id", filter.abstractId);
    if (filter.sourceIds?.length) q = q.in("source_id", filter.sourceIds);
    if (filter.hashtags?.length) {
      q = q.overlaps("hashtags", filter.hashtags.map((h) => h.replace(/^#/, "")));
    }
    if (filter.since) q = q.gte("created_at", filter.since);
    if (filter.until) q = q.lte("created_at", filter.until);
    q = q.limit(filter.limit ?? 200);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map(rowToTweet);
    // Until the live pipeline is producing volume, blend in mock tweets so
    // the UI keeps signal during the transition. New live tweets sort first.
    if (rows.length < 20) {
      const mock = await mockFeedService.listTweets(filter);
      const seen = new Set(rows.map((t) => t.id));
      return [...rows, ...mock.filter((t) => !seen.has(t.id))].slice(0, filter.limit ?? 200);
    }
    return rows;
  },

  // ---------- Summaries (mock store for now) ----------
  getSummary: (t, i) => mockFeedService.getSummary(t, i),
  listSummaries: () => mockFeedService.listSummaries(),
  saveSummary: (t, i, s) => mockFeedService.saveSummary(t, i, s),
};