import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus, X, BadgeCheck, Users } from "lucide-react";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useFollowSource } from "@/hooks/useHandleActions";

export const Route = createFileRoute("/discover/")({
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
  quote_count: number;
  mention_count: number;
  total_signal: number;
  enrichment_status: string;
  signal_breakdown: {
    reply?: number;
    reply_recent?: number;
    quote?: number;
    quote_recent?: number;
    mention?: number;
    mention_recent?: number;
  } | null;
};

function formatFollowers(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

type RankMode = "all" | "interactions" | "mentions";

/** Dominant-signal sentence for a candidate. */
function reasonFor(c: Candidate): string {
  const interactions = c.reply_count + c.quote_count;
  const mentions = c.mention_count;
  const total = interactions + mentions;
  if (total === 0) return "Surfaced from recent activity";
  const intShare = interactions / total;
  const intText =
    interactions === 1
      ? "1× by sources you follow"
      : `${interactions}× by sources you follow`;
  const menText =
    mentions === 1 ? "1× in your feed" : `${mentions}× in your feed`;
  const verb =
    c.reply_count >= c.quote_count ? "Replied to" : "Quoted";
  // Roughly equal → show both, otherwise dominant only.
  if (intShare > 0.6) return `${verb} ${intText}`;
  if (intShare < 0.4) return `Mentioned ${menText}`;
  return `${verb} ${intText} · mentioned ${menText}`;
}

function scoreByMode(c: Candidate, mode: RankMode): number {
  if (mode === "interactions") return c.reply_count * 3 + c.quote_count * 3;
  if (mode === "mentions") return c.mention_count;
  return c.total_signal;
}

function DiscoverPage() {
  const { user, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const followMut = useFollowSource();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [rankMode, setRankMode] = React.useState<RankMode>("all");

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

  const candidates = React.useMemo(() => {
    const list = candidatesQuery.data ?? [];
    const sorted = [...list].sort((a, b) => scoreByMode(b, rankMode) - scoreByMode(a, rankMode));
    if (rankMode === "interactions") {
      return sorted.filter((c) => c.reply_count + c.quote_count > 0);
    }
    if (rankMode === "mentions") {
      return sorted.filter((c) => c.mention_count > 0);
    }
    return sorted;
  }, [candidatesQuery.data, rankMode]);

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
      toast.success(`Following @${handle}`);
      qc.invalidateQueries({ queryKey: ["source-candidates"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Couldn't follow", { description: msg });
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
    if (failCount > 0) {
      toast.error(`Followed ${okCount}`, { description: `${failCount} failed` });
    } else {
      toast.success(`Followed ${okCount}`);
    }
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

      <div className="flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider">
        {(["all", "interactions", "mentions"] as RankMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setRankMode(m)}
            className={
              "px-2.5 h-7 rounded-[3px] border transition-colors " +
              (rankMode === m
                ? "bg-accent/10 border-accent/40 text-text-primary"
                : "border-border text-text-muted hover:text-text-primary")
            }
          >
            {m === "all" ? "All signals" : m === "interactions" ? "Replies + quotes" : "Mentions"}
          </button>
        ))}
      </div>

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
                    <div className="text-[12px] text-text-secondary mt-1">{reasonFor(c)}</div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {formatFollowers(c.followers_count)}
                      </span>
                      <span title="Replies">{c.reply_count} rpl</span>
                      <span title="Quotes">{c.quote_count} qt</span>
                      <span title="Mentions">{c.mention_count} mn</span>
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