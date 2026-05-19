import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { X, CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Lazy: react-day-picker is ~70KB gzip. Only loads when a user opens the
// date popover, not on every Feed mount. Suspense fallback is a thin loader
// so the popover doesn't blink empty.
const Calendar = React.lazy(() =>
  import("@/components/ui/calendar").then((m) => ({ default: m.Calendar })),
);
import { cn } from "@/lib/utils";
import { feedService } from "@/services/feedService";
import { useFeedFilters } from "./FeedFilterContext";
import { SavedViewsMenu } from "./SavedViewsMenu";

const ALL = "__all__";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted">
      {children}
    </span>
  );
}

function DateField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const date = value ? parseISO(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-7 w-36 px-2 justify-start text-left text-[12px] font-mono",
            !date && "text-text-muted"
          )}
        >
          <CalendarIcon className="w-3 h-3 mr-1.5 shrink-0" />
          {date ? format(date, "dd/MM/yyyy") : "dd/mm/yyyy"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <React.Suspense
          fallback={
            <div className="p-6 text-[11px] font-mono text-text-muted">
              Loading…
            </div>
          }
        >
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : null)}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </React.Suspense>
        {date && (
          <div className="border-t border-border p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              className="h-7 w-full text-[11px]"
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar() {
  const { filters, patch, reset } = useFeedFilters();

  // All of the FilterBar's reference lists are session-static.
  // Letting them inherit the 60s default staleTime caused a refetch
  // every time the user opened a select dropdown or toggled the bar.
  const { data: congresses = [] } = useQuery({
    queryKey: ["congresses"],
    queryFn: () => feedService.listCongresses(),
    staleTime: 5 * 60_000,
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["congress-sessions", filters.congressId ?? "__none__"],
    queryFn: () =>
      filters.congressId
        ? feedService.listSessions(filters.congressId)
        : Promise.resolve([]),
    enabled: Boolean(filters.congressId),
    staleTime: 5 * 60_000,
  });
  const { data: lists = [] } = useQuery({
    queryKey: ["source-lists"],
    queryFn: () => feedService.listSourceLists(),
    staleTime: 5 * 60_000,
  });
  const { data: hashtags = [] } = useQuery({
    queryKey: ["hashtags"],
    queryFn: () => feedService.listHashtags(),
    staleTime: 5 * 60_000,
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
        <DateField
          value={filters.dateFrom ?? null}
          onChange={(v) => patch({ dateFrom: v })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <FieldLabel>To</FieldLabel>
        <DateField
          value={filters.dateTo ?? null}
          onChange={(v) => patch({ dateTo: v })}
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

      <div className="ml-auto flex items-end gap-1.5">
        <SavedViewsMenu />
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
    </div>
  );
}