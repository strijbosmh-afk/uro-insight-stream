import type { TwitterAdapter, NormalizedTweet } from "./types";

function makeTweet(handle: string, tag: string | null, i: number): NormalizedTweet {
  const id = `mock_${handle}_${tag ?? "x"}_${Date.now()}_${i}`;
  const text = tag
    ? `Mock tweet about #${tag.replace(/^#/, "")} from @${handle} (${i})`
    : `Mock tweet from @${handle} (${i})`;
  return {
    id,
    sourceId: handle.replace(/^@/, "").toLowerCase(),
    authorHandle: handle.replace(/^@/, ""),
    authorDisplayName: handle.replace(/^@/, ""),
    text,
    lang: "en",
    createdAt: new Date(Date.now() - i * 60_000).toISOString(),
    likeCount: Math.floor(Math.random() * 50),
    retweetCount: Math.floor(Math.random() * 10),
    replyCount: Math.floor(Math.random() * 5),
    mediaUrls: [],
    hashtags: tag ? [tag.replace(/^#/, "").toLowerCase()] : [],
  };
}

export function createMockAdapter(): TwitterAdapter {
  return {
    name: "mock",
    async searchByHandle(handle) {
      return Array.from({ length: 3 }, (_, i) => makeTweet(handle, null, i));
    },
    async searchByHashtag(tag) {
      return Array.from({ length: 5 }, (_, i) => makeTweet("mock_user", tag, i));
    },
  };
}
