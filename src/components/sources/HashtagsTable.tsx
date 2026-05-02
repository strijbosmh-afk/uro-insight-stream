import * as React from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Trash2, Hash } from "lucide-react";
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
import { AddHashtagDialog } from "./AddHashtagDialog";
import type { Hashtag } from "@/types";
import { useCanEdit, useCanAdmin } from "@/auth/permissions";
import { recordAudit } from "@/services/auditService";

const ALL = "__all__";
const NONE = "__none__";
const DAY_MS = 24 * 60 * 60 * 1000;

export function HashtagsTable() {
  const qc = useQueryClient();
  const canEdit = useCanEdit();
  const canAdmin = useCanAdmin();
  const [query, setQuery] = React.useState("");
  const [congressFilter, setCongressFilter] = React.useState<string>(ALL);
  const [openAdd, setOpenAdd] = React.useState(false);

  const { data: hashtags = [], isLoading } = useQuery({
    queryKey: ["hashtags"],
    queryFn: () => feedService.listHashtags(),
  });
  const { data: congresses = [] } = useQuery({
    queryKey: ["congresses"],
    queryFn: () => feedService.listCongresses(),
  });

  const congressById = React.useMemo(
    () => Object.fromEntries(congresses.map((c) => [c.id, c])),
    [congresses],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    return hashtags.filter((h) => {
      if (congressFilter === NONE && h.congressId) return false;
      if (
        congressFilter !== ALL &&
        congressFilter !== NONE &&
        h.congressId !== congressFilter
      )
        return false;
      if (!q) return true;
      return h.tag.toLowerCase().replace(/^#/, "").includes(q);
    });
  }, [hashtags, query, congressFilter]);

  const counts = useQueries({
    queries: filtered.map((h) => ({
      queryKey: ["hashtag-count", h.id, h.tag],
      queryFn: () => feedService.countHashtagTweets(h.tag, DAY_MS),
      staleTime: 30_000,
    })),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      feedService.updateHashtag(id, { active }),
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: ["hashtags"] });
      const prev = qc.getQueryData<Hashtag[]>(["hashtags"]);
      qc.setQueryData<Hashtag[]>(["hashtags"], (old) =>
        (old ?? []).map((h) => (h.id === id ? { ...h, active } : h)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["hashtags"], ctx.prev);
      toast.error("Failed to toggle hashtag");
    },
    onSuccess: (_d, { id, active }) => {
      const tag = hashtags.find((h) => h.id === id)?.tag ?? id;
      void recordAudit({
        action: "hashtag.update",
        target_type: "hashtag",
        target_id: id,
        summary: `${active ? "Activated" : "Deactivated"} ${tag}`,
        after: { active },
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["hashtags"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => feedService.removeHashtag(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["hashtags"] });
      const prev = qc.getQueryData<Hashtag[]>(["hashtags"]);
      qc.setQueryData<Hashtag[]>(["hashtags"], (old) =>
        (old ?? []).filter((h) => h.id !== id),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["hashtags"], ctx.prev);
      toast.error("Failed to remove hashtag");
    },
    onSuccess: (_d, id) => {
      const tag = hashtags.find((h) => h.id === id)?.tag ?? id;
      toast.success("Hashtag removed");
      void recordAudit({
        action: "hashtag.delete",
        target_type: "hashtag",
        target_id: id,
        summary: `Removed ${tag}`,
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["hashtags"] }),
  });

  return (
    <>
      <Panel
        title={`Hashtags · ${filtered.length}/${hashtags.length}`}
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
              placeholder="Search hashtags…"
              className="pl-7 h-8 font-mono text-[12px]"
            />
          </div>
          <Select value={congressFilter} onValueChange={setCongressFilter}>
            <SelectTrigger className="h-8 w-[170px] text-[12px]">
              <SelectValue placeholder="Congress" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              <SelectItem value={NONE}>No congress</SelectItem>
              {congresses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.shortCode}
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
            Add hashtag
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto border border-border rounded-sm">
          <table className="w-full text-[12px]">
            <thead className="bg-panel-elevated sticky top-0 z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-text-muted">
                <th className="px-3 py-2 font-medium">Tag</th>
                <th className="px-3 py-2 font-medium">Congress</th>
                <th className="px-3 py-2 font-medium text-center">Active</th>
                <th className="px-3 py-2 font-medium text-right">Tweets / 24h</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRowSkeleton key={`sk-${i}`} cols={5} />
                ))}
              {filtered.map((h, i) => {
                const cnt = counts[i]?.data;
                const cong = h.congressId ? congressById[h.congressId] : null;
                return (
                  <tr
                    key={h.id}
                    className={cn(
                      "border-t border-border hover:bg-panel-elevated/40 transition-colors",
                      !h.active && "opacity-60",
                    )}
                  >
                    <td className="px-3 py-1.5 font-mono text-accent">{h.tag}</td>
                    <td className="px-3 py-1.5 text-text-muted">
                      {cong ? (
                        <span className="font-mono text-[11px]">{cong.shortCode}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <Switch
                        checked={h.active}
                        onCheckedChange={(v) =>
                          toggleActive.mutate({ id: h.id, active: v })
                        }
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {cnt ?? "…"}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px] text-text-muted hover:text-destructive"
                        onClick={() => remove.mutate(h.id)}
                        disabled={!canAdmin}
                        title={canAdmin ? "" : "Admin role required"}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={5} className="p-4">
                    <EmptyState
                      icon={Hash}
                      caption={
                        hashtags.length === 0
                          ? "No hashtags yet · Add a congress tag to start collecting tweets."
                          : "No hashtags match your filters."
                      }
                      action={
                        hashtags.length === 0
                          ? {
                              label: "Add hashtag",
                              icon: Plus,
                              onClick: () => setOpenAdd(true),
                              disabled: !canEdit,
                              title: canEdit ? "" : "Editor or admin role required",
                            }
                          : undefined
                      }
                      secondary={
                        hashtags.length > 0
                          ? {
                              label: "clear filters",
                              onClick: () => {
                                setQuery("");
                                setCongressFilter(ALL);
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

      <AddHashtagDialog
        open={openAdd}
        onOpenChange={setOpenAdd}
        congresses={congresses}
      />
    </>
  );
}