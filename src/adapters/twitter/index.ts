import type { TwitterAdapter } from "./types";
import { createXApiV2Adapter } from "./xApiV2";
import { createMockAdapter } from "./mock";

export type AdapterName = "x_api_v2" | "mock" | "socialdata" | "twitterapi_io";

export function getAdapter(name: string): TwitterAdapter {
  switch (name) {
    case "x_api_v2": {
      const token = process.env.X_BEARER_TOKEN;
      if (!token) throw new Error("X_BEARER_TOKEN is not configured");
      return createXApiV2Adapter(token);
    }
    case "mock":
      return createMockAdapter();
    default:
      // Stubbed: future adapters fall back to mock until implemented.
      return createMockAdapter();
  }
}

export type { TwitterAdapter, NormalizedTweet } from "./types";
