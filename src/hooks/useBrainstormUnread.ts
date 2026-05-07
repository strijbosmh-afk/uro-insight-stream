import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

const LS_KEY = "brainstorm:lastReadAt";

export function useBrainstormUnread() {
  const { isAdmin, user } = useAuth();
  const [unread, setUnread] = React.useState(0);

  const getLastRead = React.useCallback(() => {
    if (typeof window === "undefined") return new Date(0).toISOString();
    return localStorage.getItem(LS_KEY) ?? new Date(0).toISOString();
  }, []);

  const refresh = React.useCallback(async () => {
    if (!isAdmin) return;
    const since = getLastRead();
    const { count } = await supabase
      .from("brainstorm_messages")
      .select("id", { count: "exact", head: true })
      .gt("created_at", since)
      .is("deleted_at", null)
      .neq("user_id", user?.id ?? "");
    setUnread(count ?? 0);
  }, [isAdmin, user?.id, getLastRead]);

  React.useEffect(() => {
    if (!isAdmin) return;
    void refresh();
    const ch = supabase
      .channel(`brainstorm-unread-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "brainstorm_messages" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [isAdmin, refresh]);

  const markRead = React.useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LS_KEY, new Date().toISOString());
    }
    setUnread(0);
  }, []);

  return { unread, markRead };
}
