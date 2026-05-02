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

export type TweetFilter = {
  sessionId?: string;
  abstractId?: string;
  sourceIds?: string[];
  hashtags?: string[];
  since?: string;
  until?: string;
  limit?: number;
};

export interface FeedService {
  // Sources
  listSources(): Promise<Source[]>;
  addSource(input: Omit<Source, "id">): Promise<Source>;
  updateSource(id: string, patch: Partial<Source>): Promise<Source>;
  removeSource(id: string): Promise<void>;
  testSource(id: string): Promise<Tweet[]>;

  // Source lists
  listSourceLists(): Promise<SourceList[]>;
  addSourceList(input: Omit<SourceList, "id">): Promise<SourceList>;
  updateSourceList(id: string, patch: Partial<SourceList>): Promise<SourceList>;
  removeSourceList(id: string): Promise<void>;

  // Hashtags
  listHashtags(): Promise<Hashtag[]>;
  addHashtag(input: Omit<Hashtag, "id">): Promise<Hashtag>;
  updateHashtag(id: string, patch: Partial<Hashtag>): Promise<Hashtag>;
  removeHashtag(id: string): Promise<void>;
  countHashtagTweets(tag: string, sinceMs: number): Promise<number>;

  // Congresses & sessions
  listCongresses(): Promise<Congress[]>;
  getCongress(id: string): Promise<Congress>;
  addCongress(input: Omit<Congress, "id">): Promise<Congress>;
  updateCongress(id: string, patch: Partial<Congress>): Promise<Congress>;
  removeCongress(id: string): Promise<void>;
  /** Returns hourly tweet counts for the congress for the last `hours` hours. */
  congressActivity(id: string, hours: number): Promise<number[]>;
  countCongressTweets(id: string): Promise<number>;
  listSessions(congressId: string): Promise<Session[]>;
  getSession(id: string): Promise<Session>;
  listAbstracts(sessionId: string): Promise<Abstract[]>;
  getAbstract(id: string): Promise<Abstract>;

  // Tweets & summaries
  listTweets(filter: TweetFilter): Promise<Tweet[]>;
  getSummary(
    targetType: Summary["targetType"],
    targetId: string,
  ): Promise<Summary | null>;
  /** Returns every summary in the store (across sessions/abstracts/congresses). */
  listSummaries(): Promise<Summary[]>;
  /** Persist a (re)generated summary for a target. */
  saveSummary(
    targetType: Summary["targetType"],
    targetId: string,
    summary: Summary,
  ): Promise<Summary>;
}

import { mockFeedService } from "./mockFeedService";
import { apiFeedService } from "./apiFeedService";

// Two modes:
//   - "mock": in-memory only, used by tests / local development.
//   - "api":  fully Supabase. Default for production.
// The env var selects pure mock when needed.
export type FeedBackend = "mock" | "api";
const envBackend = import.meta.env.VITE_FEED_BACKEND as FeedBackend | undefined;
export const feedBackend: FeedBackend = envBackend === "mock" ? "mock" : "api";

export const feedService: FeedService =
  feedBackend === "mock" ? mockFeedService : apiFeedService;

export { mockFeedService, apiFeedService };