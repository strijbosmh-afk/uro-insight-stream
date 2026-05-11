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
    const channel = supabase
      .channel(`watchlist-matches-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_watchlist_matches" },
        () => {
          qc.invalidateQueries({ queryKey: ["watchlist-unread"] });
          qc.invalidateQueries({ queryKey: ["watchlist-matches"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_watchlist_matches" },
        () => {
          qc.invalidateQueries({ queryKey: ["watchlist-unread"] });
          qc.invalidateQueries({ queryKey: ["watchlist-matches"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}