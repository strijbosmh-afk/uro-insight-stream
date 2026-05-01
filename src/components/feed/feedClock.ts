// Anchored "now" for the live feed.
//
// Mock tweets are dated 2026-03-20 → 2026-03-25, so wall-clock time is useless
// for "last hour" / "trending now" calculations. We anchor a virtual clock to
// the latest tweet timestamp + a tiny offset, and advance it on each poll so
// the stream feels alive (a slice of "future" tweets becomes visible on each
// refetch).

let anchorMs: number | null = null;
let lastAdvanceMs: number = Date.now();

/** Initialise / refresh the anchor based on the most recent tweet timestamp. */
export function initFeedClock(latestIso: string | undefined) {
  if (anchorMs !== null) return;
  const baseMs = latestIso ? new Date(latestIso).getTime() : Date.now();
  // Start the clock 6h before the latest tweet so plenty of "live" stream is
  // visible immediately and ~18h of "future" tweets remain to drip in.
  anchorMs = baseMs - 6 * 60 * 60 * 1000;
  lastAdvanceMs = Date.now();
}

/** Advance the clock proportionally to wall-clock time elapsed × multiplier. */
export function advanceFeedClock(multiplier = 60) {
  if (anchorMs === null) return;
  const wallNow = Date.now();
  const delta = wallNow - lastAdvanceMs;
  anchorMs += delta * multiplier;
  lastAdvanceMs = wallNow;
}

export function feedNowIso(): string {
  return new Date(anchorMs ?? Date.now()).toISOString();
}

export function feedNowMs(): number {
  return anchorMs ?? Date.now();
}