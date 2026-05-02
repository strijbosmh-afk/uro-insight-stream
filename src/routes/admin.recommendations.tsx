import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, Trash2, Plus, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/recommendations")({
  head: () => ({ meta: [{ title: "Recommendations — UroFeed admin" }] }),
  component: RecommendationsPage,
});

type Specialty = { id: string; label: string };
type RecRow = {
  id: string;
  specialty_id: string;
  weight: number;
  note: string | null;
};
type SourceRec = RecRow & { source_id: string };
type CongressRec = RecRow & { congress_id: string };
type HashtagRec = RecRow & { hashtag_id: string };

function useSpecialties() {
  return useQuery({
    queryKey: ["urology-specialties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("urology_specialties")
        .select("id,label")
        .order("sort_order");
      if (error) throw error;
      return data as Specialty[];
    },
  });
}

function RecommendationsPage() {
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
        <Panel title="Access denied">
          <p className="text-sm text-text-muted">
            This page is admin-only. <Link to="/dashboard" className="text-accent underline">Go to dashboard</Link>.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <EmptyStateBanner />
      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources">Sources × specialty</TabsTrigger>
          <TabsTrigger value="congresses">Congresses × specialty</TabsTrigger>
          <TabsTrigger value="hashtags">Hashtags × specialty</TabsTrigger>
        </TabsList>
        <TabsContent value="sources" className="mt-4">
          <SourcesMatrix />
        </TabsContent>
        <TabsContent value="congresses" className="mt-4">
          <CongressesMatrix />
        </TabsContent>
        <TabsContent value="hashtags" className="mt-4">
          <HashtagsMatrix />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyStateBanner() {
  const { data: counts } = useQuery({
    queryKey: ["rec-counts"],
    queryFn: async () => {
      const [s, c, h] = await Promise.all([
        supabase.from("recommended_sources_by_specialty").select("id", { count: "exact", head: true }),
        supabase.from("recommended_congresses_by_specialty").select("id", { count: "exact", head: true }),
        supabase.from("recommended_hashtags_by_specialty").select("id", { count: "exact", head: true }),
      ]);
      return {
        sources: s.count ?? 0,
        congresses: c.count ?? 0,
        hashtags: h.count ?? 0,
      };
    },
  });
  const total = (counts?.sources ?? 0) + (counts?.congresses ?? 0) + (counts?.hashtags ?? 0);
  if (total > 0) return null;
  return (
    <div className="border border-amber-500/40 bg-amber-500/5 rounded-[3px] p-3 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="text-[13px] text-text-primary">
        <strong>No recommendations configured yet.</strong>{" "}
        <span className="text-text-muted">
          New users will see only the “+ Add custom” paths until you populate at least one specialty.
        </span>
      </div>
    </div>
  );
}

/* -------------------- SOURCES MATRIX -------------------- */

function SourcesMatrix() {
  const qc = useQueryClient();
  const { data: specialties = [] } = useSpecialties();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["rec-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recommended_sources_by_specialty")
        .select("id, specialty_id, source_id, weight, note");
      if (error) throw error;
      return data as SourceRec[];
    },
  });
  const { data: sources = [] } = useQuery({
    queryKey: ["sources-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sources")
        .select("id, handle, display_name, role")
        .order("handle")
        .limit(1000);
      if (error) throw error;
      return data as { id: string; handle: string; display_name: string; role: string }[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["rec-sources"] });
    qc.invalidateQueries({ queryKey: ["rec-counts"] });
  };

  return (
    <Panel
      title="Recommended sources by specialty"
      actions={
        <CsvImport
          template="specialty_id,source_id,weight,note"
          onRows={async (records) => {
            const payload = records
              .map((r) => ({
                specialty_id: r.specialty_id?.trim(),
                source_id: r.source_id?.trim(),
                weight: Number(r.weight ?? 50),
                note: r.note ?? null,
              }))
              .filter((r) => r.specialty_id && r.source_id);
            const { error } = await supabase
              .from("recommended_sources_by_specialty")
              .upsert(payload, { onConflict: "specialty_id,source_id" });
            if (error) throw error;
            refresh();
          }}
        />
      }
    >
      <Matrix
        loading={isLoading}
        specialties={specialties}
        rows={rows.map((r) => ({ ...r, item_id: r.source_id }))}
        itemHeader="Source"
        renderItem={(itemId) => {
          const s = sources.find((x) => x.id === itemId);
          return s ? (
            <span>
              <span className="font-mono text-accent">@{s.handle}</span>{" "}
              <span className="text-[11px] text-text-muted">{s.display_name}</span>
            </span>
          ) : (
            <span className="font-mono text-text-muted">{itemId}</span>
          );
        }}
        addPicker={
          <SourceTypeahead
            sources={sources}
            existing={new Set(rows.map((r) => r.source_id))}
            onPick={async (sourceId) => {
              const firstSpec = specialties[0]?.id;
              if (!firstSpec) {
                toast.error("Add a specialty first");
                return;
              }
              await supabase.from("recommended_sources_by_specialty").insert({
                specialty_id: firstSpec,
                source_id: sourceId,
                weight: 50,
              });
              refresh();
            }}
          />
        }
        onCellSave={async (rowId, specialtyId, weight, note, itemId) => {
          if (rowId) {
            await supabase
              .from("recommended_sources_by_specialty")
              .update({ weight, note })
              .eq("id", rowId);
          } else {
            await supabase.from("recommended_sources_by_specialty").insert({
              specialty_id: specialtyId,
              source_id: itemId,
              weight,
              note,
            });
          }
          refresh();
        }}
        onCellDelete={async (rowId) => {
          await supabase.from("recommended_sources_by_specialty").delete().eq("id", rowId);
          refresh();
        }}
        onItemDelete={async (itemId) => {
          await supabase.from("recommended_sources_by_specialty").delete().eq("source_id", itemId);
          refresh();
        }}
      />
    </Panel>
  );
}

