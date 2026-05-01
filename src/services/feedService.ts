import type {
  Source,
  Hashtag,
  Congress,
  Session,
  Tweet,
  Summary,
  SourceList,
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
  listSessions(congressId: string): Promise<Session[]>;
  getSession(id: string): Promise<Session>;

  // Tweets & summaries
  listTweets(filter: TweetFilter): Promise<Tweet[]>;
  getSummary(
    targetType: Summary["targetType"],
    targetId: string,
  ): Promise<Summary | null>;
}

import { mockFeedService } from "./mockFeedService";
import { apiFeedService } from "./apiFeedService";

const backend = (import.meta.env.VITE_FEED_BACKEND ?? "mock") as "mock" | "api";

export const feedService: FeedService =
  backend === "api" ? apiFeedService : mockFeedService;

export { mockFeedService, apiFeedService };