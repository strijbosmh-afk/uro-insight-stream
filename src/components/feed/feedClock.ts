// Anchored "now" for the live feed.
//
// Two modes:
//   - mock backend: virtual clock anchored to latest mock-tweet timestamp.
//     Mock tweets are dated 2026-03-20 → 2026-03-25; wall-clock would hide
//     them all. The clock advances on each poll so the stream feels alive.
//   - api backend (default): wall-clock time. Real ingestion writes tweets
//     with real timestamps; no virtual time is needed and the old behaviour
//     hid newly-ingested tweets for hours.
//
// Audit fix H2: previous version anchored once and never re-anchored, so
// real tweets posted in the 6h before the first poll were invisible until
// the virtual clock caught up.

import { feedBackend } from "@/services/feedService";

const useVirtualClock = feedBackend === "mock";

let anchorMs: number | null = null;
let lastAdvanceMs: number = Date.now();

/** Initialise / refresh the anchor based on the most recent tweet timestamp. */
export function initFeedClock(latestIso: string | undefined) {
  if (!useVirtualClock) return;
  if (anchorMs !== null) return;
  const baseMs = latestIso ? new Date(latestIso).getTime() : Date.now();
  // Start the clock 6h before the latest tweet so plenty of "live" stream is
  // visible immediately and ~18h of "future" tweets remain to drip in.
  anchorMs = baseMs - 6 * 60 * 60 * 1000;
  lastAdvanceMs = Date.now();
}

/** Advance the clock proportionally to wall-clock time elapsed × multiplier. */
export function advanceFeedClock(multiplier = 60) {
  if (!useVirtualClock) return;
  if (anchorMs === null) return;
  const wallNow = Date.now();
  const delta = wallNow - lastAdvanceMs;
  anchorMs += delta * multiplier;
  lastAdvanceMs = wallNow;
}

export function feedNowIso(): string {
  if (!useVirtualClock) return new Date().toISOString();
  return new Date(anchorMs ?? Date.now()).toISOString();
}

export function feedNowMs(): number {
  if (!useVirtualClock) return Date.now();
  return anchorMs ?? Date.now();
}
