import * as React from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BadgeCheck, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/shell/Panel";
import { Badge } from "@/components/ui/badge";
import {
  listCancerAreas,
  listGroups,
  subscribeToGroup,
  unsubscribeFromGroup,
  type GroupSummary,
} from "@/serverFns/groups";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

export const Route = createFileRoute("/discover/groups")({
  head: () => ({
    meta: [
      { title: "Discover groups — UroFeed" },
      {
        name: "description",
        content:
          "Browse curated source groups by cancer area and subscribe in one click.",
      },
    ],
  }),
  component: DiscoverGroupsPage,
});

type SortMode = "popular" | "recent" | "alphabetical";

function DiscoverGroupsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetchAreas = useServerFn(listCancerAreas);
  const fetchGroups = useServerFn(listGroups);
  const subFn = useServerFn(subscribeToGroup);
  const unsubFn = useServerFn(unsubscribeFromGroup);

  const [areaId, setAreaId] = React.useState<string | "all">("all");
  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<SortMode>("popular");

  const { data: areas = [] } = useQuery({
    queryKey: ["cancer-areas"],
    queryFn: () => fetchAreas(),
    staleTime: 5 * 60_000,
  });

  // Default the chip to the user's primary cancer area on first load.
  const { data: myAreaIds = [] } = useQuery({
    queryKey: ["user-cancer-areas", user?.id ?? null],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_cancer_areas")
        .select("cancer_area_id, is_primary")
        .eq("user_id", user!.id);
      return (data ?? []) as Array<{ cancer_area_id: string; is_primary: boolean }>;
    },
    staleTime: 60_000,
  });
  React.useEffect(() => {
    if (areaId !== "all" || myAreaIds.length === 0) return;
    const primary = myAreaIds.find((r) => r.is_primary) ?? myAreaIds[0];
    if (primary) setAreaId(primary.cancer_area_id);
  }, [myAreaIds, areaId]);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["groups", { areaId, search, sort }],
    queryFn: () =>
      fetchGroups({
        data: {
          cancerAreaId: areaId === "all" ? undefined : areaId,
          search: search.trim() || undefined,
          sort,
        },
      }),
  });

  const subMut = useMutation({
    mutationFn: async (id: string) => subFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Subscribed");
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["my-groups"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const unsubMut = useMutation({
    mutationFn: async (id: string) => unsubFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Unsubscribed");
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["my-groups"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-3 overflow-y-auto">
      <header className="shrink-0 flex flex-col gap-3">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Discover groups</h1>
          <p className="text-[12px] text-text-muted mt-0.5">
            Curated bundles of sources. Subscribe to a group to follow every
            current and future member.
          </p>
        </div>

        {/* Cancer-area chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <ChipButton active={areaId === "all"} onClick={() => setAreaId("all")}>
            All cancers
          </ChipButton>
          {areas.map((a) => (
            <ChipButton
              key={a.id}
              active={areaId === a.id}
              onClick={() => setAreaId(a.id)}
            >
              {a.name}
            </ChipButton>
          ))}
        </div>

        {/* Search + sort */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search groups…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-8 text-[12px]"
          />
          <div className="flex items-center gap-1 ml-auto">
            {(["popular", "recent", "alphabetical"] as SortMode[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={
                  "text-[11px] font-mono uppercase tracking-wider px-2 py-1 rounded-[3px] " +
                  (sort === s
                    ? "bg-panel-elevated text-text-primary"
                    : "text-text-muted hover:text-text-primary")
                }
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading groups…
          </div>
        ) : groups.length === 0 ? (
          <Panel title="No groups found">
            <p className="text-[12px] text-text-muted">
              No groups match this filter. Try a different cancer area or
              clear your search.
            </p>
          </Panel>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                pending={subMut.isPending || unsubMut.isPending}
                onSubscribe={() => subMut.mutate(g.id)}
                onUnsubscribe={() => unsubMut.mutate(g.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "shrink-0 h-7 px-3 rounded-full border text-[12px] transition-colors " +
        (active
          ? "bg-accent/10 border-accent text-accent"
          : "bg-panel border-border text-text-muted hover:text-text-primary")
      }
    >
      {children}
    </button>
  );
}

function GroupCard({
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
    <div
      className={
        "rounded-[4px] p-3 flex flex-col gap-2 transition-colors border " +
        (subscribed
          ? "bg-accent/10 border-accent/40 text-text-primary"
          : "bg-panel border-border hover:border-accent/40")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to="/groups/$slug"
          params={{ slug: group.slug }}
          className="font-medium text-text-primary text-[14px] leading-tight hover:text-accent line-clamp-2"
        >
          {group.name}
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          {subscribed && (
            <Badge
              variant="outline"
              className="gap-1 text-[10px] uppercase tracking-wider border-accent/60 bg-accent/15 text-accent"
            >
              <BadgeCheck className="w-3 h-3" /> Subscribed
            </Badge>
          )}
          {group.visibility === "official" && (
            <Badge
              variant="outline"
              className="gap-1 text-[10px] uppercase tracking-wider border-accent/40 text-accent"
            >
              <BadgeCheck className="w-3 h-3" /> Official
            </Badge>
          )}
        </div>
      </div>

      {group.description && (
        <p className="text-[12px] text-text-muted line-clamp-2">{group.description}</p>
      )}

      <div className="flex items-center gap-1 flex-wrap">
        {group.cancer_areas.slice(0, 3).map((a) => (
          <span
            key={a.id}
            className="text-[10px] font-mono uppercase tracking-wider text-text-muted bg-panel-elevated/50 border border-border px-1.5 py-0.5 rounded"
          >
            {a.name}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-2 flex items-center justify-between border-t border-border">
        <div className="flex items-center gap-3 text-[10px] font-mono text-text-muted">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {group.member_count} {group.member_count === 1 ? "source" : "sources"}
          </span>
          <span>{group.subscriber_count} subscribers</span>
        </div>
        {group.is_subscribed ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={onUnsubscribe}
            className="h-7 text-[11px]"
          >
            Subscribed
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pending}
            onClick={onSubscribe}
            className="h-7 text-[11px]"
          >
            Subscribe
          </Button>
        )}
      </div>
    </div>
  );
}