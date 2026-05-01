import {
  mockSources,
  mockHashtags,
  mockCongresses,
  mockSessions,
  mockTweets,
  mockSummaries,
  mockAbstracts,
} from "@/data/mock";
import type {
  Source,
  Hashtag,
  Congress,
  Session,
  Tweet,
  Summary,
  SourceList,
  Abstract,
} from "@/types";
import type { FeedService, TweetFilter } from "./feedService";

// In-memory mutable copies so admin CRUD survives within the session.
// Seed last-seen + tweet count from mock tweets so the table has signal.
const tweets: Tweet[] = [...mockTweets];
const seedSourceMeta = (s: Source): Source => {
  const own = tweets.filter((t) => t.sourceId === s.id);
  const last = own.reduce(
    (acc, t) => (acc && acc > t.createdAt ? acc : t.createdAt),
    "" as string,
  );
  return {
    ...s,
    listIds: s.listIds ?? [],
    tweetCount: own.length,
    lastSeenAt: last || undefined,
  };
};
const sources: Source[] = mockSources.map(seedSourceMeta);
const hashtags: Hashtag[] = [...mockHashtags];
const congresses: Congress[] = [...mockCongresses];
const sessions: Session[] = [...mockSessions];
const abstracts: Abstract[] = [...mockAbstracts];
const summaries: Summary[] = [...mockSummaries];

const sourceLists: SourceList[] = [
  { id: "list_eau", name: "EAU Faculty", color: "#22D3EE" },
  { id: "list_robotic", name: "Robotic Surgery", color: "#A78BFA" },
  { id: "list_prostate", name: "Prostate Cancer KOLs", color: "#F472B6" },
];
// Seed each source with at most one demo list assignment so chips render.
sources.forEach((s, i) => {
  if (!s.listIds || s.listIds.length === 0) {
    s.listIds = [sourceLists[i % sourceLists.length].id];
  }
});

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
    const next: Source = {
      ...input,
      id: id("src"),
      listIds: input.listIds ?? [],
      tweetCount: 0,
    };
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

  async testSource(idArg) {
    await sleep();
    const own = tweets
      .filter((t) => t.sourceId === idArg)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 5);
    return own;
  },

  // ---------- Source lists ----------
  async listSourceLists() {
    await sleep();
    return [...sourceLists];
  },
  async addSourceList(input) {
    await sleep();
    const next: SourceList = { ...input, id: id("list") };
    sourceLists.push(next);
    return next;
  },
  async updateSourceList(idArg, patch) {
    await sleep();
    const i = sourceLists.findIndex((l) => l.id === idArg);
    if (i < 0) throw new Error(`List not found: ${idArg}`);
    sourceLists[i] = { ...sourceLists[i], ...patch, id: sourceLists[i].id };
    return sourceLists[i];
  },
  async removeSourceList(idArg) {
    await sleep();
    const i = sourceLists.findIndex((l) => l.id === idArg);
    if (i >= 0) sourceLists.splice(i, 1);
    // Also remove from any source that referenced it.
    sources.forEach((s) => {
      if (s.listIds?.includes(idArg)) {
        s.listIds = s.listIds.filter((x) => x !== idArg);
      }
    });
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

  async countHashtagTweets(tag, sinceMs) {
    await sleep();
    const cutoff = new Date(Date.now() - sinceMs).toISOString();
    const norm = tag.replace(/^#/, "").toLowerCase();
    return tweets.filter(
      (t) =>
        t.createdAt >= cutoff &&
        t.hashtags.some((h) => h.replace(/^#/, "").toLowerCase() === norm),
    ).length;
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
  async addCongress(input) {
    await sleep();
    const next: Congress = { ...input, id: id("cong") };
    congresses.push(next);
    return next;
  },
  async updateCongress(idArg, patch) {
    await sleep();
    const i = congresses.findIndex((c) => c.id === idArg);
    if (i < 0) throw new Error(`Congress not found: ${idArg}`);
    congresses[i] = { ...congresses[i], ...patch, id: congresses[i].id };
    return congresses[i];
  },
  async removeCongress(idArg) {
    await sleep();
    const i = congresses.findIndex((c) => c.id === idArg);
    if (i >= 0) congresses.splice(i, 1);
    // detach hashtags linked to this congress
    hashtags.forEach((h) => {
      if (h.congressId === idArg) h.congressId = undefined;
    });
  },
  async congressActivity(idArg, hours) {
    await sleep();
    const c = congresses.find((x) => x.id === idArg);
    if (!c) return new Array(hours).fill(0);
    const tagSet = new Set(
      c.primaryHashtags.map((t) => t.replace(/^#/, "").toLowerCase()),
    );
    const sessIds = new Set(
      sessions.filter((s) => s.congressId === idArg).map((s) => s.id),
    );
    const buckets = new Array(hours).fill(0) as number[];
    const now = Date.now();
    tweets.forEach((t) => {
      const matches =
        (t.sessionId && sessIds.has(t.sessionId)) ||
        t.hashtags.some((h) => tagSet.has(h.replace(/^#/, "").toLowerCase()));
      if (!matches) return;
      const ageH = Math.floor((now - new Date(t.createdAt).getTime()) / 3_600_000);
      if (ageH >= 0 && ageH < hours) buckets[hours - 1 - ageH] += 1;
    });
    return buckets;
  },
  async countCongressTweets(idArg) {
    await sleep();
    const c = congresses.find((x) => x.id === idArg);
    if (!c) return 0;
    const tagSet = new Set(
      c.primaryHashtags.map((t) => t.replace(/^#/, "").toLowerCase()),
    );
    const sessIds = new Set(
      sessions.filter((s) => s.congressId === idArg).map((s) => s.id),
    );
    return tweets.filter(
      (t) =>
        (t.sessionId && sessIds.has(t.sessionId)) ||
        t.hashtags.some((h) => tagSet.has(h.replace(/^#/, "").toLowerCase())),
    ).length;
  },
  async getSession(idArg) {
    await sleep();
    const s = sessions.find((x) => x.id === idArg);
    if (!s) throw new Error(`Session not found: ${idArg}`);
    return s;
  },

  async listAbstracts(sessionId) {
    await sleep();
    return abstracts.filter((a) => a.sessionId === sessionId);
  },
  async getAbstract(idArg) {
    await sleep();
    const a = abstracts.find((x) => x.id === idArg);
    if (!a) throw new Error(`Abstract not found: ${idArg}`);
    return a;
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

  async saveSummary(targetType, targetId, summary) {
    await sleep();
    const i = summaries.findIndex(
      (s) => s.targetType === targetType && s.targetId === targetId,
    );
    if (i >= 0) summaries[i] = summary;
    else summaries.push(summary);
    return summary;
  },
};