import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Star, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { isValidHandle, isValidHashtag, normalizeHandle, normalizeHashtag } from "@/lib/validation";

function rerun(step: "Specialties" | "Congresses" | "Sources" | "Hashtags") {
  window.dispatchEvent(
    new CustomEvent("urofeed:open-wizard-step", { detail: { step } }),
  );
}

function RerunButton({ step }: { step: "Specialties" | "Congresses" | "Sources" | "Hashtags" }) {
  return (
    <button
      type="button"
      onClick={() => rerun(step)}
      className="font-mono text-[10px] uppercase tracking-wider text-accent hover:underline"
    >
      Re-run this step ↗
    </button>
  );
}

type Specialty = { id: string; label: string; description: string; sort_order: number };
type UserSpec = { specialty_id: string; is_primary: boolean };
type Source = { id: string; handle: string; display_name: string; role: string };
type Hashtag = { id: string; tag: string };
type Congress = { id: string; name?: string | null };

const MAX_SPECIALTIES = 3;

export function InterestsSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: specialties = [], isLoading: loadingSpecs } = useQuery({
    queryKey: ["urology-specialties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("urology_specialties")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as Specialty[];
    },
  });

  const { data: mine = [], isLoading: loadingMine } = useQuery({
    queryKey: ["user-specialties", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_specialties")
        .select("specialty_id, is_primary")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data as UserSpec[];
    },
  });

  const selectedIds = React.useMemo(() => new Set(mine.map((m) => m.specialty_id)), [mine]);
  const primaryId = React.useMemo(
    () => mine.find((m) => m.is_primary)?.specialty_id ?? null,
    [mine],
  );

  const toggleSpecialty = async (id: string) => {
    if (!user) return;
    if (selectedIds.has(id)) {
      await supabase.from("user_specialties").delete().eq("user_id", user.id).eq("specialty_id", id);
    } else {
      if (selectedIds.size >= MAX_SPECIALTIES) {
        toast.error(`Pick up to ${MAX_SPECIALTIES} specialties`);
        return;
      }
      const isFirst = selectedIds.size === 0;
      await supabase
        .from("user_specialties")
        .insert({ user_id: user.id, specialty_id: id, is_primary: isFirst });
    }
    qc.invalidateQueries({ queryKey: ["user-specialties", user.id] });
  };

  const setPrimary = async (id: string) => {
    if (!user) return;
    // Clear current primary, set new.
    await supabase
      .from("user_specialties")
      .update({ is_primary: false })
      .eq("user_id", user.id)
      .eq("is_primary", true);
    await supabase
      .from("user_specialties")
      .update({ is_primary: true })
      .eq("user_id", user.id)
      .eq("specialty_id", id);
    qc.invalidateQueries({ queryKey: ["user-specialties", user.id] });
  };

  return (
    <div className="grid grid-cols-12 gap-3">
      <Panel
        title="Specialties"
        className="col-span-12"
        actions={<RerunButton step="Specialties" />}
      >
        <p className="text-[12px] text-text-muted mb-4">
          Pick up to {MAX_SPECIALTIES}. The starred one is your primary focus and gets the highest weight in
          recommendations.
        </p>
        {loadingSpecs || loadingMine ? (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {specialties.map((s) => {
              const selected = selectedIds.has(s.id);
              const primary = primaryId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSpecialty(s.id)}
                  className={cn(
                    "relative text-left p-3 border rounded-[4px] transition-colors",
                    selected
                      ? "border-accent bg-accent/5"
                      : "border-border bg-panel hover:bg-panel-elevated/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-text-primary flex items-center gap-1.5">
                        {s.label}
                        {primary && (
                          <span className="text-[9px] font-mono uppercase tracking-wider text-accent border border-accent/40 px-1 py-px rounded-[2px]">
                            primary
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5 leading-snug">{s.description}</div>
                      <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted/70 mt-1">
                        {s.id}
                      </div>
                    </div>
                    {selected && (
                      <div className="flex flex-col items-end gap-1">
                        <Check className="w-3.5 h-3.5 text-accent shrink-0" />
                        {!primary && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              void setPrimary(s.id);
                            }}
                            className="text-[9px] font-mono uppercase tracking-wider text-text-muted hover:text-accent cursor-pointer"
                          >
                            <Star className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <SubscriptionsBlock />
    </div>
  );
}

function SubscriptionsBlock() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: subSources = [] } = useQuery({
    queryKey: ["user-subscribed-sources", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_subscribed_sources")
        .select("source_id, sources(id, handle, display_name, role)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as { source_id: string; sources: Source | null }[];
    },
  });

  const { data: subHashtags = [] } = useQuery({
    queryKey: ["user-subscribed-hashtags", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_subscribed_hashtags")
        .select("hashtag_id, hashtags(id, tag)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as { hashtag_id: string; hashtags: Hashtag | null }[];
    },
  });

  const { data: subCongresses = [] } = useQuery({
    queryKey: ["user-subscribed-congresses", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_subscribed_congresses")
        .select("congress_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data as { congress_id: string }[];
    },
  });

  const { data: allSources = [] } = useQuery({
    queryKey: ["all-sources-for-sub"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sources")
        .select("id, handle, display_name, role")
        .order("handle")
        .limit(500);
      if (error) throw error;
      return data as Source[];
    },
  });

  const { data: allHashtags = [] } = useQuery({
    queryKey: ["all-hashtags-for-sub"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hashtags")
        .select("id, tag")
        .order("tag")
        .limit(500);
      if (error) throw error;
      return data as Hashtag[];
    },
  });

  const subSourceIds = new Set(subSources.map((s) => s.source_id));
  const subHashtagIds = new Set(subHashtags.map((h) => h.hashtag_id));
  const subCongressIds = new Set(subCongresses.map((c) => c.congress_id));

  const [sourceQuery, setSourceQuery] = React.useState("");
  const [hashtagQuery, setHashtagQuery] = React.useState("");
  const [congressInput, setCongressInput] = React.useState("");

  const sourceMatches = React.useMemo(() => {
    if (!sourceQuery.trim()) return [];
    const q = sourceQuery.trim().toLowerCase().replace(/^@/, "");
    return allSources
      .filter((s) => !subSourceIds.has(s.id))
      .filter((s) => s.handle.toLowerCase().includes(q) || s.display_name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allSources, sourceQuery, subSourceIds]);

  const hashtagMatches = React.useMemo(() => {
    if (!hashtagQuery.trim()) return [];
    const q = hashtagQuery.trim().toLowerCase().replace(/^#/, "");
    return allHashtags
      .filter((h) => !subHashtagIds.has(h.id))
      .filter((h) => h.tag.toLowerCase().includes(q))
      .slice(0, 8);
  }, [allHashtags, hashtagQuery, subHashtagIds]);

  const subscribeSource = async (sourceId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("user_subscribed_sources")
      .insert({ user_id: user.id, source_id: sourceId });
    if (error) {
      toast.error(error.message);
      return;
    }
    setSourceQuery("");
    qc.invalidateQueries({ queryKey: ["user-subscribed-sources", user.id] });
  };

  const unsubscribeSource = async (sourceId: string) => {
    if (!user) return;
    await supabase.from("user_subscribed_sources").delete().eq("user_id", user.id).eq("source_id", sourceId);
    qc.invalidateQueries({ queryKey: ["user-subscribed-sources", user.id] });
  };

  const subscribeHashtag = async (hashtagId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("user_subscribed_hashtags")
      .insert({ user_id: user.id, hashtag_id: hashtagId });
    if (error) {
      toast.error(error.message);
      return;
    }
    setHashtagQuery("");
    qc.invalidateQueries({ queryKey: ["user-subscribed-hashtags", user.id] });
  };

  const unsubscribeHashtag = async (hashtagId: string) => {
    if (!user) return;
    await supabase
      .from("user_subscribed_hashtags")
      .delete()
      .eq("user_id", user.id)
      .eq("hashtag_id", hashtagId);
    qc.invalidateQueries({ queryKey: ["user-subscribed-hashtags", user.id] });
  };

  const subscribeCongress = async () => {
    if (!user) return;
    const id = congressInput.trim();
    if (!id) return;
    const { error } = await supabase
      .from("user_subscribed_congresses")
      .insert({ user_id: user.id, congress_id: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    setCongressInput("");
    qc.invalidateQueries({ queryKey: ["user-subscribed-congresses", user.id] });
  };

  const unsubscribeCongress = async (id: string) => {
    if (!user) return;
    await supabase
      .from("user_subscribed_congresses")
      .delete()
      .eq("user_id", user.id)
      .eq("congress_id", id);
    qc.invalidateQueries({ queryKey: ["user-subscribed-congresses", user.id] });
  };

  // suppress validation lint by referencing helpers (used by AddSource dialog elsewhere)
  void isValidHandle; void isValidHashtag; void normalizeHandle; void normalizeHashtag;

  return (
    <>
      <Panel
        title="Following · sources"
        className="col-span-12 xl:col-span-6"
        actions={<RerunButton step="Sources" />}
      >
        <p className="text-[12px] text-text-muted mb-3">
          Sources you follow appear in your Live Feed first.
        </p>
        <div className="flex gap-2 mb-3">
          <Input
            placeholder="Search sources by handle or name"
            value={sourceQuery}
            onChange={(e) => setSourceQuery(e.target.value)}
          />
        </div>
        {sourceMatches.length > 0 && (
          <div className="border border-border rounded-[3px] mb-3 divide-y divide-border">
            {sourceMatches.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => subscribeSource(s.id)}
                className="w-full text-left px-3 py-2 hover:bg-panel-elevated/60 flex items-center justify-between"
              >
                <span>
                  <span className="font-mono text-accent text-[12px]">@{s.handle}</span>{" "}
                  <span className="text-[12px] text-text-primary">{s.display_name}</span>
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                  {s.role}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {subSources.length === 0 && (
            <span className="text-[12px] text-text-muted italic">No sources followed yet.</span>
          )}
          {subSources.map((row) => (
            <span
              key={row.source_id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-[3px] border border-border bg-panel-elevated/40 text-[12px]"
            >
              <span className="font-mono text-accent">
                @{row.sources?.handle ?? row.source_id}
              </span>
              <button
                type="button"
                onClick={() => unsubscribeSource(row.source_id)}
                className="text-text-muted hover:text-text-primary"
                aria-label="Unsubscribe"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </Panel>

      <Panel
        title="Following · hashtags"
        className="col-span-12 xl:col-span-6"
        actions={<RerunButton step="Hashtags" />}
      >
        <p className="text-[12px] text-text-muted mb-3">
          Hashtags you follow are highlighted in the feed.
        </p>
        <div className="flex gap-2 mb-3">
          <Input
            placeholder="Search hashtags"
            value={hashtagQuery}
            onChange={(e) => setHashtagQuery(e.target.value)}
          />
        </div>
        {hashtagMatches.length > 0 && (
          <div className="border border-border rounded-[3px] mb-3 divide-y divide-border">
            {hashtagMatches.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => subscribeHashtag(h.id)}
                className="w-full text-left px-3 py-2 hover:bg-panel-elevated/60"
              >
                <span className="font-mono text-accent text-[12px]">#{h.tag}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {subHashtags.length === 0 && (
            <span className="text-[12px] text-text-muted italic">No hashtags followed yet.</span>
          )}
          {subHashtags.map((row) => (
            <span
              key={row.hashtag_id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-[3px] border border-border bg-panel-elevated/40 text-[12px]"
            >
              <span className="font-mono text-accent">#{row.hashtags?.tag ?? row.hashtag_id}</span>
              <button
                type="button"
                onClick={() => unsubscribeHashtag(row.hashtag_id)}
                className="text-text-muted hover:text-text-primary"
                aria-label="Unsubscribe"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </Panel>

      <Panel
        title="Following · congresses"
        className="col-span-12"
        actions={<RerunButton step="Congresses" />}
      >
        <p className="text-[12px] text-text-muted mb-3">
          Add congress IDs (e.g. <span className="font-mono text-accent">cong_eau26</span>). The wizard in Phase 2
          will let you pick from a list.
        </p>
        <div className="flex gap-2 mb-3 max-w-md">
          <Input
            placeholder="cong_eau26"
            value={congressInput}
            onChange={(e) => setCongressInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void subscribeCongress();
            }}
          />
          <Button onClick={() => void subscribeCongress()} disabled={!congressInput.trim()}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {subCongressIds.size === 0 && (
            <span className="text-[12px] text-text-muted italic">No congresses followed yet.</span>
          )}
          {Array.from(subCongressIds).map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-[3px] border border-border bg-panel-elevated/40 text-[12px]"
            >
              <span className="font-mono text-accent">{id}</span>
              <button
                type="button"
                onClick={() => unsubscribeCongress(id)}
                className="text-text-muted hover:text-text-primary"
                aria-label="Unsubscribe"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </Panel>
    </>
  );
}

export default InterestsSettings;