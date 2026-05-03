// Real Supabase-backed FeedService implementation.
//
// Every method queries Supabase. There are no mock fallbacks. The mock
// service still exists for tests (selected via VITE_FEED_BACKEND=mock).

import type { FeedService, TweetFilter } from "./feedService";
import type {
  Source,
  Hashtag,
  Tweet,
  Congress,
  Session,
  Abstract,
  Summary,
} from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { mockFeedService } from "./mockFeedService";

const id = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- Row mappers ----------

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
  tweet_type?: string | null;
  parent_tweet_external_id?: string | null;
  parent_handle?: string | null;
  parent_text?: string | null;
  parent_in_db_id?: string | null;
}): Tweet {
  return {
    id: r.id,
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
    tweetType: (r.tweet_type as Tweet["tweetType"]) ?? "original",
    parentTweetExternalId: r.parent_tweet_external_id ?? undefined,
    parentHandle: r.parent_handle ?? undefined,
    parentText: r.parent_text ?? undefined,
    parentInDbId: r.parent_in_db_id ?? undefined,
  };
}

function rowToCongress(r: {
  id: string;
  name: string;
  short_code: string;
  city: string | null;
  country: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  primary_hashtags: string[];
}): Congress {
  return {
    id: r.id,
    name: r.name,
    shortCode: r.short_code,
    city: r.city ?? "",
    country: r.country ?? "",
    startDate: r.start_date ?? "",
    endDate: r.end_date ?? "",
    status: r.status as Congress["status"],
    primaryHashtags: r.primary_hashtags,
  };
}
function congressToRow(c: Partial<Congress> & { id?: string }) {
  return {
    ...(c.id ? { id: c.id } : {}),
    ...(c.name !== undefined ? { name: c.name } : {}),
    ...(c.shortCode !== undefined ? { short_code: c.shortCode } : {}),
    ...(c.city !== undefined ? { city: c.city } : {}),
    ...(c.country !== undefined ? { country: c.country } : {}),
    ...(c.startDate !== undefined ? { start_date: c.startDate || null } : {}),
    ...(c.endDate !== undefined ? { end_date: c.endDate || null } : {}),
    ...(c.status !== undefined ? { status: c.status } : {}),
    ...(c.primaryHashtags !== undefined
      ? { primary_hashtags: c.primaryHashtags }
      : {}),
  };
}

function rowToSession(r: {
  id: string;
  congress_id: string;
  title: string;
  track: string;
  room: string;
  start_time: string;
  end_time: string;
  chairs: string[];
  abstract_ids: string[];
}): Session {
  return {
    id: r.id,
    congressId: r.congress_id,
    title: r.title,
    track: r.track,
    room: r.room,
    startTime: r.start_time,
    endTime: r.end_time,
    chairs: r.chairs,
    abstractIds: r.abstract_ids,
  };
}

function rowToAbstract(r: {
  id: string;
  session_id: string;
  title: string;
  authors: string[];
  institution: string;
  abstract_number: string;
}): Abstract {
  return {
    id: r.id,
    sessionId: r.session_id,
    title: r.title,
    authors: r.authors,
    institution: r.institution,
    abstractNumber: r.abstract_number,
  };
}

function rowToSummary(r: {
  id: string;
  target_type: string;
  target_id: string;
  bullet_points: string[];
  key_quotes: unknown;
  sentiment: string;
  controversies: string[];
  takeaways: string[];
  tweet_count: number;
  generated_at: string;
  model_used: string;
}): Summary {
  return {
    id: r.id,
    targetType: r.target_type as Summary["targetType"],
    targetId: r.target_id,
    bulletPoints: r.bullet_points,
    keyQuotes: (r.key_quotes as Summary["keyQuotes"]) ?? [],
    sentiment: r.sentiment as Summary["sentiment"],
    controversies: r.controversies,
    takeaways: r.takeaways,
    tweetCount: r.tweet_count,
    generatedAt: r.generated_at,
    modelUsed: r.model_used,
  };
}

