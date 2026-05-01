import type { FeedService } from "./feedService";

// Stub backend — wired up in Step 9 once Lovable Cloud is enabled.
const notImplemented = (method: string): never => {
  throw new Error(`apiFeedService.${method} not implemented`);
};

export const apiFeedService: FeedService = {
  listSources: () => notImplemented("listSources"),
  addSource: () => notImplemented("addSource"),
  updateSource: () => notImplemented("updateSource"),
  removeSource: () => notImplemented("removeSource"),
  testSource: () => notImplemented("testSource"),

  listSourceLists: () => notImplemented("listSourceLists"),
  addSourceList: () => notImplemented("addSourceList"),
  updateSourceList: () => notImplemented("updateSourceList"),
  removeSourceList: () => notImplemented("removeSourceList"),

  listHashtags: () => notImplemented("listHashtags"),
  addHashtag: () => notImplemented("addHashtag"),
  updateHashtag: () => notImplemented("updateHashtag"),
  removeHashtag: () => notImplemented("removeHashtag"),
  countHashtagTweets: () => notImplemented("countHashtagTweets"),

  listCongresses: () => notImplemented("listCongresses"),
  getCongress: () => notImplemented("getCongress"),
  addCongress: () => notImplemented("addCongress"),
  updateCongress: () => notImplemented("updateCongress"),
  removeCongress: () => notImplemented("removeCongress"),
  congressActivity: () => notImplemented("congressActivity"),
  countCongressTweets: () => notImplemented("countCongressTweets"),
  listSessions: () => notImplemented("listSessions"),
  getSession: () => notImplemented("getSession"),
  listAbstracts: () => notImplemented("listAbstracts"),
  getAbstract: () => notImplemented("getAbstract"),

  listTweets: () => notImplemented("listTweets"),
  getSummary: () => notImplemented("getSummary"),
  listSummaries: () => notImplemented("listSummaries"),
  saveSummary: () => notImplemented("saveSummary"),
};