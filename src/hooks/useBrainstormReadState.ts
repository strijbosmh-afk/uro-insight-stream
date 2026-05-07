import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Message, ReadState } from "@/components/brainstorm/types";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";

export interface UseBrainstormReadStateResult {
  readStates: Record<string, ReadState>;
  markRead: (messageId?: string | null) => void;
  getReadersFor: (m: Message) => ReadState[];
}

/**
 * useBrainstormReadState — owns brainstorm_read_state data, realtime, and
 * the auto-mark-read trigger.
 *
 * Auto-mark-read mechanism (preserved verbatim from the original route file):
 *
 * - Trigger: a useEffect keyed on the `latestMessageId` argument. The
 *   original code keyed on `messages.length`; passing the latest message id
 *   from the route is functionally equivalent (it changes whenever a new
 *   message lands, and only then) and lines up with the spec'd signature.
 * - Visibility gate: `markRead` short-circuits when
 *   `document.visibilityState !== "visible"`. New messages arriving while
 *   the tab is hidden do NOT mark read.
 * - Visibility recovery: a `visibilitychange` listener calls `markRead()`
 *   the moment the tab becomes visible again, catching up unread messages.
 * - On initial mount with the tab visible, the latest-id effect fires and
 *   marks read once.
 * - No debounce. The original code relied on React batching plus the fact
 *   that messages.length only changes on real arrivals.
 *
 * localStorage mirror:
 * - Key: `"brainstorm:lastReadAt"` (NOT user-scoped — matches existing
 *   behavior; `useBrainstormUnread` reads the same key).
 * - Written on every successful `markRead` BEFORE the DB upsert is awaited
 *   (so the local mirror reflects the optimistic intent immediately).
 * - Not used as a state seed inside this hook; it exists for the unread
 *   badge hook to render the correct count on cold load.
 * - DB is the source of truth for cross-device read receipts; localStorage
 *   is purely a same-device mirror for the unread badge.
 *
 * Phase 4d profile join: this hook still selects only
 * `user_id, last_read_at` from `brainstorm_read_state` (the
 * `user_display_name` column was dropped in 4d). Display names for read
 * receipts are resolved at render time by the route's `displayNameFor`
 * helper, which already joins admins/profiles. Nothing in this hook reaches
 * for the dropped column.
 */
export function useBrainstormReadState(
  currentUserId: string,
  latestMessageId: string | null,
): UseBrainstormReadStateResult {
  const [readStates, setReadStates] = React.useState<Record<string, ReadState>>({});

  const isTabVisibleRef = React.useRef(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );

  const markRead = React.useCallback<UseBrainstormReadStateResult["markRead"]>(
    (_messageId?: string | null) => {
      void (async () => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        const now = new Date().toISOString();
        if (typeof window !== "undefined") {
          localStorage.setItem("brainstorm:lastReadAt", now);
        }
        const { error } = await supabase.from("brainstorm_read_state").upsert(
          {
            user_id: currentUserId,
            last_read_at: now,
            updated_at: now,
          },
          { onConflict: "user_id" },
        );
        if (error) {
          // Non-fatal; receipts will just be slightly stale
          console.warn("Failed to update read state", error.message);
        }
      })();
    },
    [currentUserId],
  );

  // Auto-mark-read whenever a new message arrives (and the tab is visible).
  React.useEffect(() => {
    markRead(latestMessageId);
  }, [markRead, latestMessageId]);

  // Mark read when the tab becomes visible again.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      isTabVisibleRef.current = document.visibilityState === "visible";
      if (isTabVisibleRef.current) markRead();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [markRead]);

  // Initial fetch
  React.useEffect(() => {
    let cancel = false;
    void (async () => {
      const { data } = await supabase
        .from("brainstorm_read_state")
        .select("user_id, last_read_at");
      if (cancel || !data) return;
      const map: Record<string, ReadState> = {};
      for (const r of data as ReadState[]) map[r.user_id] = r;
      setReadStates(map);
    })();
    return () => {
      cancel = true;
    };
  }, [currentUserId]);

  // Realtime subscription
  useRealtimeChannel(
    "brainstorm-read-state",
    {
      onPostgresChange: [
        {
          event: "*",
          table: "brainstorm_read_state",
          callback: (payload) => {
            const r = (payload.new ?? payload.old) as Partial<ReadState> | null;
            if (!r) return;
            setReadStates((prev) => {
              if (payload.eventType === "DELETE") {
                const uid = r.user_id;
                if (!uid) return prev;
                const { [uid]: _, ...rest } = prev;
                return rest;
              }
              const next = payload.new as ReadState;
              return { ...prev, [next.user_id]: next };
            });
          },
        },
      ],
    },
    { deps: [currentUserId] },
  );

  const getReadersFor = React.useCallback(
    (m: Message): ReadState[] => {
      const created = new Date(m.created_at).getTime();
      const out: ReadState[] = [];
      for (const r of Object.values(readStates)) {
        if (r.user_id === m.user_id) continue;
        if (new Date(r.last_read_at).getTime() >= created) out.push(r);
      }
      return out;
    },
    [readStates],
  );

  return { readStates, markRead, getReadersFor };
}