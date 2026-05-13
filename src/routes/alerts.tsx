import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  CheckCheck,
  ExternalLink,
  Loader2,
  MessageSquareReply,
  Pencil,
  Trash2,
  X as XIcon,
  Filter,
  Plus,
  Pause,
  Play,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Panel } from "@/components/shell/Panel";
import { EmptyState } from "@/components/shell/EmptyState";
import {
  WatchlistFormDialog,
} from "@/components/watchlists/WatchlistFormDialog";
import {
  dismissAllMatches,
  dismissMatch,
  listMyMatches,
  listWatchlists,
  muteWatchlist,
  updateWatchlist,
  deleteWatchlist,
} from "@/serverFns/watchlists";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/alerts")({
  head: () =>
    buildSeoHead({
      title: "Alerts",
      description:
        "A live inbox of urology posts matching your watchlists, plus controls to create, mute and tune the rules behind them.",
      path: "/alerts",
    }),
  component: AlertsPage,
});

function AlertsPage() {
  const [tab, setTab] = React.useState<"inbox" | "watchlists">("inbox");
  return (
    <div className="flex flex-col h-full min-h-0 p-3 gap-3 overflow-hidden">
      <header className="shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-accent" />
          <h1 className="text-[14px] font-semibold text-text-primary">Alerts</h1>
        </div>
      </header>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "inbox" | "watchlists")}
        className="flex flex-col flex-1 min-h-0"
      >
        <TabsList className="self-start">
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="watchlists">Watchlists</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="flex-1 min-h-0 mt-3">
          <InboxTab />
        </TabsContent>
        <TabsContent value="watchlists" className="flex-1 min-h-0 mt-3">
          <WatchlistsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================== Inbox ============================== */

