import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useFollowSource, useUnfollowSource } from "@/hooks/useHandleActions";
import {
  listGroups,
  subscribeToGroup,
  unsubscribeFromGroup,
  type GroupSummary,
} from "@/serverFns/groups";
import { toTitleCase } from "@/lib/title-case";

type TabValue = "for-you" | "by-specialty" | "by-group";

interface Props {
  tab: TabValue;
  onTabChange: (t: TabValue) => void;
}

interface CardItem {
  key: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean;
  bio: string | null;
  role: string | null;
  reason: string;
  signal: number;
  isFollowing: boolean;
}

const TAB_OPTIONS: Array<{ v: TabValue; label: string }> = [
  { v: "for-you", label: "For you" },
  { v: "by-specialty", label: "By specialty" },
  { v: "by-group", label: "By group" },
];

export function MobileDiscover({ tab, onTabChange }: Props) {
  const { user } = useAuth();
  const [query, setQuery] = React.useState("");
  const [verifiedOnly, setVerifiedOnly] = React.useState(false);
  const [specialtyFilter, setSpecialtyFilter] = React.useState<Set<string>>(
    new Set(),
  );
  const [minSignal, setMinSignal] = React.useState(0);
  const [filterOpen, setFilterOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-3 pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur -mx-4 px-4 pt-2 pb-2 border-b border-border">
        <h1 className="text-[18px] font-semibold text-text-primary mb-2">
          Discover
        </h1>
        <div className="flex items-center gap-2 overflow-x-auto -mx-4 px-4 pb-1">
          {TAB_OPTIONS.map((t) => {
            const active = tab === t.v;
            return (
              <button
                key={t.v}
                type="button"
                onClick={() => onTabChange(t.v)}
                className={
                  "shrink-0 h-9 px-4 rounded-full border text-[13px] font-medium transition-colors " +
                  (active
                    ? "bg-accent border-accent text-accent-foreground"
                    : "bg-panel border-border text-text-primary")
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search by name, handle, or topic…"
              className="w-full h-10 pl-9 pr-3 rounded-[3px] border border-border bg-panel text-[14px] font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-label="Filter"
            className="shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-[3px] border border-border bg-panel text-text-primary"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {tab === "by-group" ? (
        <MobileGroupsList
          query={query}
          verifiedOnly={verifiedOnly}
        />
      ) : (
        <MobilePeopleList
          tab={tab}
          query={query}
          verifiedOnly={verifiedOnly}
          specialtyFilter={specialtyFilter}
          minSignal={minSignal}
        />
      )}

      <FilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        verifiedOnly={verifiedOnly}
        setVerifiedOnly={setVerifiedOnly}
        specialtyFilter={specialtyFilter}
        setSpecialtyFilter={setSpecialtyFilter}
        minSignal={minSignal}
        setMinSignal={setMinSignal}
        userId={user?.id ?? null}
      />
    </div>
  );
}

/* ============================== People list ============================== */

function MobilePeopleList({
  tab,
  query,
  verifiedOnly,
  specialtyFilter,
  minSignal,
}: {
  tab: TabValue;
  query: string;
  verifiedOnly: boolean;
  specialtyFilter: Set<string>;
  minSignal: number;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const followMut = useFollowSource();
  const unfollowMut = useUnfollowSource();
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [confirmUnfollow, setConfirmUnfollow] = React.useState<string | null>(
    null,
  );

  // Followed source ids for "isFollowing" status
  const { data: followedSet = new Set<string>() } = useQuery({
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

  // For You candidates
  const forYou = useQuery({
    queryKey: ["mobile-disc-foryou", user?.id],
    enabled: !!user && tab === "for-you",
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: cands }, { data: dismissals }] = await Promise.all([
        supabase
          .from("source_candidates")
          .select(
            "handle, display_name, avatar_url, verified, bio, total_signal, reply_count, quote_count, mention_count",
          )
          .eq("enrichment_status", "enriched")
          .order("total_signal", { ascending: false })
          .limit(60),
        supabase
          .from("source_candidate_dismissals")
          .select("handle")
          .eq("user_id", user!.id),
      ]);
      const dismissed = new Set((dismissals ?? []).map((d) => d.handle));
      return (cands ?? []).filter((c) => !dismissed.has(c.handle));
    },
  });

  // By specialty recs
  const { data: mySpecialties = [] } = useQuery({
    queryKey: ["user-specialties", user?.id],
    enabled: !!user && tab === "by-specialty",
    queryFn: async () => {
      const { data } = await supabase
        .from("user_specialties")
        .select("specialty_id, is_primary")
        .eq("user_id", user!.id);
      return (data ?? []) as Array<{ specialty_id: string; is_primary: boolean }>;
    },
  });
  const specialtyIds = mySpecialties.map((s) => s.specialty_id);

  const bySpecialty = useQuery({
    queryKey: ["mobile-disc-by-spec", specialtyIds.join(",")],
    enabled: tab === "by-specialty" && specialtyIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("recommended_sources_by_specialty")
        .select(
          "source_id, specialty_id, weight, sources(id, handle, display_name, avatar_url, verified, bio)",
        )
        .in("specialty_id", specialtyIds)
        .order("weight", { ascending: false });
      return (data ?? []) as Array<{
        source_id: string;
        specialty_id: string;
        weight: number;
        sources: {
          id: string;
          handle: string;
          display_name: string | null;
          avatar_url: string | null;
          verified: boolean | null;
          bio: string | null;
        } | null;
      }>;
    },
  });

  const items: CardItem[] = React.useMemo(() => {
    if (tab === "for-you") {
      return (forYou.data ?? []).map((c) => ({
        key: c.handle,
        handle: c.handle,
        display_name: c.display_name,
        avatar_url: c.avatar_url,
        verified: !!c.verified,
        bio: c.bio,
        role: null,
        signal: c.total_signal ?? 0,
        reason: `${c.reply_count ?? 0} replies · ${c.quote_count ?? 0} quotes · ${c.mention_count ?? 0} mentions from people you follow`,
        isFollowing: followedSet.has(c.handle),
      }));
    }
    if (tab === "by-specialty") {
      const seen = new Set<string>();
      const out: CardItem[] = [];
      for (const r of bySpecialty.data ?? []) {
        const s = r.sources;
        if (!s) continue;
        if (seen.has(s.handle)) continue;
        seen.add(s.handle);
        out.push({
          key: s.handle,
          handle: s.handle,
          display_name: s.display_name,
          avatar_url: s.avatar_url,
          verified: !!s.verified,
          bio: s.bio,
          role: null,
          signal: r.weight,
          reason: `Curated for your specialty · weight ${r.weight}`,
          isFollowing: followedSet.has(s.id) || followedSet.has(s.handle),
        });
      }
      return out;
    }
    return [];
  }, [tab, forYou.data, bySpecialty.data, followedSet]);

  const filtered = React.useMemo(() => {
    return items.filter((c) => {
      if (verifiedOnly && !c.verified) return false;
      if (minSignal && c.signal < minSignal) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        const hay =
          c.handle.toLowerCase() +
          " " +
          (c.display_name ?? "").toLowerCase() +
          " " +
          (c.bio ?? "").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, verifiedOnly, query, minSignal]);

  const isLoading = tab === "for-you" ? forYou.isLoading : bySpecialty.isLoading;

  const exitSelection = () => {
    setSelectionMode(false);
    setSelected(new Set());
  };

  const toggleSelect = (handle: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  };

  const followOne = async (handle: string) => {
    try {
      await followMut.mutateAsync({ handle, needsLookup: true });
      toast.success(`Following @${handle}`);
      qc.invalidateQueries({ queryKey: ["user-followed-source-ids"] });
    } catch (err) {
      toast.error(`Couldn't follow @${handle}`, {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const followBulk = async () => {
    const handles = Array.from(selected);
    let ok = 0;
    for (const h of handles) {
      try {
        await followMut.mutateAsync({ handle: h, needsLookup: true });
        ok++;
      } catch {
        /* keep going */
      }
    }
    toast.success(`Followed ${ok} of ${handles.length}`);
    qc.invalidateQueries({ queryKey: ["user-followed-source-ids"] });
    exitSelection();
  };

  const doUnfollow = async (handle: string) => {
    try {
      await unfollowMut.mutateAsync({ handle });
      toast.success(`Unfollowed @${handle}`);
      qc.invalidateQueries({ queryKey: ["user-followed-source-ids"] });
    } catch (err) {
      toast.error(`Couldn't unfollow`, {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (tab === "by-specialty" && specialtyIds.length === 0) {
    return (
      <EmptyCard
        text="Set your specialties to see curated recommendations."
        actionLabel="Choose specialties"
        onAction={() =>
          window.dispatchEvent(
            new CustomEvent("urofeed:open-wizard-step", {
              detail: { step: "Specialties" },
            }),
          )
        }
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyCard
        text={
          tab === "for-you"
            ? "No suggestions yet. Follow a few KOLs first to see who they engage with."
            : "No curated recommendations match. Try another lens."
        }
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {filtered.map((c) => (
          <PersonCard
            key={c.key}
            card={c}
            expanded={expanded.has(c.key)}
            onToggleExpand={() =>
              setExpanded((prev) => {
                const n = new Set(prev);
                if (n.has(c.key)) n.delete(c.key);
                else n.add(c.key);
                return n;
              })
            }
            selectionMode={selectionMode}
            isSelected={selected.has(c.handle)}
            onToggleSelect={() => toggleSelect(c.handle)}
            onLongPress={() => {
              if (!selectionMode) {
                setSelectionMode(true);
                setSelected(new Set([c.handle]));
              }
            }}
            onFollow={() => followOne(c.handle)}
            onUnfollow={() => setConfirmUnfollow(c.handle)}
            isPending={followMut.isPending}
          />
        ))}
      </div>

      {selectionMode && (
        <div
          className="fixed left-0 right-0 z-30 border-t border-border bg-panel-elevated px-4 py-3 flex items-center gap-2"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}
        >
          <span className="text-[13px] font-mono text-text-primary">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={exitSelection}
            className="ml-auto h-10 px-4 rounded-[3px] border border-border text-[13px] text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || followMut.isPending}
            onClick={followBulk}
            className="h-10 px-4 rounded-[3px] bg-accent text-accent-foreground text-[13px] font-medium disabled:opacity-50"
          >
            Follow all {selected.size}
          </button>
        </div>
      )}

      <AlertDialog
        open={!!confirmUnfollow}
        onOpenChange={(o) => !o && setConfirmUnfollow(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unfollow @{confirmUnfollow}?</AlertDialogTitle>
            <AlertDialogDescription>
              You won't see new posts from this account. Existing posts remain in
              your feed history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmUnfollow) void doUnfollow(confirmUnfollow);
                setConfirmUnfollow(null);
              }}
            >
              Unfollow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PersonCard({
  card,
  expanded,
  onToggleExpand,
  selectionMode,
  isSelected,
  onToggleSelect,
  onLongPress,
  onFollow,
  onUnfollow,
  isPending,
}: {
  card: CardItem;
  expanded: boolean;
  onToggleExpand: () => void;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onLongPress: () => void;
  onFollow: () => void;
  onUnfollow: () => void;
  isPending: boolean;
}) {
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const triggered = React.useRef(false);
  const startPress = () => {
    triggered.current = false;
    longPressTimer.current = setTimeout(() => {
      triggered.current = true;
      try {
        navigator.vibrate?.(10);
      } catch {
        /* noop */
      }
      onLongPress();
    }, 500);
  };
  const endPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchCancel={endPress}
      onTouchMove={endPress}
      className={
        "relative w-full bg-panel border rounded-[3px] p-3 flex flex-col gap-3 " +
        (isSelected ? "border-accent" : "border-border")
      }
    >
      {selectionMode && (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-label={isSelected ? "Deselect" : "Select"}
          className={
            "absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center " +
            (isSelected
              ? "bg-accent border-accent text-accent-foreground"
              : "border-border bg-panel-elevated")
          }
        >
          {isSelected && <Check className="w-3.5 h-3.5" />}
        </button>
      )}
      <div className="flex items-start gap-3">
        {card.avatar_url ? (
          <img
            src={card.avatar_url}
            alt=""
            loading="lazy"
            className="w-12 h-12 rounded-full bg-panel-elevated shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-panel-elevated shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[15px] font-semibold text-text-primary truncate">
              {card.display_name || `@${card.handle}`}
            </span>
            {card.verified && (
              <BadgeCheck className="w-4 h-4 text-accent shrink-0" />
            )}
          </div>
          <div className="text-[12px] font-mono text-text-muted truncate">
            @{card.handle}
          </div>
          {card.role && (
            <div className="text-[11px] text-text-muted mt-0.5">{card.role}</div>
          )}
        </div>
      </div>
      <p className="text-[13px] text-text-muted leading-relaxed">
        {card.reason}
      </p>
      {card.bio && (
        <button
          type="button"
          onClick={onToggleExpand}
          className="self-start inline-flex items-center gap-1 text-[12px] font-mono uppercase tracking-wider text-accent"
        >
          {expanded ? (
            <>
              Less <ChevronUp className="w-3 h-3" />
            </>
          ) : (
            <>
              More <ChevronDown className="w-3 h-3" />
            </>
          )}
        </button>
      )}
      {expanded && card.bio && (
        <p className="text-[13px] text-text-primary leading-relaxed">
          {card.bio}
        </p>
      )}
      {card.isFollowing ? (
        <button
          type="button"
          onClick={onUnfollow}
          className="w-full h-11 rounded-[3px] border border-border bg-panel-elevated text-text-primary text-[14px] font-medium inline-flex items-center justify-center gap-1.5"
        >
          <Check className="w-4 h-4" />
          Following
        </button>
      ) : (
        <button
          type="button"
          onClick={onFollow}
          disabled={isPending}
          className="w-full h-11 rounded-[3px] bg-accent text-accent-foreground text-[14px] font-semibold disabled:opacity-50"
        >
          Follow
        </button>
      )}
    </div>
  );
}

/* ============================== Groups list ============================== */

function MobileGroupsList({
  query,
  verifiedOnly,
}: {
  query: string;
  verifiedOnly: boolean;
}) {
  void verifiedOnly; // not relevant for groups
  const qc = useQueryClient();
  const fetchGroups = useServerFn(listGroups);
  const subFn = useServerFn(subscribeToGroup);
  const unsubFn = useServerFn(unsubscribeFromGroup);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["mobile-groups", query],
    queryFn: () =>
      fetchGroups({
        data: { search: query.trim() || undefined, sort: "popular" },
      }),
  });

  const subMut = useMutation({
    mutationFn: async (id: string) => subFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Subscribed");
      qc.invalidateQueries({ queryKey: ["mobile-groups"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const unsubMut = useMutation({
    mutationFn: async (id: string) => unsubFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Unsubscribed");
      qc.invalidateQueries({ queryKey: ["mobile-groups"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading groups…
      </div>
    );
  }

  if (groups.length === 0) {
    return <EmptyCard text="No groups available yet." />;
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => (
        <MobileGroupCard
          key={g.id}
          group={g}
          pending={subMut.isPending || unsubMut.isPending}
          onSubscribe={() => subMut.mutate(g.id)}
          onUnsubscribe={() => unsubMut.mutate(g.id)}
        />
      ))}
    </div>
  );
}

function MobileGroupCard({
  group,
  pending,
  onSubscribe,
  onUnsubscribe,
}: {
  group: GroupSummary;
  pending: boolean;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
}) {
  const subscribed = group.is_subscribed;
  return (
    <div className="w-full bg-panel border border-border rounded-[3px] p-3 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <Link
          to="/groups/$slug"
          params={{ slug: group.slug }}
          className="text-[15px] font-semibold text-text-primary hover:text-accent flex-1"
        >
          {toTitleCase(group.name)}
        </Link>
        {group.visibility === "official" && (
          <BadgeCheck className="w-4 h-4 text-accent shrink-0 mt-1" />
        )}
      </div>
      {group.description && (
        <p className="text-[13px] text-text-muted leading-relaxed line-clamp-3">
          {group.description}
        </p>
      )}
      <div className="flex items-center gap-3 text-[11px] font-mono text-text-muted">
        <span className="inline-flex items-center gap-1">
          <Users className="w-3 h-3" />
          {group.member_count}
        </span>
        <span>{group.subscriber_count} subscribers</span>
      </div>
      {subscribed ? (
        <button
          type="button"
          onClick={onUnsubscribe}
          disabled={pending}
          className="w-full h-11 rounded-[3px] border border-border bg-panel-elevated text-text-primary text-[14px] font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Check className="w-4 h-4" /> Subscribed
        </button>
      ) : (
        <button
          type="button"
          onClick={onSubscribe}
          disabled={pending}
          className="w-full h-11 rounded-[3px] bg-accent text-accent-foreground text-[14px] font-semibold disabled:opacity-50"
        >
          Subscribe
        </button>
      )}
    </div>
  );
}

/* ============================== Filter sheet ============================== */

function FilterSheet({
  open,
  onOpenChange,
  verifiedOnly,
  setVerifiedOnly,
  specialtyFilter,
  setSpecialtyFilter,
  minSignal,
  setMinSignal,
  userId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  verifiedOnly: boolean;
  setVerifiedOnly: (v: boolean) => void;
  specialtyFilter: Set<string>;
  setSpecialtyFilter: React.Dispatch<React.SetStateAction<Set<string>>>;
  minSignal: number;
  setMinSignal: (n: number) => void;
  userId: string | null;
}) {
  const { data: specialties = [] } = useQuery({
    queryKey: ["user-specialties-with-meta", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_specialties")
        .select("specialty_id, urology_specialties(id, label)")
        .eq("user_id", userId!);
      return ((data ?? []) as Array<{
        specialty_id: string;
        urology_specialties: { id: string; label: string } | null;
      }>).flatMap((r) =>
        r.urology_specialties ? [r.urology_specialties] : [],
      );
    },
  });

  const reset = () => {
    setVerifiedOnly(false);
    setSpecialtyFilter(new Set());
    setMinSignal(0);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle>Filter</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-auto p-4 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-[14px] text-text-primary">Verified only</span>
            <Switch
              checked={verifiedOnly}
              onCheckedChange={(v) => setVerifiedOnly(!!v)}
            />
          </div>

          {specialties.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
                Specialties
              </div>
              <div className="flex flex-wrap gap-2">
                {specialties.map((s) => {
                  const on = specialtyFilter.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setSpecialtyFilter((prev) => {
                          const n = new Set(prev);
                          if (n.has(s.id)) n.delete(s.id);
                          else n.add(s.id);
                          return n;
                        })
                      }
                      className={
                        "h-9 px-3 rounded-full border text-[12px] " +
                        (on
                          ? "bg-accent/10 border-accent text-accent"
                          : "bg-panel border-border text-text-muted")
                      }
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Minimum signal score
              </span>
              <span className="text-[12px] font-mono text-text-primary">
                {minSignal}
              </span>
            </div>
            <Slider
              value={[minSignal]}
              onValueChange={([v]) => setMinSignal(v ?? 0)}
              min={0}
              max={20}
              step={1}
            />
          </div>
        </div>
        <div className="border-t border-border p-3 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="flex-1 h-11 rounded-[3px] border border-border text-text-primary text-[13px]"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-1 h-11 rounded-[3px] bg-accent text-accent-foreground text-[13px] font-medium"
          >
            Apply
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ============================== Empty card ============================== */

function EmptyCard({
  text,
  actionLabel,
  onAction,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="bg-panel border border-border rounded-[3px] p-6 flex flex-col items-center text-center gap-3">
      <X className="w-6 h-6 text-text-muted" />
      <p className="text-[13px] text-text-muted">{text}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="h-10 px-4 rounded-[3px] bg-accent text-accent-foreground text-[13px] font-medium"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default MobileDiscover;
