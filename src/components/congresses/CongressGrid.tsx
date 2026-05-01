import * as React from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function CongressGrid() {
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL);
  const [openNew, setOpenNew] = React.useState(false);

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

  const computeSourceCount = (c: Congress) => {
    const ids = c.sourceListIds;
    if (!ids || !ids.length) return allSources.length;
    return allSources.filter((s) => s.listIds?.some((x) => ids.includes(x))).length;
  };

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button size="sm" className="h-7" onClick={() => setOpenNew(true)}>
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

          {filtered.length === 0 && !isLoading && (
            <div className="text-text-muted text-[12px]">
              No congresses match the current filter.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((c) => {
              const sess = sessionsById[c.id] ?? [];
              const lastSync = sess.length
                ? sess.map((s) => s.endTime).sort().reverse()[0]
                : undefined;
              return (
                <CongressCard
                  key={c.id}
                  congress={c}
                  sourceCount={computeSourceCount(c)}
                  sessionCount={sess.length}
                  lastSyncIso={lastSync}
                />
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