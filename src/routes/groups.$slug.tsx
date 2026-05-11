import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, BadgeCheck, ExternalLink, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/shell/Panel";
import { toTitleCase } from "@/lib/title-case";
import { SetUpAlertsButton } from "@/components/watchlists/WatchlistFormDialog";
import {
  getGroup,
  subscribeToGroup,
  unsubscribeFromGroup,
} from "@/serverFns/groups";

export const Route = createFileRoute("/groups/$slug")({
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} — Group — UroFeed` }],
  }),
  component: GroupDetailPage,
});

function GroupDetailPage() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const fetchGroup = useServerFn(getGroup);
  const subFn = useServerFn(subscribeToGroup);
  const unsubFn = useServerFn(unsubscribeFromGroup);

  const { data, isLoading, error } = useQuery({
    queryKey: ["group", slug],
    queryFn: () => fetchGroup({ data: { idOrSlug: slug } }),
  });

  const subMut = useMutation({
    mutationFn: async (id: string) => subFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Subscribed");
      qc.invalidateQueries({ queryKey: ["group", slug] });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const unsubMut = useMutation({
    mutationFn: async (id: string) => unsubFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Unsubscribed");
      qc.invalidateQueries({ queryKey: ["group", slug] });
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-6">
        <Link to="/discover/groups" className="text-[12px] text-accent hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to groups
        </Link>
        <p className="mt-4 text-[13px] text-text-muted">
          {error instanceof Error ? error.message : "Group not found."}
        </p>
      </div>
    );
  }

  const g = data;
  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-3 overflow-y-auto">
      <Link to="/discover/groups" className="text-[12px] text-accent hover:underline inline-flex items-center gap-1 shrink-0">
        <ArrowLeft className="w-3 h-3" /> Back to groups
      </Link>

      <header className="border border-border bg-panel rounded-[4px] p-4 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold text-text-primary">{toTitleCase(g.name)}</h1>
              {g.visibility === "official" && (
                <Badge variant="outline" className="gap-1 text-[10px] uppercase border-accent/40 text-accent">
                  <BadgeCheck className="w-3 h-3" /> Official
                </Badge>
              )}
              {g.visibility === "private" && (
                <Badge variant="outline" className="text-[10px] uppercase">Private</Badge>
              )}
              {g.is_archived && (
                <Badge variant="outline" className="text-[10px] uppercase border-warning/40 text-warning">
                  Archived
                </Badge>
              )}
            </div>
            {g.description && (
              <p className="mt-2 text-[13px] text-text-muted">{g.description}</p>
            )}
            <div className="mt-3 flex items-center gap-1 flex-wrap">
              {g.cancer_areas.map((a) => (
                <span
                  key={a.id}
                  className="text-[10px] font-mono uppercase tracking-wider text-text-muted bg-panel-elevated/50 border border-border px-1.5 py-0.5 rounded"
                >
                  {a.name}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 text-[11px] font-mono text-text-muted">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" /> {g.member_count} sources
              </span>
              <span>{g.subscriber_count} subscribers</span>
            </div>
          </div>
          <div className="shrink-0">
            {g.is_subscribed ? (
              <Button variant="outline" disabled={unsubMut.isPending} onClick={() => unsubMut.mutate(g.id)}>
                Subscribed
              </Button>
            ) : (
              <Button disabled={subMut.isPending || g.is_archived} onClick={() => subMut.mutate(g.id)}>
                Subscribe
              </Button>
            )}
            {!g.is_archived && (
              <SetUpAlertsButton
                target={{ kind: "group", id: g.id, label: g.name }}
                variant="outline"
                className="ml-2"
              />
            )}
          </div>
        </div>
      </header>

      <Panel title={`Members · ${g.members.length}`} className="flex-1 min-h-0" bodyClassName="overflow-y-auto">
        {g.members.length === 0 ? (
          <p className="text-[12px] text-text-muted">No sources in this group yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {g.members.map((m) => (
              <li key={m.source_id} className="flex items-center gap-3 py-2">
                <Link
                  to="/sources/$handle"
                  params={{ handle: m.handle }}
                  className="flex items-center gap-3 min-w-0 flex-1 group"
                >
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full group-hover:ring-2 group-hover:ring-accent/40 transition" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-panel-elevated border border-border" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-text-primary truncate flex items-center gap-1 group-hover:text-accent transition-colors">
                      {m.display_name || m.handle}
                      {m.verified && <BadgeCheck className="w-3 h-3 text-accent" />}
                    </div>
                    <div className="text-[11px] font-mono text-text-muted">@{m.handle}</div>
                  </div>
                </Link>
                <a
                  href={`https://twitter.com/${m.handle}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-muted hover:text-accent"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}