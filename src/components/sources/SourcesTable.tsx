import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, PlayCircle, Plus, Search, Database } from "lucide-react";
import { Panel } from "@/components/shell/Panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shell/EmptyState";
import { TableRowSkeleton } from "@/components/shell/Skeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { feedService } from "@/services/feedService";
import { cn } from "@/lib/utils";
import { RoleBadge } from "./RoleBadge";
import { SourceDrawer } from "./SourceDrawer";
import { AddSourceDialog } from "./AddSourceDialog";
import type { Source, SourceList } from "@/types";
import { useCanEdit } from "@/auth/permissions";
import { recordAudit } from "@/services/auditService";

const ALL = "__all__";

function formatLastSeen(iso?: string) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "soon";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SourcesTable() {
  const qc = useQueryClient();
  const canEdit = useCanEdit();
  const [query, setQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>(ALL);
  const [listFilter, setListFilter] = React.useState<string>(ALL);
  const [openAdd, setOpenAdd] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: () => feedService.listSources(),
  });
  const { data: lists = [] } = useQuery({
    queryKey: ["source-lists"],
    queryFn: () => feedService.listSourceLists(),
  });
  const listsById = React.useMemo(
    () =>
      Object.fromEntries(lists.map((l) => [l.id, l])) as Record<string, SourceList>,
    [lists],
  );

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      feedService.updateSource(id, { active }),
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: ["sources"] });
      const prev = qc.getQueryData<Source[]>(["sources"]);
      qc.setQueryData<Source[]>(["sources"], (old) =>
        (old ?? []).map((s) => (s.id === id ? { ...s, active } : s)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["sources"], ctx.prev);
      toast.error("Failed to toggle source");
    },
    onSuccess: (_d, { id, active }) => {
      const handle = sources.find((s) => s.id === id)?.handle ?? id;
      void recordAudit({
        action: "source.update",
        target_type: "source",
        target_id: id,
        summary: `${active ? "Activated" : "Deactivated"} @${handle}`,
        after: { active },
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });

  const test = useMutation({
    mutationFn: (id: string) => feedService.testSource(id),
    onSuccess: (tweets, id) => {
      const handle = sources.find((s) => s.id === id)?.handle ?? id;
      toast.success(`@${handle}: fetched ${tweets.length} recent tweets`, {
        description: tweets[0]?.text?.slice(0, 90) ?? "No recent tweets.",
      });
    },
    onError: () => toast.error("Source test failed"),
  });

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return sources.filter((s) => {
      if (roleFilter !== ALL && s.role !== roleFilter) return false;
      if (listFilter !== ALL && !(s.listIds ?? []).includes(listFilter)) return false;
      if (!q) return true;
      return (
        s.handle.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q) ||
        s.specialty.some((sp) => sp.toLowerCase().includes(q))
      );
    });
  }, [sources, query, roleFilter, listFilter]);

  const activeSource = sources.find((s) => s.id === activeId) ?? null;

  return (
    <>
      <Panel
        title={`Sources · ${filtered.length}/${sources.length}`}
        loading={isLoading}
        bodyClassName="flex flex-col gap-3"
        className="flex-1 w-full"
        actions={
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted px-2">
            view · table
          </span>
        }
      >
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search handles, names, specialty…"
              className="pl-7 h-8 font-mono text-[12px]"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-8 w-[120px] text-[12px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All roles</SelectItem>
              <SelectItem value="KOL">KOL</SelectItem>
              <SelectItem value="institution">Institution</SelectItem>
              <SelectItem value="journal">Journal</SelectItem>
              <SelectItem value="society">Society</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Select value={listFilter} onValueChange={setListFilter}>
            <SelectTrigger className="h-8 w-[150px] text-[12px]">
              <SelectValue placeholder="List" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All lists</SelectItem>
              {lists.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8"
            onClick={() => setOpenAdd(true)}
            disabled={!canEdit}
            title={canEdit ? "" : "Editor or admin role required"}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add source
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto border border-border rounded-sm">
          <table className="w-full text-[12px]">
            <thead className="bg-panel-elevated sticky top-0 z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-text-muted">
                <th className="px-3 py-2 font-medium">Handle</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Specialty</th>
                <th className="px-3 py-2 font-medium">Lists</th>
                <th className="px-3 py-2 font-medium text-center">Verified</th>
                <th className="px-3 py-2 font-medium text-center">Active</th>
                <th className="px-3 py-2 font-medium text-right">Last seen</th>
                <th className="px-3 py-2 font-medium text-right">Tweets</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={`sk-${i}`} cols={10} />
                ))}
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className={cn(
                    "border-t border-border hover:bg-panel-elevated/40 cursor-pointer transition-colors",
                    !s.active && "opacity-60",
                  )}
                  onClick={() => setActiveId(s.id)}
                >
                  <td className="px-3 py-1.5 font-mono text-accent whitespace-nowrap">
                    @{s.handle}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{s.displayName}</td>
                  <td className="px-3 py-1.5">
                    <RoleBadge role={s.role} />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {s.specialty.slice(0, 3).map((sp) => (
                        <span
                          key={sp}
                          className="px-1.5 h-4 inline-flex items-center text-[10px] rounded-sm bg-panel-elevated text-text-muted border border-border font-mono"
                        >
                          {sp}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {(s.listIds ?? []).map((id) => {
                        const l = listsById[id];
                        if (!l) return null;
                        return (
                          <span
                            key={id}
                            className="px-1.5 h-4 inline-flex items-center text-[10px] rounded-sm border font-mono"
                            style={{
                              borderColor: (l.color ?? "var(--border)") + "55",
                              color: l.color ?? "var(--text-muted)",
                              background: (l.color ?? "transparent") + "12",
                            }}
                          >
                            {l.name}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {s.verified ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-accent inline" />
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td
                    className="px-3 py-1.5 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Switch
                      checked={s.active}
                      onCheckedChange={(v) =>
                        toggleActive.mutate({ id: s.id, active: v })
                      }
                      disabled={!canEdit}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-text-muted whitespace-nowrap">
                    {formatLastSeen(s.lastSeenAt)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {s.tweetCount ?? 0}
                  </td>
                  <td
                    className="px-3 py-1.5 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => test.mutate(s.id)}
                      disabled={test.isPending || !canEdit}
                    >
                      <PlayCircle className="h-3 w-3 mr-1" />
                      Test
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={10} className="p-4">
                    <EmptyState
                      icon={Database}
                      caption={
                        sources.length === 0
                          ? "No sources yet · Add the first urology account you want to follow."
                          : "No sources match your filters."
                      }
                      action={
                        sources.length === 0
                          ? {
                              label: "Add source",
                              icon: Plus,
                              onClick: () => setOpenAdd(true),
                              disabled: !canEdit,
                              title: canEdit ? "" : "Editor or admin role required",
                            }
                          : undefined
                      }
                      secondary={
                        sources.length > 0
                          ? {
                              label: "clear filters",
                              onClick: () => {
                                setQuery("");
                                setRoleFilter(ALL);
                                setListFilter(ALL);
                              },
                            }
                          : undefined
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <AddSourceDialog open={openAdd} onOpenChange={setOpenAdd} />
      <SourceDrawer
        source={activeSource}
        lists={lists}
        open={!!activeSource}
        onOpenChange={(v) => !v && setActiveId(null)}
      />
    </>
  );
}