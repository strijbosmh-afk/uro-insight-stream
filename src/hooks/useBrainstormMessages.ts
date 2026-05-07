import * as React from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Message } from "@/components/brainstorm/types";

export interface UseBrainstormMessagesResult {
  messages: Message[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (
    content: string,
    options?: { userId: string; displayName: string; replyToId?: string | null },
  ) => Promise<{ success: boolean; message?: Message }>;
  editMessage: (messageId: string, content: string) => Promise<{ success: boolean }>;
  deleteMessage: (messageId: string) => Promise<{ success: boolean }>;
}

/**
 * useBrainstormMessages — owns brainstorm_messages data + realtime.
 *
 * Optimistic-insert + realtime de-dupe mechanism (preserved verbatim from the
 * original route file):
 *
 * 1. sendMessage awaits the DB insert with `.select().single()` and only then
 *    appends the returned row locally. There is no temp-id placeholder shown
 *    while the request is in-flight (the existing UI relied on the request
 *    being fast enough that no placeholder was needed).
 * 2. The realtime INSERT subscription may deliver the same row before or
 *    after the awaited response. Both code paths therefore guard with a
 *    by-id check: `prev.some((x) => x.id === m.id) ? prev : [...prev, m]`.
 *    Whichever path arrives first wins; the other is a no-op.
 * 3. On insert failure the local state is never mutated, so there is nothing
 *    to roll back — the caller (Composer) restores its input value via the
 *    boolean return.
 * 4. Edit and delete ARE optimistic with snapshot rollback on failure.
 *
 * Auth-user-change handling: the hook re-subscribes when `userId` changes by
 * keying its effects on it (sign out / sign in as a different user tears down
 * and re-creates the channel).
 */
export function useBrainstormMessages(userId: string | null): UseBrainstormMessagesResult {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  // Stable per-mount channel suffix to avoid collisions across tabs.
  const channelSuffixRef = React.useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );

  // Initial load
  React.useEffect(() => {
    let cancel = false;
    setIsLoading(true);
    void (async () => {
      const { data, error: err } = await supabase
        .from("brainstorm_messages")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(500);
      if (cancel) return;
      if (err) {
        setError(new Error(err.message));
        toast.error("Failed to load messages", { description: err.message });
      } else {
        setMessages((data ?? []) as Message[]);
      }
      setIsLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [userId]);

  // Realtime subscription
  React.useEffect(() => {
    const ch = supabase
      .channel(`brainstorm-messages-${channelSuffixRef.current}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "brainstorm_messages" },
        (payload) => {
          const m = payload.new as Message;
          if (m.deleted_at) return;
          setMessages((prev) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "brainstorm_messages" },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => {
            if (m.deleted_at) return prev.filter((x) => x.id !== m.id);
            return prev.map((x) => (x.id === m.id ? m : x));
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId]);

  const sendMessage = React.useCallback(
    async (
      content: string,
      options?: { userId: string; displayName: string; replyToId?: string | null },
    ): Promise<{ success: boolean; message?: Message }> => {
      if (!options) return { success: false };
      const { data, error: err } = await supabase
        .from("brainstorm_messages")
        .insert({
          user_id: options.userId,
          user_display_name: options.displayName,
          content,
          reply_to_id: options.replyToId ?? null,
        })
        .select()
        .single();
      if (err) {
        toast.error("Failed to send", { description: err.message });
        return { success: false };
      }
      if (data) {
        setMessages((prev) =>
          prev.some((x) => x.id === data.id) ? prev : [...prev, data as Message],
        );
        return { success: true, message: data as Message };
      }
      return { success: true };
    },
    [],
  );

  const editMessage = React.useCallback(
    async (messageId: string, content: string): Promise<{ success: boolean }> => {
      const editedAt = new Date().toISOString();
      let snapshot: Message[] = [];
      setMessages((prev) => {
        snapshot = prev;
        return prev.map((x) =>
          x.id === messageId ? { ...x, content, edited_at: editedAt } : x,
        );
      });
      const { error: err } = await supabase
        .from("brainstorm_messages")
        .update({ content, edited_at: editedAt })
        .eq("id", messageId);
      if (err) {
        setMessages(snapshot);
        toast.error("Failed to save edit", { description: err.message });
        return { success: false };
      }
      return { success: true };
    },
    [],
  );

  const deleteMessage = React.useCallback(
    async (messageId: string): Promise<{ success: boolean }> => {
      let snapshot: Message[] = [];
      setMessages((prev) => {
        snapshot = prev;
        return prev.filter((x) => x.id !== messageId);
      });
      const { error: err } = await supabase
        .from("brainstorm_messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", messageId);
      if (err) {
        setMessages(snapshot);
        toast.error("Delete failed", { description: err.message });
        return { success: false };
      }
      return { success: true };
    },
    [],
  );

  return { messages, isLoading, error, sendMessage, editMessage, deleteMessage };
}