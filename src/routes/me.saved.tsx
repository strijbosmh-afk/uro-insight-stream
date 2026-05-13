import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bookmark as BookmarkIcon, Pencil, Search, Filter, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MobileSubPage } from "@/components/shell/MobileSubPage";
import { TweetCard } from "@/components/feed/TweetCard";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useBookmarks,
  useToggleBookmark,
  useUpdateBookmarkNote,
  type Bookmark,
} from "@/hooks/useBookmarks";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import type { Source, Tweet } from "@/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/me/saved")({
  head: () => ({ meta: [{ title: "Saved — UroFeed" }] }),
  component: SavedPage,
});

type SavedRow = {
  bookmark: Bookmark;
  tweet: Tweet;
  source: Source | undefined;
};

function rowToTweet(r: any): Tweet {
  return {
    id: r.id,
    sourceId: r.source_id ?? `@${(r.author_handle ?? "").replace(/^@/, "")}`,
    text: r.text,
    createdAt: r.created_at,
    likeCount: r.like_count,
    retweetCount: r.retweet_count,
    replyCount: r.reply_count,
    mediaUrls: r.media_urls ?? [],
    hashtags: r.hashtags ?? [],
    sessionId: r.session_id ?? undefined,
    abstractId: r.abstract_id ?? undefined,
    lang: r.lang ?? "en",
    tweetType: (r.tweet_type as Tweet["tweetType"]) ?? "original",
    parentTweetExternalId: r.parent_tweet_external_id ?? undefined,
    parentHandle: r.parent_handle ?? undefined,
    parentText: r.parent_text ?? undefined,
    parentInDbId: r.parent_in_db_id ?? undefined,
  };
}

function rowToSource(r: any): Source {
  return {
    id: r.id,
    handle: r.handle,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    role: r.role,
    specialty: r.specialty ?? [],
    verified: r.verified,
    active: r.active,
    listIds: r.list_ids ?? [],
    lastSeenAt: r.last_seen_at ?? undefined,
    tweetCount: r.tweet_count,
  };
}

function SavedPage() {
  const isMobile = useIsMobile();
  const content = <SavedContent />;
  if (isMobile) {
    return <MobileSubPage title="Saved">{content}</MobileSubPage>;
  }
  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold text-text-primary">Saved tweets</h1>
      </div>
      <div className="bg-panel border border-border rounded-[3px]">{content}</div>
    </div>
  );
}

