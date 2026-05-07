import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AdminUser } from "@/components/brainstorm/types";

export interface UseBrainstormAdminsResult {
  admins: AdminUser[];
  isLoading: boolean;
  /**
   * Resolve a userId to a display name. Falls back to the optional
   * `fallback` argument when the user is not in the (currently active)
   * admins list — typically the message row's snapshotted
   * `user_display_name` from write time, which preserves names of
   * former admins on historical messages.
   */
  displayNameFor: (userId: string, fallback?: string) => string;
}

/**
 * useBrainstormAdmins — owns the active admins list + display-name resolver.
 *
 * Query mechanism (preserved verbatim from the original route file):
 *
 * - TWO sequential queries (no SQL join, no RPC):
 *   1. `select user_id from user_roles where role = 'admin'` → unique ids.
 *   2. `select id, display_name, email, avatar_url from profiles
 *       where id in (...)` → admin profile rows.
 *   The result is sorted by display_name (or email fallback) for stable
 *   PresenceList ordering.
 * - Empty roles short-circuits to `setAdmins([])` without hitting profiles.
 *
 * Realtime: a single channel subscribes to `*` events on BOTH `profiles`
 * (catches display name renames) AND `user_roles` (catches role grants /
 * revokes). Either fires a full re-fetch via `loadAdmins()`. Cheap because
 * the admin set is small.
 *
 * displayNameFor + historical-message edge case:
 * - The resolver only knows about CURRENTLY active admins. For a user whose
 *   admin role was revoked but whose old messages still exist, lookup by
 *   userId returns nothing and the resolver returns the supplied
 *   `fallback`. Every call site in the route already passes the message
 *   row's snapshotted `user_display_name` (captured at write time) as the
 *   fallback, so historical names render correctly without an extra
 *   profiles fetch. This matches the original behavior byte-for-byte.
 * - No caching beyond the React state + the memoized name map.
 */
export function useBrainstormAdmins(): UseBrainstormAdminsResult {
  const [admins, setAdmins] = React.useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const channelSuffixRef = React.useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );

  const loadAdmins = React.useCallback(async () => {
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (rolesErr) {
      setIsLoading(false);
      return;
    }
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    if (ids.length === 0) {
      setAdmins([]);
      setIsLoading(false);
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, email, avatar_url")
      .in("id", ids);
    setAdmins(
      (profs ?? []).sort((a, b) =>
        (a.display_name ?? a.email ?? "").localeCompare(
          b.display_name ?? b.email ?? "",
        ),
      ) as AdminUser[],
    );
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    void loadAdmins();
    const ch = supabase
      .channel(`brainstorm-profiles-${channelSuffixRef.current}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => void loadAdmins(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles" },
        () => void loadAdmins(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [loadAdmins]);

  const nameById = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of admins) {
      map[a.id] = a.display_name ?? a.email ?? "";
    }
    return map;
  }, [admins]);

  const displayNameFor = React.useCallback(
    (userId: string, fallback?: string) => {
      const n = nameById[userId];
      if (n && n.trim().length > 0) return n;
      return fallback ?? "";
    },
    [nameById],
  );

  return { admins, isLoading, displayNameFor };
}