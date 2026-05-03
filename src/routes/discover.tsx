import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus, X, BadgeCheck, Users } from "lucide-react";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useFollowSource } from "@/hooks/useHandleActions";

export const Route = createFileRoute("/discover")({
  head: () => ({
    meta: [
      { title: "Discover sources — UroFeed" },
      {
        name: "description",
        content:
          "Auto-suggested handles to follow, ranked by activity in your existing feed.",
      },
    ],
  }),
  component: DiscoverPage,
});

type Candidate = {
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean;
  followers_count: number | null;
  bio: string | null;
  reply_count: number;
  mention_count: number;
  total_signal: number;
  enrichment_status: string;
};

function formatFollowers(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function DiscoverPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const followMut = useFollowSource();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const candidatesQuery = useQuery({
    queryKey: ["source-candidates", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<Candidate[]> => {
      const [{ data: cands, error }, { data: dismissals }] = await Promise.all([
        supabase
          .from("source_candidates")
          .select(
            "handle, display_name, avatar_url, verified, followers_count, bio, reply_count, mention_count, total_signal, enrichment_status",
          )
          .eq("enrichment_status", "enriched")
          .order("total_signal", { ascending: false })
          .limit(60),
        user
          ? supabase.from("source_candidate_dismissals").select("handle").eq("user_id", user.id)
          : Promise.resolve({ data: [] as { handle: string }[] }),
      ]);
      if (error) throw error;
      const dismissed = new Set((dismissals ?? []).map((d) => d.handle));

      // Filter out already-followed handles.
      const { data: subs } = user
        ? await supabase
            .from("user_subscribed_sources")
            .select("source_id")
            .eq("user_id", user.id)
        : { data: [] as { source_id: string }[] };
      const followed = new Set((subs ?? []).map((s) => s.source_id));

      return ((cands as Candidate[]) ?? []).filter(
        (c) => !dismissed.has(c.handle) && !followed.has(c.handle),
      );
    },
  });

  const dismissMut = useMutation({
    mutationFn: async (handle: string) => {
      if (!user) throw new Error("not_authenticated");
      const { error } = await supabase
        .from("source_candidate_dismissals")
        .insert({ user_id: user.id, handle });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["source-candidates"] });
    },
  });

  const toggle = (handle: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });

  const handleFollow = async (handle: string) => {
    try {
      await followMut.mutateAsync({ handle, needsLookup: true });
      toast({ title: `Following @${handle}` });
      qc.invalidateQueries({ queryKey: ["source-candidates"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Couldn't follow", description: msg, variant: "destructive" });
    }
  };

  const handleBulkFollow = async () => {
    const handles = Array.from(selected);
    let okCount = 0;
    let failCount = 0;
    for (const h of handles) {
      try {
        await followMut.mutateAsync({ handle: h, needsLookup: true });
        okCount++;
      } catch {
        failCount++;
      }
    }
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["source-candidates"] });
    toast({
      title: `Followed ${okCount}`,
      description: failCount > 0 ? `${failCount} failed` : undefined,
      variant: failCount > 0 ? "destructive" : "default",
    });
  };

  if (authLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!user) {
    return (
      <div className="p-6">
        <Panel title="Sign in to discover sources">
          <p className="text-sm text-text-muted">Please sign in to see suggestions.</p>
        </Panel>
      </div>
    );
  }

  const candidates = candidatesQuery.data ?? [];
  const isLoading = candidatesQuery.isLoading;

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-sm uppercase tracking-[0.18em] text-text-muted">
            Discover
          </h1>
          <p className="text-text-primary text-lg font-semibold mt-1">
            Suggested sources to follow
          </p>
          <p className="text-sm text-text-muted mt-1">
            Ranked by mentions and replies in your existing feed (last 30 days).
          </p>
        </div>
        {selected.size > 0 && (
          <Button onClick={handleBulkFollow} disabled={followMut.isPending}>
            {followMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4 mr-2" />
            )}
            Follow {selected.size} selected
          </Button>
        )}
      </header>

      <Panel title="Candidates">
        {isLoading ? (
          <div className="p-6 flex items-center gap-2 text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Computing suggestions…
          </div>
        ) : candidates.length === 0 ? (
          <div className="p-6 text-sm text-text-muted">
            No suggestions right now. We compute these from your feed activity — check back after
            more tweets are ingested.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {candidates.map((c) => {
              const isSelected = selected.has(c.handle);
              return (
                <li
                  key={c.handle}
                  className="flex items-start gap-3 px-3 py-3 hover:bg-panel-elevated/40 transition-colors"
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggle(c.handle)}
                    className="mt-1"
                    aria-label={`Select @${c.handle}`}
                  />
                  {c.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full shrink-0 bg-panel-elevated"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-panel-elevated shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-text-primary truncate">
                        {c.display_name || `@${c.handle}`}
                      </span>
                      {c.verified && (
                        <BadgeCheck className="w-3.5 h-3.5 text-accent shrink-0" />
                      )}
                      <span className="text-text-muted text-sm">@{c.handle}</span>
                    </div>
                    {c.bio && (
                      <p className="text-sm text-text-muted mt-0.5 line-clamp-2">{c.bio}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] font-mono uppercase tracking-wider text-text-muted">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {formatFollowers(c.followers_count)}
                      </span>
                      <span title="Replies from sources you follow">
                        {c.reply_count} replies
                      </span>
                      <span title="Mentions in your feed">{c.mention_count} mentions</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => dismissMut.mutate(c.handle)}
                      disabled={dismissMut.isPending}
                      aria-label={`Dismiss @${c.handle}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleFollow(c.handle)}
                      disabled={followMut.isPending}
                    >
                      <UserPlus className="w-4 h-4 mr-1" /> Follow
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}