import * as React from "react";
import { Bookmark, BookmarkPlus, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/auth/AuthProvider";
import { useFeedFilters } from "./FeedFilterContext";
import {
  applyView,
  deleteView,
  loadSavedViews,
  saveView,
  type SavedView,
} from "./savedViews";

/** Dropdown showing saved feed views with save / load / delete affordances.
 *  Stored per-user in localStorage so the panel works offline and across
 *  refreshes without needing a Supabase round-trip on every page load. */
export function SavedViewsMenu() {
  const { user } = useAuth();
  const { filters, setFilters } = useFeedFilters();
  const [views, setViews] = React.useState<SavedView[]>([]);
  const [open, setOpen] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setViews(loadSavedViews(user?.id));
      setDraftName("");
    }
  }, [open, user?.id]);

  const onSave = () => {
    const name = draftName.trim();
    if (!name) {
      toast.error("Give the view a name first");
      return;
    }
    const view = saveView(user?.id, name, filters);
    setViews((cur) => [
      view,
      ...cur.filter((v) => v.name.toLowerCase() !== view.name.toLowerCase()),
    ]);
    setDraftName("");
    toast.success(`Saved view "${view.name}"`);
  };

  const onLoad = (view: SavedView) => {
    setFilters(applyView(view));
    setOpen(false);
    toast.success(`Loaded view "${view.name}"`);
  };

  const onDelete = (view: SavedView) => {
    const next = deleteView(user?.id, view.id);
    setViews(next);
    toast.success(`Deleted "${view.name}"`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px] font-mono uppercase tracking-wider self-end"
          aria-label="Saved views"
        >
          <Bookmark aria-hidden="true" className="w-3 h-3 mr-1" />
          Views{views.length > 0 ? ` (${views.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-2 border-b border-border">
          <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted mb-1.5">
            Save current filters as…
          </div>
          <div className="flex gap-1.5">
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="View name"
              className="h-7 text-[12px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSave();
                }
              }}
            />
            <Button
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={onSave}
              disabled={!draftName.trim()}
              aria-label="Save view"
            >
              <BookmarkPlus aria-hidden="true" className="w-3 h-3 mr-1" />
              Save
            </Button>
          </div>
        </div>
        <div className="max-h-64 overflow-auto py-1">
          {views.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] font-mono text-text-muted">
              No saved views yet.
            </div>
          ) : (
            <ul>
              {views.map((view) => (
                <li
                  key={view.id}
                  className="group flex items-center gap-1 px-2 py-1 hover:bg-panel-elevated/60"
                >
                  <button
                    type="button"
                    onClick={() => onLoad(view)}
                    className="flex-1 min-w-0 text-left px-1 py-1 rounded-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <div className="text-[12px] text-text-primary truncate">
                      {view.name}
                    </div>
                    <div className="text-[10px] font-mono text-text-muted">
                      {summarize(view)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(view);
                    }}
                    aria-label={`Delete view "${view.name}"`}
                    title="Delete view"
                    className="h-6 w-6 inline-flex items-center justify-center rounded-[2px] text-text-muted hover:text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
                  >
                    <Trash2 aria-hidden="true" className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border px-3 py-1.5 flex items-center gap-1 text-[10px] font-mono text-text-muted">
          <Check aria-hidden="true" className="w-3 h-3" />
          Saved per-device. Date filters are not stored.
        </div>
      </PopoverContent>
    </Popover>
  );
}

function summarize(view: SavedView): string {
  const f = view.filters;
  const parts: string[] = [];
  if (f.congressId) parts.push("congress");
  if (f.sessionId) parts.push("session");
  if (f.sourceListId) parts.push("source-list");
  if (f.sourceId) parts.push("source");
  if (f.hashtags.length) parts.push(`${f.hashtags.length} hashtag`);
  if (f.language) parts.push(f.language);
  return parts.length === 0 ? "all" : parts.join(" · ");
}

export default SavedViewsMenu;
