import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Check,
  X,
  Plus,
  Trash2,
  PlayCircle,
  ChevronDown,
  ChevronRight,
  Sprout,
} from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Panel } from "@/components/shell/Panel";
import { TableRowSkeleton } from "@/components/shell/Skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  approveCandidates,
  candidateStats,
  deleteSignal,
  listCancerAreasAdmin,
  listCandidates,
  listGroupsForAdmin,
  listSignals,
  rejectCandidates,
  reseedFromCurated,
  triggerNominationRun,
  upsertSignal,
  type AdminGroupRow,
  type CandidateRow,
  type SignalRow,
} from "@/serverFns/group-candidates";

export const Route = createFileRoute("/admin/groups")({
  head: () => ({ meta: [{ title: "Groups — UroFeed admin" }] }),
  component: GroupsAdminPage,
});

function GroupsAdminPage() {
  const { isAdmin, loading } = useAuth();
  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="p-6">
        <Panel>
          <p className="text-sm">
            Admin access required.{" "}
            <Link to="/dashboard" className="underline">
              Back to dashboard
            </Link>
          </p>
        </Panel>
      </div>
    );
  }
  return (
    <TooltipProvider delayDuration={300}>
      <div className="p-6 space-y-4">
        <header className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold">Groups</h1>
          <p className="text-sm text-text-muted">
            Manage source groups, review nominated members, and tune the
            scoring dictionary.
          </p>
        </header>
        <Tabs defaultValue="candidates" className="space-y-4">
          <TabsList>
            <TabsTrigger value="groups">Groups</TabsTrigger>
            <TabsTrigger value="candidates">Candidates</TabsTrigger>
            <TabsTrigger value="signals">Signals</TabsTrigger>
          </TabsList>
          <TabsContent value="groups">
            <GroupsTab />
          </TabsContent>
          <TabsContent value="candidates">
            <CandidatesTab />
          </TabsContent>
          <TabsContent value="signals">
            <SignalsTab />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

// ===========================================================================
// Groups tab — minimal list (no expansion of scope)
// ===========================================================================

function GroupsTab() {
  const list = useServerFn(listGroupsForAdmin);
  const { data, isLoading } = useQuery<AdminGroupRow[]>({
    queryKey: ["admin", "groups", "all"],
    queryFn: () => list(),
  });

  return (
    <Panel loading={isLoading}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-text-muted border-b border-border">
            <tr>
              <th className="text-left py-2 px-2">Name</th>
              <th className="text-left py-2 px-2">Cancer areas</th>
              <th className="text-right py-2 px-2">Members</th>
              <th className="text-right py-2 px-2">Subscribers</th>
              <th className="text-left py-2 px-2">Visibility</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} cols={5} />
              ))
            ) : (
              <>
                {(data ?? []).map((g) => (
                  <tr key={g.id} className="border-b border-border/50">
                    <td className="py-2 px-2 font-medium">{g.name}</td>
                    <td className="py-2 px-2">
                      <div className="flex flex-wrap gap-1">
                        {g.cancer_areas.map((a) => (
                          <Badge key={a.id} variant="secondary" className="text-[10px]">
                            {a.name}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{g.member_count}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{g.subscriber_count}</td>
                    <td className="py-2 px-2">
                      <Badge variant={g.is_archived ? "outline" : "default"} className="text-[10px]">
                        {g.is_archived ? "archived" : g.visibility}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-text-muted py-8">
                      No groups yet.
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ===========================================================================
// Candidates tab — global review queue
// ===========================================================================

function CandidatesTab() {
  const list = useServerFn(listCandidates);
  const stats = useServerFn(candidateStats);
  const approve = useServerFn(approveCandidates);
  const reject = useServerFn(rejectCandidates);
  const trigger = useServerFn(triggerNominationRun);
  const reseed = useServerFn(reseedFromCurated);
  const listAreas = useServerFn(listCancerAreasAdmin);
  const listGroups = useServerFn(listGroupsForAdmin);
  const qc = useQueryClient();

  const [areaId, setAreaId] = React.useState<string | undefined>(undefined);
  const [groupId, setGroupId] = React.useState<string | undefined>(undefined);
  const [minScore, setMinScore] = React.useState<string>("");
  const [status, setStatus] = React.useState<"pending" | "approved" | "rejected">("pending");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [notes, setNotes] = React.useState("");

  const areasQ = useQuery({ queryKey: ["admin", "areas"], queryFn: () => listAreas() });
  const groupsQ = useQuery({ queryKey: ["admin", "groups", "all"], queryFn: () => listGroups() });
  const statsQ = useQuery({
    queryKey: ["admin", "candidate-stats"],
    queryFn: () => stats(),
  });

  const queryKey = ["admin", "candidates", { areaId, groupId, minScore, status }];
  const { data, isLoading } = useQuery<CandidateRow[]>({
    queryKey,
    queryFn: () =>
      list({
        data: {
          cancerAreaId: areaId,
          groupId,
          minScore: minScore ? Number(minScore) : undefined,
          status,
          limit: 100,
        },
      }),
  });

  React.useEffect(() => setSelected(new Set()), [areaId, groupId, minScore, status]);

  const candidates = data ?? [];
  const allChecked = candidates.length > 0 && candidates.every((c) => selected.has(c.id));

  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(candidates.map((c) => c.id)));
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const approveMut = useMutation({
    mutationFn: (ids: string[]) => approve({ data: { ids, notes: notes || undefined } }),
    onSuccess: (res) => {
      toast.success(`Approved ${res.approved}`);
      setSelected(new Set());
      setNotes("");
      qc.invalidateQueries({ queryKey: ["admin", "candidates"] });
      qc.invalidateQueries({ queryKey: ["admin", "candidate-stats"] });
      qc.invalidateQueries({ queryKey: ["admin", "groups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: (ids: string[]) => reject({ data: { ids, notes: notes || undefined } }),
    onSuccess: (res) => {
      toast.success(`Rejected ${res.rejected}`);
      setSelected(new Set());
      setNotes("");
      qc.invalidateQueries({ queryKey: ["admin", "candidates"] });
      qc.invalidateQueries({ queryKey: ["admin", "candidate-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const triggerMut = useMutation({
    mutationFn: () =>
      trigger({
        data: {
          cancerAreaIds: areaId ? [areaId] : undefined,
        },
      }),
    onSuccess: (res) => {
      toast.success(
        `Run complete${areaId ? " (scoped)" : ""}: ${res.nominated} new, ${res.updated} updated (${res.runtime_ms}ms)`,
      );
      qc.invalidateQueries({ queryKey: ["admin", "candidates"] });
      qc.invalidateQueries({ queryKey: ["admin", "candidate-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reseedMut = useMutation({
    mutationFn: () =>
      reseed({
        data: {
          cancerAreaIds: areaId ? [areaId] : undefined,
          groupIds: groupId ? [groupId] : undefined,
        },
      }),
    onSuccess: (res) => {
      toast.success(
        `Re-seeded ${res.reseeded} curated members${res.skipped ? ` (skipped ${res.skipped} already approved/rejected)` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["admin", "candidates"] });
      qc.invalidateQueries({ queryKey: ["admin", "candidate-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Pending" value={statsQ.data?.pending ?? 0} />
        <StatCard label="Approved this week" value={statsQ.data?.approved_week ?? 0} />
        <StatCard label="Rejected this week" value={statsQ.data?.rejected_week ?? 0} />
      </div>

      {/* Filters */}
      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs text-text-muted">Cancer area</Label>
            <Select value={areaId ?? "all"} onValueChange={(v) => setAreaId(v === "all" ? undefined : v)}>
              <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All areas</SelectItem>
                {(areasQ.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <Label className="text-xs text-text-muted">Group</Label>
            <Select value={groupId ?? "all"} onValueChange={(v) => setGroupId(v === "all" ? undefined : v)}>
              <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groups</SelectItem>
                {(groupsQ.data ?? []).map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28">
            <Label className="text-xs text-text-muted">Min score</Label>
            <Input
              type="number"
              step="0.5"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              className="h-8 mt-1"
            />
          </div>
          <div className="w-36">
            <Label className="text-xs text-text-muted">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => triggerMut.mutate()}
            disabled={triggerMut.isPending}
          >
            {triggerMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4 mr-1" />
            )}
            Run nominations{areaId || groupId ? " (scoped)" : " now"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (
                confirm(
                  "Re-seed curated members back into the review queue? Approved/rejected entries are preserved.",
                )
              )
                reseedMut.mutate();
            }}
            disabled={reseedMut.isPending}
          >
            {reseedMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Sprout className="w-4 h-4 mr-1" />
            )}
            Re-seed from curated
          </Button>
        </div>
      </Panel>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <Panel>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Input
              placeholder="Optional notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-8 max-w-sm"
            />
            <Button
              size="sm"
              onClick={() => approveMut.mutate(Array.from(selected))}
              disabled={approveMut.isPending}
            >
              <Check className="w-4 h-4 mr-1" /> Approve all
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => rejectMut.mutate(Array.from(selected))}
              disabled={rejectMut.isPending}
            >
              <X className="w-4 h-4 mr-1" /> Reject all
            </Button>
          </div>
        </Panel>
      )}

      {/* Table */}
      <Panel loading={isLoading}>
        {isLoading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={6} />
                ))}
              </tbody>
            </table>
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center text-text-muted py-12 space-y-2">
            <p className="text-sm">No {status} candidates.</p>
            <p className="text-xs">
              Nominations are generated nightly at 03:00 UTC. Use{" "}
              <span className="font-medium">Run nominations now</span> above to
              trigger a fresh run.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-text-muted border-b border-border">
                <tr>
                  <th className="w-8 py-2 px-2">
                    <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
                  </th>
                  <th className="text-left py-2 px-2">Source</th>
                  <th className="text-left py-2 px-2">Target group</th>
                  <th className="text-right py-2 px-2">Score</th>
                  <th className="text-left py-2 px-2">Evidence</th>
                  <th className="text-right py-2 px-2 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 align-top">
                    <td className="py-2 px-2">
                      <Checkbox
                        checked={selected.has(c.id)}
                        onCheckedChange={() => toggleOne(c.id)}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-start gap-2">
                        <Link
                          to="/sources/$handle"
                          params={{ handle: c.source_handle }}
                          className="shrink-0"
                        >
                          <Avatar className="w-8 h-8 hover:ring-2 hover:ring-accent/40 transition">
                            <AvatarImage src={c.source_avatar_url ?? undefined} />
                            <AvatarFallback>{c.source_handle.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                        </Link>
                        <div className="min-w-0">
                          <Link
                            to="/sources/$handle"
                            params={{ handle: c.source_handle }}
                            className="font-medium hover:text-accent hover:underline"
                          >
                            @{c.source_handle}
                          </Link>
                          {c.source_bio && (
                            <div className="text-xs text-text-muted line-clamp-2 max-w-sm">
                              {c.source_bio}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2">{c.group_name}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{c.score.toFixed(2)}</td>
                    <td className="py-2 px-2">
                      <EvidenceChips evidence={c.evidence} />
                    </td>
                    <td className="py-2 px-2 text-right">
                      {status === "pending" ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => approveMut.mutate([c.id])}
                            disabled={approveMut.isPending}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => rejectMut.mutate([c.id])}
                            disabled={rejectMut.isPending}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-text-muted">{status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Panel>
      <div className="space-y-1">
        <div className="text-xs text-text-muted">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </div>
    </Panel>
  );
}

function EvidenceChips({ evidence }: { evidence: CandidateRow["evidence"] }) {
  const bio = evidence.bio_matches ?? [];
  const tags = evidence.hashtag_matches ?? [];
  const items: Array<{ label: string; tip: string }> = [];
  for (const b of bio.slice(0, 2)) {
    items.push({ label: `bio: "${b.value}"`, tip: `weight ${b.weight}` });
  }
  for (const t of tags.slice(0, 3 - items.length > 0 ? 3 - items.length : 0)) {
    items.push({ label: `#${t.tag} ×${t.count}`, tip: `weight ${t.weight}` });
  }
  if (items.length === 0) return <span className="text-xs text-text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it, i) => (
        <Tooltip key={i}>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className="text-[10px] cursor-help">
              {it.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{it.tip}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

// ===========================================================================
// Signals tab — cancer_area_signals editor
// ===========================================================================

function SignalsTab() {
  const list = useServerFn(listSignals);
  const upsert = useServerFn(upsertSignal);
  const remove = useServerFn(deleteSignal);
  const listAreas = useServerFn(listCancerAreasAdmin);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<SignalRow[]>({
    queryKey: ["admin", "signals"],
    queryFn: () => list(),
  });
  const areasQ = useQuery({ queryKey: ["admin", "areas"], queryFn: () => listAreas() });

  const grouped = React.useMemo(() => {
    const m = new Map<string, { name: string; rows: SignalRow[] }>();
    for (const r of data ?? []) {
      const g = m.get(r.cancer_area_id) ?? { name: r.cancer_area_name, rows: [] };
      g.rows.push(r);
      m.set(r.cancer_area_id, g);
    }
    return Array.from(m.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  type UpsertInput = {
    id?: string;
    cancer_area_id: string;
    signal_type: "bio_keyword" | "hashtag";
    value: string;
    weight: number;
    is_active: boolean;
    notes?: string | null;
  };
  const updateMut = useMutation({
    mutationFn: (input: UpsertInput) => upsert({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "signals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin", "signals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [open, setOpen] = React.useState<Record<string, boolean>>({});

  return (
    <div className="space-y-3">
      <div className="text-xs text-text-muted bg-muted/30 border border-border rounded-md p-3">
        Changes take effect on the next nomination run (nightly 03:00 UTC, or
        click <span className="font-medium">Run now</span> in Candidates).
      </div>
      {isLoading ? (
        <Panel loading>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={5} />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        grouped.map((area) => {
          const isOpen = open[area.id] ?? true;
          return (
            <Panel key={area.id}>
              <div className="flex items-center justify-between">
                <button
                  className="flex items-center gap-2 font-medium"
                  onClick={() => setOpen((s) => ({ ...s, [area.id]: !isOpen }))}
                >
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  {area.name}
                  <Badge variant="secondary" className="text-[10px]">
                    {area.rows.length}
                  </Badge>
                </button>
                <AddSignalDialog
                  cancerAreaId={area.id}
                  cancerAreaName={area.name}
                  onSubmit={(input) => updateMut.mutate(input)}
                />
              </div>
              {isOpen && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-text-muted border-b border-border">
                      <tr>
                        <th className="text-left py-2 px-2">Type</th>
                        <th className="text-left py-2 px-2">Value</th>
                        <th className="text-right py-2 px-2 w-24">Weight</th>
                        <th className="text-center py-2 px-2 w-20">Active</th>
                        <th className="text-right py-2 px-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {area.rows.map((r) => (
                        <SignalRowEditor
                          key={r.id}
                          row={r}
                          onSave={(input) => updateMut.mutate(input)}
                          onDelete={() => {
                            if (confirm(`Delete signal "${r.value}"?`)) deleteMut.mutate(r.id);
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          );
        })
      )}
      {grouped.length === 0 && !isLoading && (
        <Panel>
          <p className="text-sm text-text-muted">No signals yet.</p>
        </Panel>
      )}
      {/* Reference areasQ to satisfy linter when grouped covers all areas */}
      <span className="hidden">{areasQ.data?.length ?? 0}</span>
    </div>
  );
}

function SignalRowEditor({
  row,
  onSave,
  onDelete,
}: {
  row: SignalRow;
  onSave: (input: {
    id: string;
    cancer_area_id: string;
    signal_type: "bio_keyword" | "hashtag";
    value: string;
    weight: number;
    is_active: boolean;
    notes?: string | null;
  }) => void;
  onDelete: () => void;
}) {
  const [weight, setWeight] = React.useState(String(row.weight));
  const [active, setActive] = React.useState(row.is_active);

  function commit(nextActive: boolean = active, nextWeight: string = weight) {
    const w = Number(nextWeight);
    if (Number.isNaN(w)) return;
    if (w === row.weight && nextActive === row.is_active) return;
    onSave({
      id: row.id,
      cancer_area_id: row.cancer_area_id,
      signal_type: row.signal_type,
      value: row.value,
      weight: w,
      is_active: nextActive,
      notes: row.notes,
    });
  }

  return (
    <tr className="border-b border-border/50">
      <td className="py-1.5 px-2">
        <Badge variant="outline" className="text-[10px]">
          {row.signal_type === "bio_keyword" ? "bio" : "hashtag"}
        </Badge>
      </td>
      <td className="py-1.5 px-2">
        {row.signal_type === "hashtag" ? `#${row.value}` : row.value}
      </td>
      <td className="py-1.5 px-2 text-right">
        <Input
          type="number"
          step="0.5"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={() => commit(active, weight)}
          className="h-7 w-20 text-right"
        />
      </td>
      <td className="py-1.5 px-2 text-center">
        <Switch
          checked={active}
          onCheckedChange={(v) => {
            setActive(v);
            commit(v, weight);
          }}
        />
      </td>
      <td className="py-1.5 px-2 text-right">
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </td>
    </tr>
  );
}

function AddSignalDialog({
  cancerAreaId,
  cancerAreaName,
  onSubmit,
}: {
  cancerAreaId: string;
  cancerAreaName: string;
  onSubmit: (input: {
    cancer_area_id: string;
    signal_type: "bio_keyword" | "hashtag";
    value: string;
    weight: number;
    is_active: boolean;
    notes?: string | null;
  }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<"bio_keyword" | "hashtag">("bio_keyword");
  const [value, setValue] = React.useState("");
  const [weight, setWeight] = React.useState("1");
  const [notes, setNotes] = React.useState("");

  function reset() {
    setType("bio_keyword");
    setValue("");
    setWeight("1");
    setNotes("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Plus className="w-4 h-4 mr-1" /> Add signal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add signal — {cancerAreaName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bio_keyword">Bio keyword</SelectItem>
                <SelectItem value="hashtag">Hashtag</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Value</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === "hashtag" ? "prostatecancer (no #)" : "prostate cancer"}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Weight</Label>
            <Input
              type="number"
              step="0.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="mt-1 w-32"
            />
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!value.trim()}
            onClick={() => {
              const w = Number(weight);
              if (Number.isNaN(w)) {
                toast.error("Weight must be a number");
                return;
              }
              onSubmit({
                cancer_area_id: cancerAreaId,
                signal_type: type,
                value: value.trim().replace(/^#/, ""),
                weight: w,
                is_active: true,
                notes: notes.trim() || null,
              });
              setOpen(false);
              reset();
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// helper: keep `cn` referenced for future use without warnings
void cn;