import * as React from "react";
import { supabase } from "@/integrations/supabase/client";

const IDLE_MS = 30 * 60 * 1000; // 30 minutes
const STORAGE_KEY = "lastActivityAt";
const THROTTLE_MS = 1000;

/**
 * Auto sign-out after IDLE_MS of inactivity. No-op when no session.
 * Activity is tracked across tabs/reloads via localStorage.
 */
export function useIdleLogout(hasSession: boolean): void {
  React.useEffect(() => {
    if (!hasSession) return;
    if (typeof window === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastWrite = 0;

    const logout = () => {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      void supabase.auth.signOut();
    };

    const arm = (msFromNow: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(logout, Math.max(0, msFromNow));
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite < THROTTLE_MS) return;
      lastWrite = now;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(now));
      } catch {
        /* ignore */
      }
      arm(IDLE_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      let last = 0;
      try {
        last = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
      } catch {
        /* ignore */
      }
      const elapsed = Date.now() - last;
      if (!last || elapsed >= IDLE_MS) {
        logout();
      } else {
        arm(IDLE_MS - elapsed);
      }
    };

    // Initial check: if last activity (from another tab / previous session)
    // already exceeded threshold, sign out immediately.
    let last = 0;
    try {
      last = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
    } catch {
      /* ignore */
    }
    const now = Date.now();
    if (last && now - last >= IDLE_MS) {
      logout();
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, String(now));
    } catch {
      /* ignore */
    }
    arm(IDLE_MS - (last ? now - last : 0));

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];
    for (const ev of events) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      for (const ev of events) {
        window.removeEventListener(ev, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hasSession]);
}