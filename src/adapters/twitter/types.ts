export type NormalizedTweet = {
  id: string;
  sourceId?: string;
  authorHandle: string;
  authorDisplayName?: string;
  text: string;
  lang?: string;
  createdAt: string; // ISO
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  mediaUrls: string[];
  hashtags: string[];
  raw?: unknown;
};

export interface TwitterAdapter {
  name: string;
  searchByHandle(handle: string, sinceISO: string): Promise<NormalizedTweet[]>;
  searchByHashtag(tag: string, sinceISO: string): Promise<NormalizedTweet[]>;
}