export const apiFeedService: FeedService = {
  // ---------- Sources ----------
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
    const { data, error } = await supabase
      .from("tweets")
      .select("*")
      .eq("source_id", idArg)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToTweet);
  },

  // ---------- Source lists (still mock — no schema yet) ----------
  listSourceLists: () => mockFeedService.listSourceLists(),
  addSourceList: (i) => mockFeedService.addSourceList(i),
  updateSourceList: (i, p) => mockFeedService.updateSourceList(i, p),
  removeSourceList: (i) => mockFeedService.removeSourceList(i),

  // ---------- Hashtags ----------
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

  // ---------- Congresses ----------
  async listCongresses() {
    const { data, error } = await supabase
      .from("congresses")
      .select("*")
      .order("start_date", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToCongress);
  },
  async getCongress(idArg) {
    const { data, error } = await supabase
      .from("congresses")
      .select("*")
      .eq("id", idArg)
      .single();
    if (error) throw new Error(error.message);
    return rowToCongress(data);
  },
  async addCongress(input) {
    const row = { ...congressToRow(input as Congress), id: id("cong") } as never;
    const { data, error } = await supabase
      .from("congresses")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToCongress(data);
  },
  async updateCongress(idArg, patch) {
    const { data, error } = await supabase
      .from("congresses")
      .update(congressToRow(patch) as never)
      .eq("id", idArg)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToCongress(data);
  },
  async removeCongress(idArg) {
    const { error } = await supabase.from("congresses").delete().eq("id", idArg);
    if (error) throw new Error(error.message);
  },
  async congressActivity(idArg, hours) {
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();
    const c = await this.getCongress(idArg);
    const tags = (c.primaryHashtags ?? []).map((t) => t.replace(/^#/, ""));
    const { data: sessRows } = await supabase
      .from("sessions")
      .select("id")
      .eq("congress_id", idArg);
    const sessIds = (sessRows ?? []).map((r) => r.id);

    // Pull tweets matching either a session in this congress or one of its hashtags
    let tweetRows: Array<{ created_at: string }> = [];
    if (sessIds.length > 0) {
      const { data } = await supabase
        .from("tweets")
        .select("created_at")
        .gte("created_at", since)
        .in("session_id", sessIds);
      tweetRows = data ?? [];
    }
    if (tags.length > 0) {
      const { data } = await supabase
        .from("tweets")
        .select("created_at")
        .gte("created_at", since)
        .overlaps("hashtags", tags);
      tweetRows = tweetRows.concat(data ?? []);
    }

    const buckets = new Array(hours).fill(0) as number[];
    const now = Date.now();
    for (const t of tweetRows) {
      const ageH = Math.floor((now - new Date(t.created_at).getTime()) / 3_600_000);
      if (ageH >= 0 && ageH < hours) buckets[hours - 1 - ageH] += 1;
    }
    return buckets;
  },
  async countCongressTweets(idArg) {
    const c = await this.getCongress(idArg);
    const tags = (c.primaryHashtags ?? []).map((t) => t.replace(/^#/, ""));
    const { data: sessRows } = await supabase
      .from("sessions")
      .select("id")
      .eq("congress_id", idArg);
    const sessIds = (sessRows ?? []).map((r) => r.id);
    const ids = new Set<string>();
    if (sessIds.length > 0) {
      const { data } = await supabase
        .from("tweets")
        .select("id")
        .in("session_id", sessIds);
      (data ?? []).forEach((r) => ids.add(r.id));
    }
    if (tags.length > 0) {
      const { data } = await supabase
        .from("tweets")
        .select("id")
        .overlaps("hashtags", tags);
      (data ?? []).forEach((r) => ids.add(r.id));
    }
    return ids.size;
  },

  // ---------- Sessions ----------
  async listSessions(congressId) {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("congress_id", congressId)
      .order("start_time");
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToSession);
  },
  async getSession(idArg) {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", idArg)
      .single();
    if (error) throw new Error(error.message);
    return rowToSession(data);
  },

  // ---------- Abstracts ----------
  async listAbstracts(sessionId) {
    const { data, error } = await supabase
      .from("abstracts")
      .select("*")
      .eq("session_id", sessionId)
      .order("abstract_number");
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToAbstract);
  },
  async getAbstract(idArg) {
    const { data, error } = await supabase
      .from("abstracts")
      .select("*")
      .eq("id", idArg)
      .single();
    if (error) throw new Error(error.message);
    return rowToAbstract(data);
  },

  // ---------- Tweets ----------
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
    return (data ?? []).map(rowToTweet);
  },

  // ---------- Summaries ----------
  async getSummary(targetType, targetId) {
    const { data, error } = await supabase
      .from("summaries")
      .select("*")
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? rowToSummary(data) : null;
  },
  async listSummaries() {
    const { data, error } = await supabase
      .from("summaries")
      .select("*")
      .order("generated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToSummary);
  },
  async saveSummary(targetType, targetId, summary) {
    const row = {
      id: summary.id,
      target_type: targetType,
      target_id: targetId,
      bullet_points: summary.bulletPoints,
      key_quotes: summary.keyQuotes as never,
      sentiment: summary.sentiment,
      controversies: summary.controversies,
      takeaways: summary.takeaways,
      tweet_count: summary.tweetCount,
      generated_at: summary.generatedAt,
      model_used: summary.modelUsed,
    };
    const { data, error } = await supabase
      .from("summaries")
      .upsert(row as never, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return rowToSummary(data);
  },
};