/* -------------------- CONGRESSES MATRIX -------------------- */

function CongressesMatrix() {
  const qc = useQueryClient();
  const { data: specialties = [] } = useSpecialties();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["rec-congresses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recommended_congresses_by_specialty")
        .select("id, specialty_id, congress_id, weight, note");
      if (error) throw error;
      return data as CongressRec[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["rec-congresses"] });
    qc.invalidateQueries({ queryKey: ["rec-counts"] });
  };

  return (
    <Panel
      title="Recommended congresses by specialty"
      actions={
        <CsvImport
          template="specialty_id,congress_id,weight,note"
          onRows={async (records) => {
            const payload = records
              .map((r) => ({
                specialty_id: r.specialty_id?.trim(),
                congress_id: r.congress_id?.trim(),
                weight: Number(r.weight ?? 50),
                note: r.note ?? null,
              }))
              .filter((r) => r.specialty_id && r.congress_id);
            const { error } = await supabase
              .from("recommended_congresses_by_specialty")
              .upsert(payload, { onConflict: "specialty_id,congress_id" });
            if (error) throw error;
            refresh();
          }}
        />
      }
    >
      <Matrix
        loading={isLoading}
        specialties={specialties}
        rows={rows.map((r) => ({ ...r, item_id: r.congress_id }))}
        itemHeader="Congress"
        renderItem={(itemId) => <span className="font-mono text-accent">{itemId}</span>}
        addPicker={
          <FreeTextAdder
            placeholder="cong_eau26"
            existing={new Set(rows.map((r) => r.congress_id))}
            onAdd={async (id) => {
              const firstSpec = specialties[0]?.id;
              if (!firstSpec) return;
              await supabase.from("recommended_congresses_by_specialty").insert({
                specialty_id: firstSpec,
                congress_id: id,
                weight: 50,
              });
              refresh();
            }}
          />
        }
        onCellSave={async (rowId, specialtyId, weight, note, itemId) => {
          if (rowId) {
            await supabase
              .from("recommended_congresses_by_specialty")
              .update({ weight, note })
              .eq("id", rowId);
          } else {
            await supabase.from("recommended_congresses_by_specialty").insert({
              specialty_id: specialtyId,
              congress_id: itemId,
              weight,
              note,
            });
          }
          refresh();
        }}
        onCellDelete={async (rowId) => {
          await supabase.from("recommended_congresses_by_specialty").delete().eq("id", rowId);
          refresh();
        }}
        onItemDelete={async (itemId) => {
          await supabase.from("recommended_congresses_by_specialty").delete().eq("congress_id", itemId);
          refresh();
        }}
      />
    </Panel>
  );
}

/* -------------------- HASHTAGS MATRIX -------------------- */

