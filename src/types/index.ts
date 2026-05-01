// Core domain types for UroFeed

export type Source = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  role: "KOL" | "institution" | "journal" | "society" | "other";
  specialty: string[];
  verified: boolean;
  active: boolean;
  listIds?: string[];
  lastSeenAt?: string;
  tweetCount?: number;
};

export type SourceList = {
  id: string;
  name: string;
  description?: string;
  color?: string;
};

export type Hashtag = {
  id: string;
  tag: string;
  congressId?: string;
  active: boolean;
};

export type Congress = {
  id: string;
  name: string;
  shortCode: string;
  city: string;
  country: string;
  startDate: string;
  endDate: string;
  status: "upcoming" | "live" | "archived";
  primaryHashtags: string[];
  /** Optional override: if set, only these source lists are scoped to this congress. */
  sourceListIds?: string[];
};

export type Session = {
  id: string;
  congressId: string;
  title: string;
  track: string;
  room: string;
  startTime: string;
  endTime: string;
  chairs: string[];
  abstractIds: string[];
};

export type Abstract = {
  id: string;
  sessionId: string;
  title: string;
  authors: string[];
  institution: string;
  abstractNumber: string;
};

export type Tweet = {
  id: string;
  sourceId: string;
  text: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  mediaUrls: string[];
  hashtags: string[];
  sessionId?: string;
  abstractId?: string;
  lang: string;
};

export type Summary = {
  id: string;
  targetType: "session" | "abstract" | "congress";
  targetId: string;
  bulletPoints: string[];
  keyQuotes: { quote: string; sourceId: string; tweetId: string }[];
  sentiment: "positive" | "mixed" | "critical" | "neutral";
  controversies: string[];
  takeaways: string[];
  tweetCount: number;
  generatedAt: string;
  modelUsed: string;
};