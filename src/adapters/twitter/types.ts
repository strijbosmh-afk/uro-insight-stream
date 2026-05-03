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
  /** 'original' | 'reply' | 'quote'. Pure retweets are filtered out by the adapter. */
  tweetType: "original" | "reply" | "quote";
  /** External (X) id of the referenced tweet, if any. */
  parentTweetExternalId?: string;
  /** Snapshot of parent author's handle at ingest time, when known. */
  parentHandle?: string;
  /** Snapshot of parent text (<= 280 chars) at ingest time, when known. */
  parentText?: string;
  raw?: unknown;
};

export interface TwitterAdapter {
  name: string;
  searchByHandle(handle: string, sinceISO: string): Promise<NormalizedTweet[]>;
  searchByHashtag(tag: string, sinceISO: string): Promise<NormalizedTweet[]>;
}
