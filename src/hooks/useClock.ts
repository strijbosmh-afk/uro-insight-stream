import * as React from "react";

/**
 * Single shared 1-Hz clock for the whole app.
 *
 * Before: TopBar / StatusBar / AuthStatusBar each ran their own
 * `setInterval(1000)` -> `setNow(new Date())`. Three independent timers
 * meant three React state updates per second every time the shell was
 * mounted, and each invalidation re-rendered the (small but non-trivial)
 * footer/header subtrees.
 *
 * After: one module-level interval drives all consumers via
 * `useSyncExternalStore`. New components subscribing for free.
 *
 * The interval only runs while at least one consumer is subscribed —
 * `subscribe` starts it on first listener, `tearDown` stops it when the
 * last listener unsubscribes.
 */

let intervalId: ReturnType<typeof setInterval> | null = null;
let listeners = new Set<() => void>();
let snapshot: Date = new Date();

function tick() {
  snapshot = new Date();
  for (const l of listeners) l();
}

function startIfNeeded() {
  if (intervalId !== null) return;
  // Align next tick to the wall-clock second so all consumers update
  // in lockstep — avoids "59 -> 00" stutter when a second consumer
  // mounts mid-second.
  const ms = 1000 - (Date.now() % 1000);
  setTimeout(() => {
    if (listeners.size === 0) return;
    tick();
    intervalId = setInterval(tick, 1000);
  }, ms);
}

function stopIfIdle() {
  if (intervalId !== null && listeners.size === 0) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startIfNeeded();
  return () => {
    listeners.delete(listener);
    stopIfIdle();
  };
}

function getSnapshot(): Date {
  return snapshot;
}

function getServerSnapshot(): Date {
  // Stable Date on the server so SSR doesn't try to hydrate moving values.
  return snapshot;
}

/** Returns a Date that updates once per second. Shared across all callers. */
export function useClock(): Date {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
