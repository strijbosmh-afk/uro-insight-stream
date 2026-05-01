import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Calendar, X, Plus, Trash2 } from "lucide-react";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { feedService } from "@/services/feedService";
import { isValidHashtag, normalizeHashtag } from "@/lib/validation";
import type { Congress, Session, SourceList } from "@/types";
import { StatusPill } from "./StatusPill";
import { Sparkline } from "./Sparkline";

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CongressDetail({ congressId }: { congressId: string }) {
  const qc = useQueryClient();
  const { data: congress, isLoading } = useQuery({
    queryKey: ["congress", congressId],
    queryFn: () => feedService.getCongress(congressId),
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["congress-sessions", congressId],
    queryFn: () => feedService.listSessions(congressId),
  });
  const { data: sparkline = [] } = useQuery({
    queryKey: ["congress-activity", congressId],
    queryFn: () => feedService.congressActivity(congressId, 24),
  });
  const { data: tweetTotal = 0 } = useQuery({
    queryKey: ["congress-tweet-count", congressId],
    queryFn: () => feedService.countCongressTweets(congressId),
  });
  const { data: lists = [] } = useQuery({
    queryKey: ["source-lists"],
    queryFn: () => feedService.listSourceLists(),
  });
  const { data: allSources = [] } = useQuery({
    queryKey: ["sources"],
    queryFn: () => feedService.listSources(),
  });

  const update = useMutation({
    mutationFn: (patch: Partial<Congress>) =>
      feedService.updateCongress(congressId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["congress", congressId] });
      qc.invalidateQueries({ queryKey: ["congresses"] });
    },
    onError: () => toast.error("Update failed"),
  });

  const remove = useMutation({
    mutationFn: () => feedService.removeCongress(congressId),
    onSuccess: () => {
      toast.success("Congress deleted");
      qc.invalidateQueries({ queryKey: ["congresses"] });
      window.history.back();
    },
  });

  if (isLoading || !congress) {
    return (
      <div className="grid grid-cols-12 gap-3 h-full">
        <Panel
          title="Congress"
          loading
          className="col-span-12"
          actions={<DefaultViewLabel />}
        >
          <div className="text-text-muted text-[12px]">Loading…</div>
        </Panel>
      </div>
    );
  }

  // Sources scoped: union of sources whose listIds overlap the congress filter
  const scopedListIds = congress.sourceListIds ?? [];
  const scopedSources = scopedListIds.length
    ? allSources.filter((s) =>
        s.listIds?.some((id) => scopedListIds.includes(id)),
      )
    : allSources;

  // group sessions by day -> track
  const grouped = sessions.reduce(
    (acc, s) => {
      const day = s.startTime.slice(0, 10);
      acc[day] ??= {};
      acc[day][s.track] ??= [];
      acc[day][s.track].push(s);
      return acc;
    },
    {} as Record<string, Record<string, Session[]>>,
  );
  const dayKeys = Object.keys(grouped).sort();

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-text-muted hover:text-text-primary"
        onClick={() => {
          if (confirm(`Delete ${congress.shortCode}?`)) remove.mutate();
        }}
      >
        <Trash2 className="w-3 h-3 mr-1" /> Delete
      </Button>
      <DefaultViewLabel />
    </div>
  );

  return (
    <div className="grid grid-cols-12 gap-3 h-full">
      <Panel
        title={`${congress.shortCode} — ${congress.name}`}
        className="col-span-12"
        actions={headerActions}
        bodyClassName="overflow-auto"
      >
        <div className="flex items-center gap-3 mb-4">
          <Link
            to="/congresses"
            className="inline-flex items-center gap-1 text-[11px] font-mono text-text-muted hover:text-accent"
          >
            <ArrowLeft className="w-3 h-3" /> All congresses
          </Link>
          <StatusPill status={congress.status} />
          <span className="inline-flex items-center gap-1 text-[12px] text-text-muted">
            <MapPin className="w-3 h-3" /> {congress.city}, {congress.country}
          </span>
          <span className="inline-flex items-center gap-1 text-[12px] font-mono text-text-muted">
            <Calendar className="w-3 h-3" />
            {congress.startDate} → {congress.endDate}
          </span>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="h-8 bg-panel-elevated border border-border rounded-[3px] p-0.5">
            <TabsTrigger value="overview" className="text-[11px] uppercase tracking-wider">
              Overview
            </TabsTrigger>
            <TabsTrigger value="program" className="text-[11px] uppercase tracking-wider">
              Program
            </TabsTrigger>
            <TabsTrigger value="sources" className="text-[11px] uppercase tracking-wider">
              Sources
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-7 border border-border rounded-[3px] p-4 bg-panel-elevated/30">
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
                  Hashtags
                </div>
                <HashtagEditor congress={congress} onChange={(tags) => update.mutate({ primaryHashtags: tags })} />

                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                  <Field label="City">
                    <InlineEdit
                      value={congress.city}
                      onSave={(v) => update.mutate({ city: v })}
                    />
                  </Field>
                  <Field label="Country">
                    <InlineEdit
                      value={congress.country}
                      onSave={(v) => update.mutate({ country: v })}
                    />
                  </Field>
                  <Field label="Start date">
                    <InlineEdit
                      type="date"
                      value={congress.startDate}
                      onSave={(v) => update.mutate({ startDate: v })}
                    />
                  </Field>
                  <Field label="End date">
                    <InlineEdit
                      type="date"
                      value={congress.endDate}
                      onSave={(v) => update.mutate({ endDate: v })}
                    />
                  </Field>
                </div>
              </div>

              <div className="col-span-12 md:col-span-5 border border-border rounded-[3px] p-4 bg-panel-elevated/30">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                    Activity · last 24h
                  </div>
                  <div className="text-[11px] font-mono text-text-muted">
                    <span className="text-text-primary">{tweetTotal}</span> total
                  </div>
                </div>
                <Sparkline values={sparkline} width={320} height={48} />
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Stat label="Sessions" value={sessions.length} />
                  <Stat label="Hashtags" value={congress.primaryHashtags.length} />
                  <Stat label="Sources" value={scopedSources.length} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* PROGRAM */}
          <TabsContent value="program" className="mt-4">
            {dayKeys.length === 0 && (
              <div className="text-text-muted text-[12px]">
                No sessions scheduled for this congress yet.
              </div>
            )}
            <div className="space-y-6">
              {dayKeys.map((day) => (
                <div key={day}>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-accent mb-2">
                    {fmtDay(day)}
                  </div>
                  {Object.entries(grouped[day]).map(([track, list]) => (
                    <div key={track} className="mb-4">
                      <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted mb-1">
                        Track · {track}
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border hover:bg-transparent">
                            <TableHead className="w-24 text-[10px]">Time</TableHead>
                            <TableHead className="text-[10px]">Title</TableHead>
                            <TableHead className="w-32 text-[10px]">Room</TableHead>
                            <TableHead className="text-[10px]">Chairs</TableHead>
                            <TableHead className="w-16 text-[10px] text-right">Abs</TableHead>
                            <TableHead className="w-20 text-[10px] text-right">Tweets</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {list
                            .sort((a, b) => (a.startTime < b.startTime ? -1 : 1))
                            .map((s) => (
                              <SessionRow key={s.id} session={s} />
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </TabsContent>

          {/* SOURCES */}
          <TabsContent value="sources" className="mt-4 space-y-4">
            <div className="border border-border rounded-[3px] p-4 bg-panel-elevated/30">
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-2">
                Source list filter
              </div>
              <p className="text-[12px] text-text-muted mb-3">
                Limit which lists are scoped to this congress. Leave empty to
                use the global feed.
              </p>
              <div className="flex flex-wrap gap-2">
                {lists.map((l) => (
                  <ListToggle
                    key={l.id}
                    list={l}
                    selected={scopedListIds.includes(l.id)}
                    onToggle={() => {
                      const next = scopedListIds.includes(l.id)
                        ? scopedListIds.filter((x) => x !== l.id)
                        : [...scopedListIds, l.id];
                      update.mutate({ sourceListIds: next });
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="border border-border rounded-[3px]">
              <div className="px-4 py-2 border-b border-border flex items-center justify-between">
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                  Scoped sources · {scopedSources.length}
                </div>
                <Link
                  to="/sources"
                  className="text-[11px] font-mono text-accent hover:underline"
                >
                  Manage all sources →
                </Link>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-[10px]">Handle</TableHead>
                    <TableHead className="text-[10px]">Display name</TableHead>
                    <TableHead className="text-[10px]">Role</TableHead>
                    <TableHead className="text-[10px] text-right">Tweets</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scopedSources.slice(0, 20).map((s) => (
                    <TableRow key={s.id} className="border-border">
                      <TableCell className="font-mono text-[12px] text-accent">
                        @{s.handle}
                      </TableCell>
                      <TableCell className="text-[12px]">{s.displayName}</TableCell>
                      <TableCell className="text-[11px] uppercase tracking-wider text-text-muted">
                        {s.role}
                      </TableCell>
                      <TableCell className="text-[12px] font-mono text-right">
                        {s.tweetCount ?? 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </Panel>
    </div>
  );
}

function DefaultViewLabel() {
  return (
    <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted px-2">
      view · default
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border rounded-[2px] py-2 bg-panel">
      <div className="text-[16px] font-mono font-semibold text-text-primary">
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-text-muted">
        {label}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function InlineEdit({
  value,
  onSave,
  type = "text",
}: {
  value: string;
  onSave: (v: string) => void;
  type?: string;
}) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return (
    <Input
      type={type}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setV(value);
      }}
      className="h-7 text-[12px]"
    />
  );
}

function HashtagEditor({
  congress,
  onChange,
}: {
  congress: Congress;
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = React.useState("");
  const tags = congress.primaryHashtags;
  const add = () => {
    if (!isValidHashtag(draft)) {
      toast.error("Invalid hashtag");
      return;
    }
    const tag = "#" + normalizeHashtag(draft);
    if (tags.includes(tag)) {
      toast.error("Already added");
      return;
    }
    onChange([...tags, tag]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 h-6 pl-2 pr-1 text-[11px] font-mono text-accent border border-accent/30 bg-accent/5 rounded-[2px]"
          >
            {t}
            <button
              type="button"
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="text-text-muted hover:text-text-primary"
              aria-label={`Remove ${t}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="#NewTag"
          className="h-7 text-[12px] font-mono max-w-[200px]"
        />
        <Button size="sm" variant="outline" className="h-7" onClick={add}>
          <Plus className="w-3 h-3 mr-1" /> Add
        </Button>
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: Session }) {
  const { data: tweets = [] } = useQuery({
    queryKey: ["session-tweets-count", session.id],
    queryFn: () => feedService.listTweets({ sessionId: session.id }),
  });
  return (
    <TableRow className="border-border">
      <TableCell className="font-mono text-[12px] text-text-muted">
        {fmtTime(session.startTime)}
      </TableCell>
      <TableCell className="text-[12px] text-text-primary">
        {session.title}
      </TableCell>
      <TableCell className="text-[11px] font-mono text-text-muted">
        {session.room}
      </TableCell>
      <TableCell className="text-[11px] text-text-muted">
        {session.chairs.join(", ")}
      </TableCell>
      <TableCell className="text-[12px] font-mono text-right">
        {session.abstractIds.length}
      </TableCell>
      <TableCell className="text-[12px] font-mono text-right text-accent">
        {tweets.length}
      </TableCell>
    </TableRow>
  );
}

function ListToggle({
  list,
  selected,
  onToggle,
}: {
  list: SourceList;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        "inline-flex items-center gap-2 h-7 px-2 border rounded-[2px] text-[11px] font-mono transition-colors " +
        (selected
          ? "border-accent text-accent bg-accent/10"
          : "border-border text-text-muted hover:text-text-primary")
      }
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{ background: list.color ?? "var(--accent)" }}
      />
      {list.name}
      <Switch checked={selected} className="pointer-events-none scale-75" />
    </button>
  );
}

export default CongressDetail;