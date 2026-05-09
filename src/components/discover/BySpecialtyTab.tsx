import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useFollowSource } from "@/hooks/useHandleActions";
import type { DiscoverFilterState } from "./ForYouTab";

type RecRow = {
  source_id: string;
  specialty_id: string;
  weight: number;
  sources: {
    id: string;
    handle: string;
    display_name: string | null;
    avatar_url: string | null;
    verified: boolean | null;
    followers_count: number | null;
    bio: string | null;
  } | null;
};

type SpecialtyMeta = { id: string; label: string; sort_order: number };

function fmt(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function openSpecialtyWizard() {
  window.dispatchEvent(
    new CustomEvent("urofeed:open-wizard-step", { detail: { step: "Specialties" } }),
  );
}

export function BySpecialtyTab({ filters }: { filters: DiscoverFilterState }) {
  const { user, loading: authLoading } = useAuth();
  const qc = useQueryClient();
  const followMut = useFollowSource();

  const { data: mySpecialties = [], isLoading: loadingMine } = useQuery({
    queryKey: ["user-specialties", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_specialties")
        .select("specialty_id, is_primary")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as Array<{ specialty_id: string; is_primary: boolean }>;
    },
  });

  const specialtyIds = React.useMemo(
    () => mySpecialties.map((s) => s.specialty_id),
    [mySpecialties],
  );

  const { data: specialtyMeta = [] } = useQuery({
    queryKey: ["urology-specialties-min", specialtyIds.join(",")],
    enabled: specialtyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("urology_specialties")
        .select("id, label, sort_order")
        .in("id", specialtyIds);
      if (error) throw error;
      return (data ?? []) as SpecialtyMeta[];
    },
  });

  const { data: followedIds = new Set<string>() } = useQuery({
    queryKey: ["user-followed-source-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_subscribed_sources")
        .select("source_id")
        .eq("user_id", user!.id);
      return new Set((data ?? []).map((d) => d.source_id));
    },
  });

  const { data: recs = [], isLoading: loadingRecs } = useQuery({
    queryKey: ["recs-by-specialty", specialtyIds.join(",")],
    enabled: specialtyIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<RecRow[]> => {
      const { data, error } = await supabase
        .from("recommended_sources_by_specialty")
        .select(
          "source_id, specialty_id, weight, sources(id, handle, display_name, avatar_url, verified, followers_count, bio)",
        )
        .in("specialty_id", specialtyIds)
        .order("weight", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RecRow[];
    },
  });

  const grouped = React.useMemo(() => {
    const filtered = recs.filter((r) => {
      if (!r.sources) return false;
      if (followedIds.has(r.source_id)) return false;
      if (filters.verifiedOnly && !r.sources.verified) return false;
      if (filters.query.trim()) {
        const q = filters.query.toLowerCase();
        const hay =
          r.sources.handle.toLowerCase() +
          " " +
          (r.sources.display_name ?? "").toLowerCase() +
          " " +
          (r.sources.bio ?? "").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.specialtyId !== "all" && r.specialty_id !== filters.specialtyId) {
        return false;
      }
      return true;
    });
    const bySpec = new Map<string, RecRow[]>();
    for (const r of filtered) {
      const list = bySpec.get(r.specialty_id) ?? [];
      list.push(r);
      bySpec.set(r.specialty_id, list);
    }
    const primaryId = mySpecialties.find((s) => s.is_primary)?.specialty_id;
    const order = [...specialtyMeta].sort((a, b) => {
      if (a.id === primaryId) return -1;
      if (b.id === primaryId) return 1;
      return a.sort_order - b.sort_order;
    });
    return order
      .map((spec) => ({ spec, rows: bySpec.get(spec.id) ?? [] }))
      .filter((g) => g.rows.length > 0);
  }, [recs, followedIds, filters, mySpecialties, specialtyMeta]);

  const handleFollow = async (handle: string) => {
    try {
      await followMut.mutateAsync({ handle, needsLookup: true });
      toast.success(`Following @${handle}`);
      qc.invalidateQueries({ queryKey: ["user-followed-source-ids"] });
    } catch (err) {
      toast.error("Couldn't follow", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (authLoading || loadingMine) {
    return (
      <div className="p-6 flex items-center gap-2 text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <Panel title="Sign in to see specialty picks">
        <p className="text-sm text-text-muted">Please sign in.</p>
      </Panel>
    );
  }

  if (specialtyIds.length === 0) {
    return (
      <Panel title="Pick your specialties first">
        <div className="p-2 space-y-3">
          <p className="text-sm text-text-muted">
            Tell us up to three urology specialties you focus on, and we'll line up the
            handles most worth following in each.
          </p>
          <Button onClick={openSpecialtyWizard} size="sm">
            Choose specialties
          </Button>
        </div>
      </Panel>
    );
  }

  if (loadingRecs) {
    return (
      <div className="p-6 flex items-center gap-2 text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading recommendations…
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <Panel title="All caught up">
        <p className="text-sm text-text-muted">
          You're already following every recommended source for your specialties. Try the
          For you tab for fresh suggestions, or adjust your filters.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(({ spec, rows }) => (
        <Panel key={spec.id} title={`${spec.label} · ${rows.length}`}>
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const s = r.sources!;
              return (
                <li
                  key={`${r.specialty_id}:${r.source_id}`}
                  className="flex items-start gap-3 px-3 py-3 hover:bg-panel-elevated/40 transition-colors"
                >
                  {s.avatar_url ? (
                    <img
                      src={s.avatar_url}
                      alt=""
                      loading="lazy"
                      className="w-10 h-10 rounded-full shrink-0 bg-panel-elevated"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-panel-elevated shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-text-primary truncate">
                        {s.display_name || `@${s.handle}`}
                      </span>
                      {s.verified && (
                        <BadgeCheck className="w-3.5 h-3.5 text-accent shrink-0" />
                      )}
                      <span className="text-text-muted text-sm">@{s.handle}</span>
                    </div>
                    {s.bio && (
                      <p className="text-sm text-text-muted mt-0.5 line-clamp-2">{s.bio}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {fmt(s.followers_count)}
                      </span>
                      <span title="Recommendation weight">w{r.weight}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleFollow(s.handle)}
                      disabled={followMut.isPending}
                    >
                      <UserPlus className="w-4 h-4 mr-1" /> Follow
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

export default BySpecialtyTab;