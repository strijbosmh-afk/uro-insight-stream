import {
  mockSources,
  mockHashtags,
  mockCongresses,
  mockSessions,
  mockTweets,
  mockSummaries,
} from "@/data/mock";
import type {
  Source,
  Hashtag,
  Congress,
  Session,
  Tweet,
  Summary,
} from "@/types";
import type { FeedService, TweetFilter } from "./feedService";

// In-memory mutable copies so admin CRUD survives within the session.
const sources: Source[] = [...mockSources];
const hashtags: Hashtag[] = [...mockHashtags];
const congresses: Congress[] = [...mockCongresses];
const sessions: Session[] = [...mockSessions];
const tweets: Tweet[] = [...mockTweets];
const summaries: Summary[] = [...mockSummaries];

const sleep = () =>
  new Promise<void>((res) =>
    setTimeout(res, 150 + Math.floor(Math.random() * 250)),
  );

const id = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const mockFeedService: FeedService = {
  // ---------- Sources ----------
  async listSources() {
    await sleep();
    return [...sources];
  },
  async addSource(input) {
    await sleep();
    const next: Source = { ...input, id: id("src") };
    sources.push(next);
    return next;
  },
  async updateSource(idArg, patch) {
    await sleep();
    const i = sources.findIndex((s) => s.id === idArg);
    if (i < 0) throw new Error(`Source not found: ${idArg}`);
    sources[i] = { ...sources[i], ...patch, id: sources[i].id };
    return sources[i];
  },
  async removeSource(idArg) {
    await sleep();
    const i = sources.findIndex((s) => s.id === idArg);
    if (i >= 0) sources.splice(i, 1);
  },

  // ---------- Hashtags ----------
  async listHashtags() {
    await sleep();
    return [...hashtags];
  },
  async addHashtag(input) {
    await sleep();
    const next: Hashtag = { ...input, id: id("hash") };
    hashtags.push(next);
    return next;
  },
  async updateHashtag(idArg, patch) {
    await sleep();
    const i = hashtags.findIndex((h) => h.id === idArg);
    if (i < 0) throw new Error(`Hashtag not found: ${idArg}`);
    hashtags[i] = { ...hashtags[i], ...patch, id: hashtags[i].id };
    return hashtags[i];
  },
  async removeHashtag(idArg) {
    await sleep();
    const i = hashtags.findIndex((h) => h.id === idArg);
    if (i >= 0) hashtags.splice(i, 1);
  },

  // ---------- Congresses & Sessions ----------
  async listCongresses() {
    await sleep();
    return [...congresses];
  },
  async getCongress(idArg) {
    await sleep();
    const c = congresses.find((x) => x.id === idArg);
    if (!c) throw new Error(`Congress not found: ${idArg}`);
    return c;
  },
  async listSessions(congressId) {
    await sleep();
    return sessions.filter((s) => s.congressId === congressId);
  },
  async getSession(idArg) {
    await sleep();
    const s = sessions.find((x) => x.id === idArg);
    if (!s) throw new Error(`Session not found: ${idArg}`);
    return s;
  },

  // ---------- Tweets ----------
  async listTweets(filter: TweetFilter) {
    await sleep();
    let out = tweets;
    if (filter.sessionId) out = out.filter((t) => t.sessionId === filter.sessionId);
    if (filter.abstractId) out = out.filter((t) => t.abstractId === filter.abstractId);
    if (filter.sourceIds?.length) {
      const set = new Set(filter.sourceIds);
      out = out.filter((t) => set.has(t.sourceId));
    }
    if (filter.hashtags?.length) {
      const want = new Set(filter.hashtags.map((h) => h.toLowerCase()));
      out = out.filter((t) =>
        t.hashtags.some((h) => want.has(h.toLowerCase())),
      );
    }
    if (filter.since) {
      const since = filter.since;
      out = out.filter((t) => t.createdAt >= since);
    }
    if (filter.until) {
      const until = filter.until;
      out = out.filter((t) => t.createdAt <= until);
    }
    out = [...out].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (filter.limit) out = out.slice(0, filter.limit);
    return out;
  },

  // ---------- Summaries ----------
  async getSummary(targetType, targetId) {
    await sleep();
    return (
      summaries.find(
        (s) => s.targetType === targetType && s.targetId === targetId,
      ) ?? null
    );
  },
};