import * as React from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Plus, Search, GripVertical } from "lucide-react";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shell/EmptyState";
import { CardSkeleton } from "@/components/shell/Skeletons";
import { CalendarRange } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { feedService } from "@/services/feedService";
import { CongressCard } from "./CongressCard";
import { NewCongressDialog } from "./NewCongressDialog";
import { useCanEdit } from "@/auth/permissions";
import type { Congress } from "@/types";

const ALL = "__all__";
const ORDER_KEY = "urofeed:congress-order:v1";

function loadOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function saveOrder(ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function CongressGrid() {
  const canEdit = useCanEdit();
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL);
  const [openNew, setOpenNew] = React.useState(false);
  const [order, setOrder] = React.useState<string[]>(() => loadOrder());
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  const { data: congresses = [], isLoading } = useQuery({
    queryKey: ["congresses"],
    queryFn: () => feedService.listCongresses(),
  });
  const { data: lists = [] } = useQuery({
    queryKey: ["source-lists"],
    queryFn: () => feedService.listSourceLists(),
  });
  const { data: allSources = [] } = useQuery({
    queryKey: ["sources"],
    queryFn: () => feedService.listSources(),
  });

  // Per-congress session lists (stable, lightweight) for counts + last sync.
  const sessionQueries = useQueries({
    queries: congresses.map((c) => ({
      queryKey: ["congress-sessions", c.id],
      queryFn: () => feedService.listSessions(c.id),
    })),
  });
  const sessionsById: Record<string, ReturnType<typeof feedService.listSessions> extends Promise<infer R> ? R : never> = {};
  congresses.forEach((c, i) => {
    sessionsById[c.id] = (sessionQueries[i]?.data ?? []) as never;
  });

  const filtered = congresses.filter((c) => {
    if (statusFilter !== ALL && c.status !== statusFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.shortCode.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.primaryHashtags.some((h) => h.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Apply user-defined order; new congresses appear at the end.
  const orderedFiltered = React.useMemo(() => {
    const idx = new Map(order.map((id, i) => [id, i] as const));
    return [...filtered].sort((a, b) => {
      const ai = idx.has(a.id) ? (idx.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
      const bi = idx.has(b.id) ? (idx.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return 0;
    });
  }, [filtered, order]);

  const reorder = React.useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return;
      const allIds = orderedFiltered.map((c) => c.id);
      // Build a full ordered list including unfiltered congresses (preserve their relative position).
      const fullCurrent = [
        ...orderedFiltered.map((c) => c.id),
        ...congresses.filter((c) => !allIds.includes(c.id)).map((c) => c.id),
      ];
      const from = fullCurrent.indexOf(sourceId);
      const to = fullCurrent.indexOf(targetId);
      if (from === -1 || to === -1) return;
      const next = [...fullCurrent];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setOrder(next);
      saveOrder(next);
    },
    [orderedFiltered, congresses],
  );

  const computeSourceCount = (c: Congress) => {
    const ids = c.sourceListIds;
    if (!ids || !ids.length) return allSources.length;
    return allSources.filter((s) => s.listIds?.some((x) => ids.includes(x))).length;
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        className="h-7"
        onClick={() => setOpenNew(true)}
        disabled={!canEdit}
        title={canEdit ? "" : "Editor or admin role required"}
      >
        <Plus className="w-3 h-3 mr-1" /> New congress
      </Button>
      <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted px-2">
        view · default
      </span>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-12 gap-3 h-full">
        <Panel
          title="Congresses"
          className="col-span-12"
          actions={headerActions}
          loading={isLoading}
          bodyClassName="overflow-auto"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search congress, city, hashtag…"
                className="h-8 pl-8 text-[12px]"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-36 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <div className="ml-auto text-[10px] font-mono uppercase tracking-wider text-text-muted">
              {filtered.length} / {congresses.length}
            </div>
          </div>

          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={`sk-${i}`} />
              ))}
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <EmptyState
              icon={CalendarRange}
              caption={
                congresses.length === 0
                  ? "No congresses yet · Create one to start tracking sessions, abstracts, and live commentary."
                  : "No congresses match the current filter."
              }
              action={
                congresses.length === 0
                  ? {
                      label: "New congress",
                      icon: Plus,
                      onClick: () => setOpenNew(true),
                      disabled: !canEdit,
                      title: canEdit ? "" : "Editor or admin role required",
                    }
                  : undefined
              }
              secondary={
                congresses.length > 0
                  ? {
                      label: "clear filters",
                      onClick: () => {
                        setQuery("");
                        setStatusFilter(ALL);
                      },
                    }
                  : undefined
              }
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {orderedFiltered.map((c) => {
              const sess = sessionsById[c.id] ?? [];
              const lastSync = sess.length
                ? sess.map((s) => s.endTime).sort().reverse()[0]
                : undefined;
              return (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(c.id);
                    e.dataTransfer.effectAllowed = "move";
                    try {
                      e.dataTransfer.setData("text/plain", c.id);
                    } catch {
                      /* some browsers require this */
                    }
                  }}
                  onDragEnter={() => {
                    if (dragId && dragId !== c.id) setOverId(c.id);
                  }}
                  onDragOver={(e) => {
                    if (dragId) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDragLeave={() => {
                    if (overId === c.id) setOverId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const src = dragId ?? e.dataTransfer.getData("text/plain");
                    if (src) reorder(src, c.id);
                    setDragId(null);
                    setOverId(null);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  className={cn(
                    "relative group/drag transition-opacity",
                    dragId === c.id && "opacity-40",
                    overId === c.id && dragId && dragId !== c.id && "ring-2 ring-accent rounded-[4px]",
                  )}
                >
                  <span
                    className="absolute -left-1 top-1/2 -translate-y-1/2 z-10 cursor-grab active:cursor-grabbing opacity-0 group-hover/drag:opacity-100 transition-opacity bg-panel-elevated border border-border rounded-[2px] p-0.5"
                    title="Drag to reorder"
                    aria-hidden
                  >
                    <GripVertical className="w-3 h-3 text-text-muted" />
                  </span>
                  <CongressCard
                    congress={c}
                    sourceCount={computeSourceCount(c)}
                    sessionCount={sess.length}
                    lastSyncIso={lastSync}
                  />
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
      <NewCongressDialog open={openNew} onOpenChange={setOpenNew} lists={lists} />
    </>
  );
}

export default CongressGrid;