function SavedContent() {
  const [search, setSearch] = React.useState("");
  const [withNotesOnly, setWithNotesOnly] = React.useState(false);
  const [sourceFilter, setSourceFilter] = React.useState<string>("");
  const [filterOpen, setFilterOpen] = React.useState(false);

  const { data: bookmarks, isLoading } = useBookmarks({ withNotesOnly });

  const tweetIds = React.useMemo(
    () => (bookmarks ?? []).map((b) => b.tweet_id),
    [bookmarks],
  );

  const { data: tweets } = useQuery({
    queryKey: ["bookmarks-tweets", tweetIds],
    enabled: tweetIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tweets")
        .select("*")
        .in("id", tweetIds);
      if (error) throw new Error(error.message);
      return (data ?? []).map(rowToTweet);
    },
  });

  const sourceIds = React.useMemo(
    () =>
      Array.from(
        new Set((tweets ?? []).map((t) => t.sourceId).filter((s) => !s.startsWith("@"))),
      ),
    [tweets],
  );
  const { data: sources } = useQuery({
    queryKey: ["bookmarks-sources", sourceIds],
    enabled: sourceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sources")
        .select("*")
        .in("id", sourceIds);
      if (error) throw new Error(error.message);
      return (data ?? []).map(rowToSource);
    },
  });

  const tweetMap = React.useMemo(() => {
    const m = new Map<string, Tweet>();
    (tweets ?? []).forEach((t) => m.set(t.id, t));
    return m;
  }, [tweets]);
  const sourceMap = React.useMemo(() => {
    const m = new Map<string, Source>();
    (sources ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [sources]);

  const rows: SavedRow[] = React.useMemo(() => {
    const list = (bookmarks ?? [])
      .map((b) => {
        const tweet = tweetMap.get(b.tweet_id);
        if (!tweet) return null;
        return { bookmark: b, tweet, source: sourceMap.get(tweet.sourceId) };
      })
      .filter(Boolean) as SavedRow[];
    let filtered = list;
    if (sourceFilter) {
      filtered = filtered.filter((r) => r.source?.id === sourceFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((r) => {
        return (
          r.tweet.text.toLowerCase().includes(q) ||
          (r.source?.handle ?? "").toLowerCase().includes(q) ||
          (r.source?.displayName ?? "").toLowerCase().includes(q) ||
          (r.bookmark.note ?? "").toLowerCase().includes(q)
        );
      });
    }
    return filtered;
  }, [bookmarks, tweetMap, sourceMap, search, sourceFilter]);

  const sourceOptions = React.useMemo(() => {
    const seen = new Map<string, Source>();
    (tweets ?? []).forEach((t) => {
      const s = sourceMap.get(t.sourceId);
      if (s) seen.set(s.id, s);
    });
    return Array.from(seen.values()).sort((a, b) =>
      a.handle.localeCompare(b.handle),
    );
  }, [tweets, sourceMap]);

  return (
    <div>
      <div className="sticky top-0 z-10 bg-panel border-b border-border p-2 flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 px-2 h-9 border border-border rounded-[3px] bg-panel-elevated">
          <Search className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved…"
            className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-text-muted"
          />
        </div>
        <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={cn(
                "h-9 px-2 inline-flex items-center gap-1.5 border border-border rounded-[3px] bg-panel-elevated text-[11px] font-mono",
                (withNotesOnly || sourceFilter) && "text-accent border-accent/60",
              )}
              aria-label="Filter saved"
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filter</span>
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[320px]">
            <SheetHeader>
              <SheetTitle>Filter saved tweets</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-2 text-[13px]">
                <Checkbox
                  checked={withNotesOnly}
                  onCheckedChange={(v) => setWithNotesOnly(!!v)}
                />
                With notes only
              </label>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-text-muted mb-1">
                  By source
                </div>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="w-full h-9 px-2 border border-border rounded-[3px] bg-panel-elevated text-[12px]"
                >
                  <option value="">Any source</option>
                  {sourceOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      @{s.handle}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWithNotesOnly(false);
                  setSourceFilter("");
                  setFilterOpen(false);
                }}
                className="w-full h-9 border border-border rounded-[3px] text-[12px] text-text-muted hover:text-text-primary"
              >
                Clear filters
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="p-2 space-y-2">
        {isLoading && (
          <div className="text-[12px] font-mono text-text-muted text-center py-8">
            Loading…
          </div>
        )}
        {!isLoading && rows.length === 0 && (
          <div className="flex flex-col items-center text-center py-12 px-6">
            <BookmarkIcon className="w-8 h-8 text-text-muted mb-3" />
            <div className="text-[14px] text-text-primary font-medium">
              No saved tweets yet
            </div>
            <div className="mt-1 text-[12px] text-text-muted max-w-sm">
              Tap the bookmark icon on any tweet to save it for later.
            </div>
          </div>
        )}
        {rows.map((r) => (
          <SavedRowItem key={r.bookmark.id} row={r} />
        ))}
      </div>
    </div>
  );
}

function SavedRowItem({ row }: { row: SavedRow }) {
  const isMobile = useIsMobile();
  const updateNote = useUpdateBookmarkNote();
  const toggleBookmark = useToggleBookmark();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(row.bookmark.note ?? "");

  React.useEffect(() => {
    setDraft(row.bookmark.note ?? "");
  }, [row.bookmark.note]);

  // ---- swipe-left for Remove on mobile ----
  const touchRef = React.useRef<{ x: number; y: number; locked: "h" | "v" | null } | null>(null);
  const [revealDx, setRevealDx] = React.useState(0);
  const onTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, locked: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touchRef.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (s.locked === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (s.locked === "h" && dx < 0) {
      setRevealDx(Math.max(dx, -96));
    }
  };
  const onTouchEnd = () => {
    touchRef.current = null;
    setRevealDx((d) => (d < -60 ? -96 : 0));
  };

  const remove = () => {
    toggleBookmark.mutate(
      { tweetId: row.tweet.id, bookmarked: false },
      {
        onSuccess: () => toast.success("Removed from saved"),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <div className="relative overflow-hidden">
      {revealDx < 0 && (
        <div className="absolute inset-y-0 right-0 w-24 flex items-center justify-center bg-destructive/10">
          <button
            type="button"
            onClick={remove}
            className="inline-flex items-center gap-1 text-destructive text-[12px] font-mono"
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </button>
        </div>
      )}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        style={{
          transform: `translateX(${revealDx}px)`,
          transition: touchRef.current ? "none" : "transform 180ms ease-out",
        }}
      >
        <TweetCard tweet={row.tweet} source={row.source} />
        <div className="mt-1 px-2 py-1 flex items-start gap-2 text-[12px] italic text-text-muted">
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                const trimmed = draft.trim();
                if ((row.bookmark.note ?? "") !== trimmed) {
                  updateNote.mutate(
                    { tweetId: row.tweet.id, note: trimmed || null },
                    {
                      onSuccess: () => toast.success("Note saved"),
                      onError: (e) => toast.error((e as Error).message),
                    },
                  );
                }
                setEditing(false);
              }}
              autoFocus
              rows={2}
              placeholder="Add a note…"
              className="flex-1 resize-none bg-panel-elevated border border-border rounded-[3px] p-1.5 not-italic text-text-primary outline-none focus:border-accent"
            />
          ) : (
            <>
              <div className="flex-1">
                {row.bookmark.note ? row.bookmark.note : (
                  <span className="opacity-60">No note</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label="Edit note"
                className="shrink-0 text-text-muted hover:text-accent"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}