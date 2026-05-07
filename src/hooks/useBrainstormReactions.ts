import * as React from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Emoji, Reaction } from "@/components/brainstorm/types";

export interface UseBrainstormReactionsResult {
  reactions: Reaction[];
  toggleReaction: (messageId: string, emoji: Emoji) => Promise<{ success: boolean }>;
}

/**
 * useBrainstormReactions — owns brainstorm_message_reactions data + realtime.
 *
 * Toggle mechanism (preserved verbatim from the original route file):
 *
 * REMOVE path (user already reacted with this emoji):
 *   1. Find the existing reaction by (message_id, user_id, emoji).
 *   2. Snapshot the current reactions array.
 *   3. Optimistically filter it out by id.
 *   4. DELETE from DB by id.
 *   5. On failure: restore the snapshot and toast "Reaction failed".
 *   The realtime DELETE event will also fire; its handler is idempotent
 *   (filter-by-id) so a second removal is a no-op.
 *
 * ADD path (user has not yet reacted with this emoji):
 *   1. Generate a temp id: `temp-${Math.random().toString(36).slice(2)}`.
 *   2. Snapshot the current reactions array.
 *   3. Optimistically append a reaction row carrying the temp id.
 *   4. INSERT into DB and `.select().single()` the real row back.
 *   5. On failure: restore the snapshot, toast "Reaction failed".
 *   6. On success: reconcile against the temp id. If the realtime echo has
 *      already arrived (real id is present), drop the temp; otherwise
 *      replace the temp row with the real row in place. This is what makes
 *      the user's own reaction not show twice.
 *
 * REALTIME echo:
 *   - INSERT: append by id, but skip if id already present (covers the case
 *     where the awaited insert response landed first).
 *   - DELETE: filter out by id (idempotent).
 */
export function useBrainstormReactions(currentUserId: string): UseBrainstormReactionsResult {
  const [reactions, setReactions] = React.useState<Reaction[]>([]);

  const channelSuffixRef = React.useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );

  React.useEffect(() => {
    let cancel = false;
    void (async () => {
      const { data } = await supabase
        .from("brainstorm_message_reactions")
        .select("id, message_id, user_id, emoji, created_at");
      if (cancel || !data) return;
      setReactions(data as Reaction[]);
    })();
    const ch = supabase
      .channel(`brainstorm-reactions-${channelSuffixRef.current}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "brainstorm_message_reactions" },
        (payload) => {
          const r = payload.new as Reaction;
          setReactions((prev) =>
            prev.some((x) => x.id === r.id) ? prev : [...prev, r],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "brainstorm_message_reactions" },
        (payload) => {
          const r = payload.old as Reaction;
          setReactions((prev) => prev.filter((x) => x.id !== r.id));
        },
      )
      .subscribe();
    return () => {
      cancel = true;
      void supabase.removeChannel(ch);
    };
  }, [currentUserId]);

  const toggleReaction = React.useCallback(
    async (messageId: string, emoji: Emoji): Promise<{ success: boolean }> => {
      const existing = reactions.find(
        (r) =>
          r.message_id === messageId &&
          r.user_id === currentUserId &&
          r.emoji === emoji,
      );
      if (existing) {
        const snapshot = reactions;
        setReactions((prev) => prev.filter((x) => x.id !== existing.id));
        const { error } = await supabase
          .from("brainstorm_message_reactions")
          .delete()
          .eq("id", existing.id);
        if (error) {
          setReactions(snapshot);
          toast.error("Reaction failed", { description: error.message });
          return { success: false };
        }
        return { success: true };
      }
      const tempId = `temp-${Math.random().toString(36).slice(2)}`;
      const optimistic: Reaction = {
        id: tempId,
        message_id: messageId,
        user_id: currentUserId,
        emoji,
        created_at: new Date().toISOString(),
      };
      const snapshot = reactions;
      setReactions((prev) => [...prev, optimistic]);
      const { data, error } = await supabase
        .from("brainstorm_message_reactions")
        .insert({ message_id: messageId, user_id: currentUserId, emoji })
        .select()
        .single();
      if (error) {
        setReactions(snapshot);
        toast.error("Reaction failed", { description: error.message });
        return { success: false };
      }
      if (data) {
        setReactions((prev) =>
          prev.some((x) => x.id === (data as Reaction).id)
            ? prev.filter((x) => x.id !== tempId)
            : prev.map((x) => (x.id === tempId ? (data as Reaction) : x)),
        );
      }
      return { success: true };
    },
    [reactions, currentUserId],
  );

  return { reactions, toggleReaction };
}