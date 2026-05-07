import * as React from "react";
import { supabase } from "@/integrations/supabase/client";

export interface UseBrainstormPresenceResult {
  onlineIds: Set<string>;
  typingUsers: string[];
  broadcastTyping: (isTyping: boolean) => void;
}

/**
 * useBrainstormPresence — owns the presence channel for the brainstorm room.
 *
 * Typing broadcast mechanism (preserved verbatim from the original route):
 *
 * - The same presence track() payload carries both `display_name` and a
 *   `typing` boolean flag. There is NO separate broadcast channel; flipping
 *   typing on/off is just another `ch.track({...})` call that fires a
 *   presence "sync" event on the other clients.
 * - 3-second auto-clear: every call to `broadcastTyping(true)` clears any
 *   pending timeout and starts a fresh 3000ms timer that flips the flag
 *   back to false. So typing for 10 seconds straight keeps the indicator
 *   alive (each keystroke restarts the timer); pausing for 3s clears it.
 * - Explicit clear on send: the route calls `broadcastTyping(false)`
 *   immediately when a message is submitted. That call also clears the
 *   pending timeout so it cannot re-fire.
 * - Unmount: `supabase.removeChannel(ch)` drops the user from presence
 *   entirely on the server side; other clients' next sync no longer sees
 *   the user, which implicitly clears any stale typing flag for them.
 *   The cleanup also clears the pending typing timeout to avoid setting
 *   state after unmount.
 */
export function useBrainstormPresence(
  currentUserId: string,
  displayName: string,
): UseBrainstormPresenceResult {
  const [onlineIds, setOnlineIds] = React.useState<Set<string>>(new Set());
  const [typingUsers, setTypingUsers] = React.useState<string[]>([]);

  const presenceRef = React.useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = React.useRef<number | null>(null);
  const channelSuffixRef = React.useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );
  // Keep latest display name accessible inside broadcastTyping without
  // re-creating the callback (and without restarting the channel).
  const displayNameRef = React.useRef(displayName);
  React.useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

  React.useEffect(() => {
    const ch = supabase.channel(`brainstorm-presence-${channelSuffixRef.current}`, {
      config: { presence: { key: currentUserId } },
    });
    presenceRef.current = ch;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<
        string,
        Array<{ display_name: string; typing?: boolean }>
      >;
      setOnlineIds(new Set(Object.keys(state)));
      const typing: string[] = [];
      for (const [uid, metas] of Object.entries(state)) {
        if (uid === currentUserId) continue;
        const m = metas[0];
        if (m?.typing) typing.push(m.display_name);
      }
      setTypingUsers(typing);
    });
    void ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ display_name: displayNameRef.current, typing: false });
      }
    });
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      void supabase.removeChannel(ch);
      presenceRef.current = null;
    };
  }, [currentUserId, displayName]);

  const broadcastTyping = React.useCallback((isTyping: boolean) => {
    const ch = presenceRef.current;
    if (!ch) return;
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    void ch.track({ display_name: displayNameRef.current, typing: isTyping });
    if (isTyping) {
      typingTimeoutRef.current = window.setTimeout(() => {
        const ch2 = presenceRef.current;
        if (!ch2) return;
        void ch2.track({ display_name: displayNameRef.current, typing: false });
        typingTimeoutRef.current = null;
      }, 3000);
    }
  }, []);

  return { onlineIds, typingUsers, broadcastTyping };
}