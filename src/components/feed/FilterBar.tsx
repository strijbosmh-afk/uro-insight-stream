import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { feedService } from "@/services/feedService";
import { useFeedFilters } from "./FeedFilterContext";

const ALL = "__all__";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-muted">
      {children}
    </span>
  );
}

export function FilterBar() {
  const { filters, patch, reset } = useFeedFilters();

  const { data: congresses = [] } = useQuery({
    queryKey: ["congresses"],
    queryFn: () => feedService.listCongresses(),
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["congress-sessions", filters.congressId ?? "__none__"],
    queryFn: () =>
      filters.congressId
        ? feedService.listSessions(filters.congressId)
        : Promise.resolve([]),
    enabled: Boolean(filters.congressId),
  });
  const { data: lists = [] } = useQuery({
    queryKey: ["source-lists"],
    queryFn: () => feedService.listSourceLists(),
  });
  const { data: hashtags = [] } = useQuery({
    queryKey: ["hashtags"],
    queryFn: () => feedService.listHashtags(),
  });

  const activeCount =
    (filters.congressId ? 1 : 0) +
    (filters.sessionId ? 1 : 0) +
    (filters.sourceListId ? 1 : 0) +
    filters.hashtags.length +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.language ? 1 : 0);

  return (
    <div className="flex flex-wrap items-end gap-3 px-3 py-2 border-b border-border bg-panel-elevated/40">
      <div className="flex flex-col gap-1">
        <FieldLabel>Congress</FieldLabel>
        <Select
          value={filters.congressId ?? ALL}
          onValueChange={(v) =>
            patch({ congressId: v === ALL ? null : v, sessionId: null })
          }
        >
          <SelectTrigger className="h-7 w-44 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All congresses</SelectItem>
            {congresses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.shortCode} — {c.city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <FieldLabel>Session</FieldLabel>
        <Select
          value={filters.sessionId ?? ALL}
          onValueChange={(v) => patch({ sessionId: v === ALL ? null : v })}
          disabled={!filters.congressId}
        >
          <SelectTrigger className="h-7 w-56 text-[12px]">
            <SelectValue placeholder={filters.congressId ? "All sessions" : "—"} />
          </SelectTrigger>
          <SelectContent className="max-w-[420px]">
            <SelectItem value={ALL}>All sessions</SelectItem>
            {sessions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.title.slice(0, 60)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <FieldLabel>Source list</FieldLabel>
        <Select
          value={filters.sourceListId ?? ALL}
          onValueChange={(v) => patch({ sourceListId: v === ALL ? null : v })}
        >
          <SelectTrigger className="h-7 w-40 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sources</SelectItem>
            {lists.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1 min-w-0">
        <FieldLabel>Hashtags</FieldLabel>
        <div className="flex flex-wrap items-center gap-1 max-w-[420px]">
          {hashtags.slice(0, 14).map((h) => {
            const on = filters.hashtags.includes(h.tag);
            return (
              <button
                key={h.id}
                type="button"
                onClick={() =>
                  patch({
                    hashtags: on
                      ? filters.hashtags.filter((x) => x !== h.tag)
                      : [...filters.hashtags, h.tag],
                  })
                }
                className={
                  "h-6 px-1.5 text-[10px] font-mono border rounded-[2px] transition-colors " +
                  (on
                    ? "border-accent text-accent bg-accent/10"
                    : "border-border text-text-muted hover:text-text-primary")
                }
              >
                {h.tag}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <FieldLabel>From</FieldLabel>
        <Input
          type="date"
          value={filters.dateFrom ?? ""}
          onChange={(e) => patch({ dateFrom: e.target.value || null })}
          className="h-7 w-36 text-[12px] font-mono"
        />
      </div>
      <div className="flex flex-col gap-1">
        <FieldLabel>To</FieldLabel>
        <Input
          type="date"
          value={filters.dateTo ?? ""}
          onChange={(e) => patch({ dateTo: e.target.value || null })}
          className="h-7 w-36 text-[12px] font-mono"
        />
      </div>

      <div className="flex flex-col gap-1">
        <FieldLabel>Language</FieldLabel>
        <Select
          value={filters.language ?? ALL}
          onValueChange={(v) => patch({ language: v === ALL ? null : v })}
        >
          <SelectTrigger className="h-7 w-28 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All</SelectItem>
            <SelectItem value="en">EN</SelectItem>
            <SelectItem value="fr">FR</SelectItem>
            <SelectItem value="es">ES</SelectItem>
            <SelectItem value="de">DE</SelectItem>
            <SelectItem value="it">IT</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="h-7 px-2 text-[11px] text-text-muted hover:text-text-primary self-end"
        >
          <X className="w-3 h-3 mr-1" />
          Clear ({activeCount})
        </Button>
      )}
    </div>
  );
}