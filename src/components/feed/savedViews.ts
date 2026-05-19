import type { FeedFilters } from "./FeedFilterContext";

export interface SavedView {
  id: string;
  name: string;
  createdAt: string;
  /** Brush + dateFrom/dateTo are deliberately omitted — they're time-bound
   *  and don't make sense to persist (a saved view from January 2026 with
   *  a brushed window would silently filter out today's tweets). */
  filters: Omit<FeedFilters, "brush" | "dateFrom" | "dateTo">;
}

const STORAGE_PREFIX = "urofeed:saved-views";

function storageKey(userId: string | null | undefined) {
  return `${STORAGE_PREFIX}:${userId ?? "anon"}`;
}

export function loadSavedViews(userId: string | null | undefined): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedView);
  } catch {
    return [];
  }
}

function isSavedView(v: unknown): v is SavedView {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.createdAt === "string" &&
    !!r.filters &&
    typeof r.filters === "object"
  );
}

function writeSavedViews(
  userId: string | null | undefined,
  views: SavedView[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(views));
  } catch {
    /* quota exceeded or storage disabled — silent */
  }
}

export function saveView(
  userId: string | null | undefined,
  name: string,
  filters: FeedFilters,
): SavedView {
  const { brush: _b, dateFrom: _df, dateTo: _dt, ...rest } = filters;
  const view: SavedView = {
    id: `view_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "Untitled view",
    createdAt: new Date().toISOString(),
    filters: rest,
  };
  const cur = loadSavedViews(userId);
  // Replace any view with the same name (case-insensitive) so users can
  // overwrite without first deleting.
  const next = [
    view,
    ...cur.filter((v) => v.name.toLowerCase() !== view.name.toLowerCase()),
  ];
  writeSavedViews(userId, next);
  return view;
}

export function deleteView(
  userId: string | null | undefined,
  id: string,
): SavedView[] {
  const next = loadSavedViews(userId).filter((v) => v.id !== id);
  writeSavedViews(userId, next);
  return next;
}

/** Reconstitute a full FeedFilters from a SavedView (zeroes the time-bound fields). */
export function applyView(view: SavedView): FeedFilters {
  return {
    ...view.filters,
    brush: null,
    dateFrom: null,
    dateTo: null,
  };
}
