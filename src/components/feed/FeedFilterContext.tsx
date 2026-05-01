import * as React from "react";
import { useAuth } from "@/auth/AuthProvider";

export type FeedFilters = {
  congressId: string | null;
  sessionId: string | null;
  sourceListId: string | null;
  hashtags: string[];
  /** ISO date string (yyyy-mm-dd) or null. */
  dateFrom: string | null;
  dateTo: string | null;
  /** Brushed window from the timeline scrubber: { sinceMs, untilMs } */
  brush: { sinceMs: number; untilMs: number } | null;
  language: string | null;
};

const DEFAULT: FeedFilters = {
  congressId: null,
  sessionId: null,
  sourceListId: null,
  hashtags: [],
  dateFrom: null,
  dateTo: null,
  brush: null,
  language: null,
};

type Ctx = {
  filters: FeedFilters;
  setFilters: React.Dispatch<React.SetStateAction<FeedFilters>>;
  patch: (p: Partial<FeedFilters>) => void;
  reset: () => void;
};

const FeedFilterContext = React.createContext<Ctx | null>(null);

export function FeedFilterProvider({ children }: { children: React.ReactNode }) {
  const { prefs } = useAuth();
  const [filters, setFilters] = React.useState<FeedFilters>(DEFAULT);
  const seededRef = React.useRef(false);

  // Seed defaults from user preferences on first arrival (don't override
  // explicit user changes on subsequent renders).
  React.useEffect(() => {
    if (seededRef.current || !prefs) return;
    seededRef.current = true;
    setFilters((cur) => ({
      ...cur,
      congressId: cur.congressId ?? prefs.default_congress_id ?? null,
      sourceListId: cur.sourceListId ?? prefs.default_source_list_id ?? null,
    }));
  }, [prefs]);

  const value = React.useMemo<Ctx>(
    () => ({
      filters,
      setFilters,
      patch: (p) => setFilters((cur) => ({ ...cur, ...p })),
      reset: () => setFilters(DEFAULT),
    }),
    [filters],
  );
  return (
    <FeedFilterContext.Provider value={value}>
      {children}
    </FeedFilterContext.Provider>
  );
}

export function useFeedFilters() {
  const ctx = React.useContext(FeedFilterContext);
  if (!ctx) throw new Error("useFeedFilters must be used within FeedFilterProvider");
  return ctx;
}