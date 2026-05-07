import * as React from "react";
import type { RealtimeChannel, RealtimeChannelOptions } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type PostgresEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export interface PostgresChangeHandler {
  event: PostgresEvent;
  schema?: string;
  table: string;
  filter?: string;
  // Payload shape varies by event; keep loose to match supabase-js usage.
  callback: (payload: any) => void;
}

export interface BroadcastHandler {
  event: string;
  callback: (payload: any) => void;
}

export interface UseRealtimeChannelHandlers {
  onPostgresChange?: PostgresChangeHandler[];
  onPresenceSync?: () => void;
  onPresenceJoin?: (
    key: string,
    currentPresences: unknown,
    newPresences: unknown,
  ) => void;
  onPresenceLeave?: (
    key: string,
    currentPresences: unknown,
    leftPresences: unknown,
  ) => void;
  onBroadcast?: BroadcastHandler[];
  /**
   * Fires once after `.subscribe()` resolves with each status update from
   * Supabase Realtime. Use this for post-subscribe imperative work like
   * presence `channel.track(...)`.
   */
  onSubscribe?: (status: string, channel: RealtimeChannel) => void;
}

export interface UseRealtimeChannelOptions {
  enabled?: boolean;
  /**
   * When any value in `deps` changes, the hook tears down the existing
   * channel and creates a brand new one (with a fresh UUID suffix) — never
   * mutates the running channel in place.
   */
  deps?: React.DependencyList;
  /** Optional Supabase RealtimeChannelOptions (e.g., presence config). */
  channelOptions?: RealtimeChannelOptions;
}

export interface UseRealtimeChannelResult {
  channel: RealtimeChannel | null;
}

/**
 * useRealtimeChannel — generic Supabase Realtime channel manager.
 *
 * Guarantees:
 * - Unique channel name per mount (and per re-subscribe): `${baseName}-${uuid}`.
 * - All `.on(...)` handlers attach BEFORE `.subscribe()` (avoids the
 *   "cannot add postgres_changes after subscribe" error class).
 * - Handlers are wrapped in refs internally, so consumers can pass inline
 *   arrow functions without causing re-subscription on every render.
 * - Cleanup on unmount / dep change calls `supabase.removeChannel(channel)`.
 * - `enabled: false` skips subscription entirely.
 */
export function useRealtimeChannel(
  baseName: string,
  handlers: UseRealtimeChannelHandlers,
  options?: UseRealtimeChannelOptions,
): UseRealtimeChannelResult {
  const enabled = options?.enabled ?? true;
  const deps = options?.deps ?? [];
  const channelOptions = options?.channelOptions;

  // Stable handler ref — latest values without re-subscription churn.
  const handlersRef = React.useRef(handlers);
  React.useEffect(() => {
    handlersRef.current = handlers;
  });

  const [channel, setChannel] = React.useState<RealtimeChannel | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      setChannel(null);
      return;
    }
    const suffix =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    const ch = channelOptions
      ? supabase.channel(`${baseName}-${suffix}`, channelOptions)
      : supabase.channel(`${baseName}-${suffix}`);

    // Attach all handlers BEFORE subscribe.
    const pgHandlers = handlersRef.current.onPostgresChange ?? [];
    for (const h of pgHandlers) {
      ch.on(
        // supabase-js types want the literal "postgres_changes" string here;
        // cast to keep this generic helper type-clean.
        "postgres_changes" as never,
        {
          event: h.event,
          schema: h.schema ?? "public",
          table: h.table,
          ...(h.filter ? { filter: h.filter } : {}),
        } as never,
        ((payload: unknown) => {
          // Look up via ref to pick up the latest closure.
          const latest = handlersRef.current.onPostgresChange?.find(
            (x) => x.event === h.event && x.table === h.table && x.filter === h.filter,
          );
          (latest?.callback ?? h.callback)(payload);
        }) as never,
      );
    }

    if (handlersRef.current.onPresenceSync) {
      ch.on("presence", { event: "sync" }, () => {
        handlersRef.current.onPresenceSync?.();
      });
    }
    if (handlersRef.current.onPresenceJoin) {
      ch.on("presence", { event: "join" }, ({ key, currentPresences, newPresences }) => {
        handlersRef.current.onPresenceJoin?.(key, currentPresences, newPresences);
      });
    }
    if (handlersRef.current.onPresenceLeave) {
      ch.on("presence", { event: "leave" }, ({ key, currentPresences, leftPresences }) => {
        handlersRef.current.onPresenceLeave?.(key, currentPresences, leftPresences);
      });
    }

    const broadcastHandlers = handlersRef.current.onBroadcast ?? [];
    for (const b of broadcastHandlers) {
      ch.on("broadcast", { event: b.event }, (payload) => {
        const latest = handlersRef.current.onBroadcast?.find((x) => x.event === b.event);
        (latest?.callback ?? b.callback)(payload);
      });
    }

    ch.subscribe((status) => {
      handlersRef.current.onSubscribe?.(status, ch);
    });

    setChannel(ch);

    return () => {
      void supabase.removeChannel(ch);
      setChannel(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, baseName, ...deps]);

  return { channel };
}