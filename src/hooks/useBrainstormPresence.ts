import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";

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

  const presenceRef = React.useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = React.useRef<number | null>(null);
  // Keep latest display name accessible inside broadcastTyping without
  // re-creating the callback (and without restarting the channel).
  const displayNameRef = React.useRef(displayName);
  React.useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);

  // Cleanup typing timeout on unmount (channel cleanup is handled by the
  // generic hook).
  React.useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, []);

  useRealtimeChannel(
    "brainstorm-presence",
    {
      onPresenceSync: () => {
        const ch = presenceRef.current;
        if (!ch) return;
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
      },
      onSubscribe: (status, channel) => {
        presenceRef.current = channel;
        if (status === "SUBSCRIBED") {
          void channel.track({ display_name: displayNameRef.current, typing: false });
        }
      },
    },
    {
      deps: [currentUserId],
      channelOptions: { config: { presence: { key: currentUserId } } },
    },
  );

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