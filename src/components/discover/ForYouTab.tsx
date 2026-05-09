import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus, X, BadgeCheck, Users } from "lucide-react";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useFollowSource } from "@/hooks/useHandleActions";

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
};

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export interface DiscoverFilterState {
  query: string;
  verifiedOnly: boolean;
  specialtyId: string | "all";
}

export function ForYouTab({ filters }: { filters: DiscoverFilterState }) {
  const { user, loading: authLoading } = useAuth();
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
            "handle, display_name, avatar_url, verified, followers_count, bio, reply_count, quote_count, mention_count, total_signal, enrichment_status",
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source-candidates"] }),
  });

  const candidates = React.useMemo(() => {
    let list = candidatesQuery.data ?? [];
    if (filters.verifiedOnly) list = list.filter((c) => c.verified);
    if (filters.query.trim()) {
      const q = filters.query.toLowerCase();
      list = list.filter(
        (c) =>
          c.handle.toLowerCase().includes(q) ||
          (c.display_name ?? "").toLowerCase().includes(q) ||
          (c.bio ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [candidatesQuery.data, filters]);

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
      toast.error("Couldn't follow", {
        description: err instanceof Error ? err.message : String(err),
      });
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
      <Panel title="Sign in to discover sources">
        <p className="text-sm text-text-muted">Please sign in to see suggestions.</p>
      </Panel>
    );
  }

  return (
    <Panel title={`Candidates · ${candidates.length}`}>
      {candidatesQuery.isLoading ? (
        <div className="p-6 flex items-center gap-2 text-text-muted">
          <Loader2 className="w-4 h-4 animate-spin" /> Computing suggestions…
        </div>
      ) : candidates.length === 0 ? (
        <div className="p-6 text-sm text-text-muted">
          No suggestions match. Try adjusting filters.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {candidates.map((c) => (
            <li
              key={c.handle}
              className="flex items-start gap-3 px-3 py-3 hover:bg-panel-elevated/40 transition-colors"
            >
              <Checkbox
                checked={selected.has(c.handle)}
                onCheckedChange={() => toggle(c.handle)}
                className="mt-1"
                aria-label={`Select @${c.handle}`}
              />
              {c.avatar_url ? (
                <img src={c.avatar_url} alt="" loading="lazy"
                  className="w-10 h-10 rounded-full shrink-0 bg-panel-elevated" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-panel-elevated shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-text-primary truncate">
                    {c.display_name || `@${c.handle}`}
                  </span>
                  {c.verified && <BadgeCheck className="w-3.5 h-3.5 text-accent shrink-0" />}
                  <span className="text-text-muted text-sm">@{c.handle}</span>
                </div>
                {c.bio && (
                  <p className="text-sm text-text-muted mt-0.5 line-clamp-2">{c.bio}</p>
                )}
                <div className="flex items-center gap-3 mt-1 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {fmt(c.followers_count)}
                  </span>
                  <span>{c.reply_count} rpl</span>
                  <span>{c.quote_count} qt</span>
                  <span>{c.mention_count} mn</span>
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
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default ForYouTab;