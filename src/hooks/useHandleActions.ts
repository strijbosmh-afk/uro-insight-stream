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
    onSuccess: (_res, vars) => {
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
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["handle-sub-state", res.id] });
      qc.invalidateQueries({ queryKey: ["user-subscribed-sources", user?.id] });
      qc.invalidateQueries({ queryKey: ["user-subscribed-source-ids", user?.id] });
    },
  });
}