function HashtagsMatrix() {
  const qc = useQueryClient();
  const { data: specialties = [] } = useSpecialties();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["rec-hashtags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recommended_hashtags_by_specialty")
        .select("id, specialty_id, hashtag_id, weight, note");
      if (error) throw error;
      return data as HashtagRec[];
    },
  });
  const { data: hashtags = [] } = useQuery({
    queryKey: ["hashtags-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hashtags")
        .select("id, tag")
        .order("tag")
        .limit(1000);
      if (error) throw error;
      return data as { id: string; tag: string }[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["rec-hashtags"] });
    qc.invalidateQueries({ queryKey: ["rec-counts"] });
  };

  return (
    <Panel
      title="Recommended hashtags by specialty"
      actions={
        <CsvImport
          template="specialty_id,hashtag_id,weight,note"
          onRows={async (records) => {
            const payload = records
              .map((r) => ({
                specialty_id: r.specialty_id?.trim(),
                hashtag_id: r.hashtag_id?.trim(),
                weight: Number(r.weight ?? 50),
                note: r.note ?? null,
              }))
              .filter((r) => r.specialty_id && r.hashtag_id);
            const { error } = await supabase
              .from("recommended_hashtags_by_specialty")
              .upsert(payload, { onConflict: "specialty_id,hashtag_id" });
            if (error) throw error;
            refresh();
          }}
        />
      }
    >
      <Matrix
        loading={isLoading}
        specialties={specialties}
        rows={rows.map((r) => ({ ...r, item_id: r.hashtag_id }))}
        itemHeader="Hashtag"
        renderItem={(itemId) => {
          const h = hashtags.find((x) => x.id === itemId);
          return <span className="font-mono text-accent">#{h?.tag ?? itemId}</span>;
        }}
        addPicker={
          <HashtagTypeahead
            hashtags={hashtags}
            existing={new Set(rows.map((r) => r.hashtag_id))}
            onPick={async (id) => {
              const firstSpec = specialties[0]?.id;
              if (!firstSpec) return;
              await supabase.from("recommended_hashtags_by_specialty").insert({
                specialty_id: firstSpec,
                hashtag_id: id,
                weight: 50,
              });
              refresh();
            }}
          />
        }
        onCellSave={async (rowId, specialtyId, weight, note, itemId) => {
          if (rowId) {
            await supabase
              .from("recommended_hashtags_by_specialty")
              .update({ weight, note })
              .eq("id", rowId);
          } else {
            await supabase.from("recommended_hashtags_by_specialty").insert({
              specialty_id: specialtyId,
              hashtag_id: itemId,
              weight,
              note,
            });
          }
          refresh();
        }}
        onCellDelete={async (rowId) => {
          await supabase.from("recommended_hashtags_by_specialty").delete().eq("id", rowId);
          refresh();
        }}
        onItemDelete={async (itemId) => {
          await supabase.from("recommended_hashtags_by_specialty").delete().eq("hashtag_id", itemId);
          refresh();
        }}
      />
    </Panel>
  );
}

/* -------------------- SHARED MATRIX -------------------- */

type GenericRow = {
  id: string;
  specialty_id: string;
  item_id: string;
  weight: number;
  note: string | null;
};