function InboxTab() {
  const qc = useQueryClient();
  const listMatchesFn = useServerFn(listMyMatches);
  const listWatchlistsFn = useServerFn(listWatchlists);
  const dismissFn = useServerFn(dismissMatch);
  const dismissAllFn = useServerFn(dismissAllMatches);

  const [filterWatchlist, setFilterWatchlist] = React.useState<string>("all");
  const [includeDismissed, setIncludeDismissed] = React.useState(false);

  const watchlistsQ = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => listWatchlistsFn(),
  });

  const matchesQ = useQuery({
    queryKey: [
      "watchlist-matches",
      filterWatchlist,
      includeDismissed,
    ],
    queryFn: () =>
      listMatchesFn({
        data: {
          limit: 100,
          watchlist_id:
            filterWatchlist === "all" ? undefined : filterWatchlist,
          include_dismissed: includeDismissed,
        },
      }),
  });

  const dismissMut = useMutation({
    mutationFn: (id: string) => dismissFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watchlist-matches"] });
      qc.invalidateQueries({ queryKey: ["watchlist-unread"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const dismissAllMut = useMutation({
    mutationFn: () =>
      dismissAllFn({
        data:
          filterWatchlist === "all"
            ? {}
            : { watchlist_id: filterWatchlist },
      }),
    onSuccess: () => {
      toast.success("All marked as read");
      qc.invalidateQueries({ queryKey: ["watchlist-matches"] });
      qc.invalidateQueries({ queryKey: ["watchlist-unread"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const watchlistMap = React.useMemo(() => {
    const m = new Map<string, { name: string }>();
    for (const w of watchlistsQ.data ?? []) {
      m.set(w.id as string, { name: w.name as string });
    }
    return m;
  }, [watchlistsQ.data]);

  const unreadCount = (matchesQ.data ?? []).filter((m) => !m.dismissed_at)
    .length;

  return (
    <Panel
      title={`Inbox · ${unreadCount} unread`}
      className="flex-1 min-h-0"
      bodyClassName="overflow-y-auto"
      actions={
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-text-muted" />
          <Select value={filterWatchlist} onValueChange={setFilterWatchlist}>
            <SelectTrigger className="h-7 w-[180px] text-[11px] font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All watchlists</SelectItem>
              {(watchlistsQ.data ?? []).map((w) => (
                <SelectItem key={w.id as string} value={w.id as string}>
                  {w.name as string}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <Switch
              checked={includeDismissed}
              onCheckedChange={setIncludeDismissed}
            />
            Show dismissed
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={unreadCount === 0 || dismissAllMut.isPending}
            onClick={() => dismissAllMut.mutate()}
            className="h-7"
          >
            <CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark all read
          </Button>
        </div>
      }
    >
      {matchesQ.isLoading ? (
        <div className="flex items-center justify-center py-12 text-text-muted">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : (matchesQ.data ?? []).length === 0 ? (
        <EmptyState
          icon={Bell}
          caption={
            includeDismissed
              ? "No matches · Try changing the filter."
              : "No matches yet · Tweets from sources you watch will appear here in real time when they hit one of your topics."
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {(matchesQ.data ?? []).map((m) => (
            <MatchRow
              key={m.id as string}
              match={m}
              watchlistName={
                watchlistMap.get(m.watchlist_id as string)?.name ?? "watchlist"
              }
              onDismiss={() => dismissMut.mutate(m.id as string)}
              dismissing={dismissMut.isPending}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MatchRow({
  match,
  watchlistName,
  onDismiss,
  dismissing,
}: {
  match: Awaited<ReturnType<typeof listMyMatches>>[number];
  watchlistName: string;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  const tweet = match.tweet as
    | {
        id: string;
        text: string;
        author_handle: string;
        author_display_name?: string | null;
        created_at: string;
      }
    | null;
  const reason = (match.match_reason ?? null) as
    | { evidence?: string; matched_substring?: string }
    | null;
  const evidence = reason?.evidence ?? reason?.matched_substring ?? null;
  const xUrl =
    tweet && `https://x.com/${tweet.author_handle}/status/${tweet.id}`;
  const replyUrl =
    tweet &&
    `https://x.com/intent/tweet?in_reply_to=${tweet.id}`;
  const dismissed = Boolean(match.dismissed_at);

  return (
    <li
      className={`py-3 px-1 flex gap-3 ${
        dismissed ? "opacity-60" : ""
      }`}
    >
      <div className="w-8 h-8 shrink-0 rounded-full bg-panel-elevated border border-border flex items-center justify-center text-[10px] font-mono text-text-muted">
        {tweet?.author_handle?.slice(0, 2).toUpperCase() ?? "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
          {tweet ? (
            <>
              <span className="text-text-primary font-semibold">
                {tweet.author_display_name || `@${tweet.author_handle}`}
              </span>
              <span className="text-text-muted">@{tweet.author_handle}</span>
              <span className="text-text-muted">·</span>
              <span className="text-text-muted">
                {new Date(tweet.created_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </>
          ) : (
            <span className="text-text-muted">Tweet unavailable</span>
          )}
        </div>
        {tweet && (
          <p className="mt-1 text-[13px] text-text-primary whitespace-pre-wrap break-words line-clamp-4">
            {tweet.text}
          </p>
        )}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <Badge
            variant="outline"
            className="text-[10px] font-mono uppercase tracking-wider border-accent/40 text-accent"
          >
            {match.matched_topic as string}
          </Badge>
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            {watchlistName}
          </span>
          {Array.isArray(match.delivered_via) &&
            (match.delivered_via as string[]).includes("email") && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                · emailed
              </span>
            )}
          {evidence && (
            <span className="text-[10px] font-mono text-text-muted truncate">
              · "…{evidence}…"
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 flex flex-col gap-1">
        {xUrl && (
          <a
            href={xUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-accent"
            title="Open on X"
          >
            <ExternalLink className="w-3 h-3" /> Open
          </a>
        )}
        {replyUrl && (
          <a
            href={replyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-accent"
            title="Reply on X"
          >
            <MessageSquareReply className="w-3 h-3" /> Reply
          </a>
        )}
        {!dismissed && (
          <button
            type="button"
            onClick={onDismiss}
            disabled={dismissing}
            className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-destructive"
            title="Dismiss"
          >
            <XIcon className="w-3 h-3" /> Dismiss
          </button>
        )}
      </div>
    </li>
  );
}

/* ============================ Watchlists ============================ */

function WatchlistsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWatchlists);
  const updateFn = useServerFn(updateWatchlist);
  const muteFn = useServerFn(muteWatchlist);
  const deleteFn = useServerFn(deleteWatchlist);

  const watchlistsQ = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => listFn(),
  });

  const [editId, setEditId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["watchlists"] });
  };

  const toggleActive = useMutation({
    mutationFn: (args: { id: string; is_active: boolean }) =>
      updateFn({ data: { id: args.id, is_active: args.is_active } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const muteMut = useMutation({
    mutationFn: (args: { id: string; hours: number }) =>
      muteFn({ data: { id: args.id, hours: args.hours } }),
    onSuccess: (_r, vars) => {
      toast.success(vars.hours === 0 ? "Unmuted" : `Muted for ${vars.hours}h`);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Watchlist deleted");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Panel
      title={`Watchlists · ${watchlistsQ.data?.length ?? 0}`}
      className="flex-1 min-h-0"
      bodyClassName="overflow-y-auto"
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)} className="h-7">
          <Plus className="w-3.5 h-3.5 mr-1" /> New watchlist
        </Button>
      }
    >
      {watchlistsQ.isLoading ? (
        <div className="flex items-center justify-center py-12 text-text-muted">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
        </div>
      ) : (watchlistsQ.data ?? []).length === 0 ? (
        <EmptyState
          icon={Bell}
          caption="No watchlists yet · Create one from a source spotlight, a group page, or with 'New watchlist' above."
          action={{ label: "New watchlist", onClick: () => setCreateOpen(true), icon: Plus }}
        />
      ) : (
        <ul className="divide-y divide-border">
          {(watchlistsQ.data ?? []).map((w) => {
            const muted =
              w.muted_until &&
              new Date(w.muted_until as string).getTime() > Date.now();
            const active = Boolean(w.is_active);
            return (
              <li key={w.id as string} className="py-3 flex gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-text-primary truncate">
                      {w.name as string}
                    </span>
                    {!active && (
                      <Badge variant="outline" className="text-[10px] uppercase">
                        Paused
                      </Badge>
                    )}
                    {muted && (
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase border-warning/40 text-warning"
                      >
                        Muted
                      </Badge>
                    )}
                    {w.email_enabled && (
                      <Badge variant="outline" className="text-[10px] uppercase">
                        Email
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] font-mono text-text-muted">
                    {w.target_kind === "source"
                      ? `Source · @${w.target_source_id}`
                      : `Group`}
                    {w.topics && (w.topics as string[]).length > 0 && (
                      <>
                        {" · "}
                        <span>{(w.topics as string[]).join(", ")}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    title={active ? "Pause" : "Resume"}
                    onClick={() =>
                      toggleActive.mutate({
                        id: w.id as string,
                        is_active: !active,
                      })
                    }
                  >
                    {active ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    title={muted ? "Unmute" : "Mute 24h"}
                    onClick={() =>
                      muteMut.mutate({
                        id: w.id as string,
                        hours: muted ? 0 : 24,
                      })
                    }
                  >
                    {muted ? (
                      <Bell className="w-3.5 h-3.5" />
                    ) : (
                      <BellOff className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    title="Edit"
                    onClick={() => setEditId(w.id as string)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-destructive hover:text-destructive"
                    title="Delete"
                    onClick={() => {
                      if (
                        confirm(
                          `Delete watchlist "${w.name as string}"? This removes its match history too.`,
                        )
                      ) {
                        deleteMut.mutate(w.id as string);
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <WatchlistFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={refresh}
      />
      <WatchlistFormDialog
        open={Boolean(editId)}
        onOpenChange={(o) => !o && setEditId(null)}
        watchlistId={editId ?? undefined}
        onSaved={refresh}
      />
    </Panel>
  );
}

// Silence unused-import lint while keeping the route file the single
// place readers can find Link if we add a "Back to dashboard" later.
void Link;