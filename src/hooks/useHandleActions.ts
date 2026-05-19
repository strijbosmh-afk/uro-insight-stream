import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

export type HandleSubState = {
  /** lowercase id used in sources table */
  id: string;
  existsInSources: boolean;
  isSubscribed: boolean;
};

/** Lookup whether a handle exists globally and whether the user follows it. */
export function useHandleSubscription(handle: string) {
  const { user } = useAuth();
  const id = handle.replace(/^@/, "").toLowerCase();
  return useQuery({
    queryKey: ["handle-sub-state", id, user?.id ?? "anon"],
    enabled: !!handle,
    staleTime: 30_000,
    queryFn: async (): Promise<HandleSubState> => {
      const [{ data: src }, subRes] = await Promise.all([
        supabase.from("sources").select("id").eq("id", id).maybeSingle(),
        user
          ? supabase
              .from("user_subscribed_sources")
              .select("source_id")
              .eq("user_id", user.id)
              .eq("source_id", id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        id,
        existsInSources: !!src,
        isSubscribed: !!(subRes as { data: unknown }).data,
      };
    },
  });
}

async function lookupAndPersist(handle: string) {
  const sessionRes = await supabase.auth.getSession();
  const accessToken = sessionRes.data.session?.access_token;
  const res = await fetch("/api/lookup-handle", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ handles: [handle] }),
  });
  if (res.status === 429) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const kind = body.error === "global_rate_limit" ? "global" : "user";
    const err = new Error(kind === "global" ? "rate_limit_global" : "rate_limit_user");
    throw err;
  }
  if (!res.ok) throw new Error(`lookup_failed_${res.status}`);
  const body = (await res.json()) as {
    results: Array<{ handle: string; found: boolean }>;
  };
  const found = body.results[0]?.found;
  if (!found) throw new Error("not_found");
}

type FollowOptimistic = {
  prevSet?: Set<string>;
  prevSubState?: HandleSubState | undefined;
  id: string;
};

/**
 * Snapshot + optimistically patch the two cache surfaces that drive the
 * follow UI: the per-handle `handle-sub-state` and the global subscribed-id
 * Set used by tables/lists. Returned snapshot lets onError roll back.
 */
function applyFollowOptimistic(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  id: string,
  next: boolean,
): FollowOptimistic {
  const subStateKey = ["handle-sub-state", id, userId];
  const idsKey = ["user-subscribed-source-ids", userId];
  const prevSubState = qc.getQueryData<HandleSubState>(subStateKey);
  const prevSet = qc.getQueryData<Set<string>>(idsKey);
  if (prevSubState) {
    qc.setQueryData<HandleSubState>(subStateKey, {
      ...prevSubState,
      isSubscribed: next,
    });
  }
  if (prevSet) {
    const nextSet = new Set(prevSet);
    if (next) nextSet.add(id);
    else nextSet.delete(id);
    qc.setQueryData<Set<string>>(idsKey, nextSet);
  }
  return { prevSet, prevSubState, id };
}

function rollbackFollow(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  ctx: FollowOptimistic | undefined,
) {
  if (!ctx) return;
  if (ctx.prevSubState !== undefined) {
    qc.setQueryData(["handle-sub-state", ctx.id, userId], ctx.prevSubState);
  }
  if (ctx.prevSet !== undefined) {
    qc.setQueryData(["user-subscribed-source-ids", userId], ctx.prevSet);
  }
}

export function useFollowSource() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      handle,
      needsLookup,
    }: {
      handle: string;
      needsLookup: boolean;
    }) => {
      if (!user) throw new Error("not_authenticated");
      const id = handle.replace(/^@/, "").toLowerCase();
      // Belt-and-braces: if cache already says we're subscribed, no-op.
      const cached = qc.getQueryData<HandleSubState>([
        "handle-sub-state",
        id,
        user.id,
      ]);
      if (cached?.isSubscribed) {
        return { id, backfilled: false, alreadyFollowing: true as const };
      }
      if (needsLookup) {
        await lookupAndPersist(id);
        // Enqueue an initial backfill — fire-and-forget RLS insert.
        const sinceISO = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
        await supabase.from("ingest_queue").insert({
          source_id: id,
          job_type: "initial_ingest",
          status: "pending",
          enrichment_status: "pending",
          priority: 90,
          since: sinceISO,
          requested_by: user.id,
        });
      }
      const { error } = await supabase
        .from("user_subscribed_sources")
        .upsert(
          { user_id: user.id, source_id: id },
          { onConflict: "user_id,source_id" },
        );
      if (error) throw error;
      return { id, backfilled: needsLookup };
    },
    onMutate: async ({ handle }) => {
      if (!user) return undefined;
      const id = handle.replace(/^@/, "").toLowerCase();
      await qc.cancelQueries({ queryKey: ["handle-sub-state", id, user.id] });
      return applyFollowOptimistic(qc, user.id, id, true);
    },
    onError: (_e, _vars, ctx) => {
      if (!user) return;
      rollbackFollow(qc, user.id, ctx);
    },
    onSettled: (_res, _e, vars) => {
      const id = vars.handle.replace(/^@/, "").toLowerCase();
      qc.invalidateQueries({ queryKey: ["handle-sub-state", id] });
      qc.invalidateQueries({ queryKey: ["user-subscribed-sources", user?.id] });
      qc.invalidateQueries({ queryKey: ["user-subscribed-source-ids", user?.id] });
      qc.invalidateQueries({ queryKey: ["sources"] });
    },
  });
}

export function useUnfollowSource() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ handle }: { handle: string }) => {
      if (!user) throw new Error("not_authenticated");
      const id = handle.replace(/^@/, "").toLowerCase();
      const { error } = await supabase
        .from("user_subscribed_sources")
        .delete()
        .eq("user_id", user.id)
        .eq("source_id", id);
      if (error) throw error;
      return { id };
    },
    onMutate: async ({ handle }) => {
      if (!user) return undefined;
      const id = handle.replace(/^@/, "").toLowerCase();
      await qc.cancelQueries({ queryKey: ["handle-sub-state", id, user.id] });
      return applyFollowOptimistic(qc, user.id, id, false);
    },
    onError: (_e, _vars, ctx) => {
      if (!user) return;
      rollbackFollow(qc, user.id, ctx);
    },
    onSettled: (res, _e, vars) => {
      const id = res?.id ?? vars.handle.replace(/^@/, "").toLowerCase();
      qc.invalidateQueries({ queryKey: ["handle-sub-state", id] });
      qc.invalidateQueries({ queryKey: ["user-subscribed-sources", user?.id] });
      qc.invalidateQueries({ queryKey: ["user-subscribed-source-ids", user?.id] });
    },
  });
}