function Matrix({
  loading,
  specialties,
  rows,
  itemHeader,
  renderItem,
  addPicker,
  onCellSave,
  onCellDelete,
  onItemDelete,
}: {
  loading: boolean;
  specialties: Specialty[];
  rows: GenericRow[];
  itemHeader: string;
  renderItem: (itemId: string) => React.ReactNode;
  addPicker: React.ReactNode;
  onCellSave: (
    rowId: string | null,
    specialtyId: string,
    weight: number,
    note: string | null,
    itemId: string,
  ) => Promise<void>;
  onCellDelete: (rowId: string) => Promise<void>;
  onItemDelete: (itemId: string) => Promise<void>;
}) {
  const items = React.useMemo(() => Array.from(new Set(rows.map((r) => r.item_id))), [rows]);
  const cellByKey = React.useMemo(() => {
    const m = new Map<string, GenericRow>();
    for (const r of rows) m.set(`${r.item_id}::${r.specialty_id}`, r);
    return m;
  }, [rows]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-text-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>{addPicker}</div>
      {items.length === 0 ? (
        <p className="text-[12px] text-text-muted italic">No items yet — add one above.</p>
      ) : (
        <div className="overflow-auto border border-border rounded-[3px]">
          <table className="min-w-full text-[12px]">
            <thead className="bg-panel-elevated/40 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-mono uppercase tracking-wider text-[10px] text-text-muted border-b border-border min-w-[200px]">
                  {itemHeader}
                </th>
                {specialties.map((s) => (
                  <th
                    key={s.id}
                    className="text-left px-2 py-2 font-mono uppercase tracking-wider text-[10px] text-text-muted border-b border-border min-w-[140px]"
                    title={s.id}
                  >
                    {s.label}
                  </th>
                ))}
                <th className="border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {items.map((itemId) => (
                <tr key={itemId} className="border-b border-border/60">
                  <td className="px-3 py-2 align-top">{renderItem(itemId)}</td>
                  {specialties.map((s) => {
                    const cell = cellByKey.get(`${itemId}::${s.id}`);
                    return (
                      <td key={s.id} className="px-2 py-1.5 align-top">
                        <Cell
                          cell={cell}
                          onSave={(weight, note) =>
                            onCellSave(cell?.id ?? null, s.id, weight, note, itemId)
                          }
                          onDelete={cell ? () => onCellDelete(cell.id) : undefined}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 align-top">
                    <button
                      type="button"
                      onClick={() => onItemDelete(itemId)}
                      className="text-text-muted hover:text-destructive"
                      title="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Cell({
  cell,
  onSave,
  onDelete,
}: {
  cell?: GenericRow;
  onSave: (weight: number, note: string | null) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [weight, setWeight] = React.useState<string>(cell ? String(cell.weight) : "");
  const [note, setNote] = React.useState<string>(cell?.note ?? "");
  React.useEffect(() => {
    setWeight(cell ? String(cell.weight) : "");
    setNote(cell?.note ?? "");
  }, [cell?.id, cell?.weight, cell?.note]);

  const commit = async () => {
    const w = Number(weight);
    if (weight === "" || Number.isNaN(w)) {
      if (cell && onDelete) await onDelete();
      return;
    }
    if (w < 0 || w > 100) {
      toast.error("Weight must be 0–100");
      return;
    }
    await onSave(w, note.trim() || null);
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={commit}
        placeholder="—"
        className={cn("h-7 px-1.5 py-0 text-[12px] w-16", cell ? "border-accent/40" : "")}
      />
      {cell && (
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commit}
          placeholder="note"
          className="h-6 px-1.5 py-0 text-[11px]"
        />
      )}
    </div>
  );
}

/* -------------------- PICKERS -------------------- */

function SourceTypeahead({
  sources,
  existing,
  onPick,
}: {
  sources: { id: string; handle: string; display_name: string; role: string }[];
  existing: Set<string>;
  onPick: (id: string) => void | Promise<void>;
}) {
  const [q, setQ] = React.useState("");
  const matches = React.useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.trim().toLowerCase().replace(/^@/, "");
    return sources
      .filter((s) => !existing.has(s.id))
      .filter((s) => s.handle.toLowerCase().includes(needle) || s.display_name.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [sources, existing, q]);
  return (
    <div className="flex flex-col gap-1 max-w-md">
      <div className="flex items-center gap-2">
        <Plus className="w-3.5 h-3.5 text-text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a source…" className="h-8" />
      </div>
      {matches.length > 0 && (
        <div className="border border-border rounded-[3px] divide-y divide-border">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                void onPick(m.id);
                setQ("");
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-panel-elevated/60 text-[12px]"
            >
              <span className="font-mono text-accent">@{m.handle}</span>{" "}
              <span className="text-text-muted">{m.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HashtagTypeahead({
  hashtags,
  existing,
  onPick,
}: {
  hashtags: { id: string; tag: string }[];
  existing: Set<string>;
  onPick: (id: string) => void | Promise<void>;
}) {
  const [q, setQ] = React.useState("");
  const matches = React.useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.trim().toLowerCase().replace(/^#/, "");
    return hashtags
      .filter((h) => !existing.has(h.id))
      .filter((h) => h.tag.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [hashtags, existing, q]);
  return (
    <div className="flex flex-col gap-1 max-w-md">
      <div className="flex items-center gap-2">
        <Plus className="w-3.5 h-3.5 text-text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a hashtag…" className="h-8" />
      </div>
      {matches.length > 0 && (
        <div className="border border-border rounded-[3px] divide-y divide-border">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                void onPick(m.id);
                setQ("");
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-panel-elevated/60 text-[12px]"
            >
              <span className="font-mono text-accent">#{m.tag}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FreeTextAdder({
  placeholder,
  existing,
  onAdd,
}: {
  placeholder: string;
  existing: Set<string>;
  onAdd: (id: string) => Promise<void>;
}) {
  const [v, setV] = React.useState("");
  return (
    <div className="flex items-center gap-2 max-w-md">
      <Plus className="w-3.5 h-3.5 text-text-muted" />
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="h-8"
        onKeyDown={(e) => {
          if (e.key === "Enter" && v.trim() && !existing.has(v.trim())) {
            void onAdd(v.trim()).then(() => setV(""));
          }
        }}
      />
      <Button
        size="sm"
        onClick={() => {
          if (v.trim() && !existing.has(v.trim())) void onAdd(v.trim()).then(() => setV(""));
        }}
      >
        Add
      </Button>
    </div>
  );
}

/* -------------------- CSV IMPORT -------------------- */

function CsvImport({
  template,
  onRows,
}: {
  template: string;
  onRows: (records: Record<string, string>[]) => Promise<void>;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const records = parseCsv(text);
      if (records.length === 0) throw new Error("CSV has no data rows");
      await onRows(records);
      toast.success(`Imported ${records.length} row(s)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Import failed";
      toast.error(msg);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">{template}</span>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        <span className="ml-1.5">CSV</span>
      </Button>
    </div>
  );
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => (rec[h] = (cols[i] ?? "").trim()));
    return rec;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

// suppress unused redirect import warning (kept for future auth gate)
void redirect;