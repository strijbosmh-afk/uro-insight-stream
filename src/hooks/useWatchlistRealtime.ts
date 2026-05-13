// Single source of realtime invalidation for watchlist matches.
// Mounted once in AppShell — both the TopBar bell and /alerts Inbox
// read derived data via React Query, so one channel feeds both surfaces.
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

export function useWatchlistRealtime() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  React.useEffect(() => {
    if (!userId) return;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["watchlist-unread"] });
      qc.invalidateQueries({ queryKey: ["watchlist-matches"] });
    };

    let channel = subscribeChannel();
    let backoffMs = 2_000;
    let resubTimer: ReturnType<typeof setTimeout> | null = null;

    function subscribeChannel() {
      const c = supabase
        .channel(`watchlist-matches-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "user_watchlist_matches" },
          invalidate,
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "user_watchlist_matches" },
          invalidate,
        )
        .subscribe((status) => {
          // H-U1: handle CHANNEL_ERROR / TIMED_OUT / CLOSED with backoff so
          // mobile-background or network blips don't silently kill alerts.
          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            // Refetch eagerly — we just lost confidence in the stream.
            invalidate();
            if (resubTimer) clearTimeout(resubTimer);
            const delay = Math.min(backoffMs, 30_000);
            backoffMs = Math.min(backoffMs * 2, 30_000);
            resubTimer = setTimeout(() => {
              try {
                supabase.removeChannel(channel);
              } catch {
                /* ignore */
              }
              channel = subscribeChannel();
            }, delay);
          } else if (status === "SUBSCRIBED") {
            backoffMs = 2_000; // healthy — reset backoff
          }
        });
      return c;
    }

    // H-U1: refetch (and probe channel health) on focus/online so a phone
    // returning from background catches up immediately.
    const onFocusOrOnline = () => invalidate();
    window.addEventListener("focus", onFocusOrOnline);
    window.addEventListener("online", onFocusOrOnline);
    document.addEventListener("visibilitychange", onFocusOrOnline);

    return () => {
      if (resubTimer) clearTimeout(resubTimer);
      window.removeEventListener("focus", onFocusOrOnline);
      window.removeEventListener("online", onFocusOrOnline);
      document.removeEventListener("visibilitychange", onFocusOrOnline);
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}