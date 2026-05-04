import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Mail, Loader2, Trash2, Send, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/shell/Panel";
import { EmptyState } from "@/components/shell/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  listUserDigests,
  toggleDigest,
  deleteDigest,
  sendDigestNow,
} from "@/serverFns/digests";
import { DigestWizard } from "./DigestWizard";

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DigestsList() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUserDigests);
  const toggleFn = useServerFn(toggleDigest);
  const deleteFn = useServerFn(deleteDigest);
  const sendFn = useServerFn(sendDigestNow);

  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const { data: digests = [], isLoading } = useQuery({
    queryKey: ["user-digests"],
    queryFn: () => listFn(),
  });

  const onToggle = async (id: string, current: boolean) => {
    setBusyId(id);
    try {
      await toggleFn({ data: { id, is_active: !current } });
      qc.invalidateQueries({ queryKey: ["user-digests"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this digest? This cannot be undone.")) return;
    setBusyId(id);
    try {
      await deleteFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["user-digests"] });
      toast.success("Digest deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  };

  const onSendNow = async (id: string) => {
    setBusyId(id);
    try {
      const r = await sendFn({ data: { id } });
      if (r.ok) {
        toast.success(
          `Queued ${r.enqueued} email${r.enqueued === 1 ? "" : "s"}${
            r.skipped ? ` (${r.skipped} skipped)` : ""
          }`,
        );
      } else {
        toast.error(r.reason ?? "Failed to send");
      }
      qc.invalidateQueries({ queryKey: ["user-digests"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-3">
      <Panel
        title={
          <span>
            Digests
            <span className="text-text-muted font-normal normal-case tracking-normal">
              {" "}· {digests.length}
            </span>
          </span>
        }
        actions={
          <Button size="sm" onClick={() => { setEditingId(null); setWizardOpen(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            New digest
          </Button>
        }
        loading={isLoading}
        className="flex-1 min-h-0"
        bodyClassName="overflow-y-auto"
      >
        {digests.length === 0 && !isLoading ? (
          <EmptyState
            icon={Mail}
            caption="No digests yet · Create your first to receive a recurring email summary of your favourite sources."
            secondary={{
              label: "Create your first digest",
              onClick: () => {
                setEditingId(null);
                setWizardOpen(true);
              },
            }}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-[10px]">Name</TableHead>
                <TableHead className="w-28 text-[10px]">Frequency</TableHead>
                <TableHead className="w-20 text-[10px] text-right">Sources</TableHead>
                <TableHead className="w-24 text-[10px] text-right">Recipients</TableHead>
                <TableHead className="w-40 text-[10px]">Next send</TableHead>
                <TableHead className="w-40 text-[10px]">Last sent</TableHead>
                <TableHead className="w-24 text-[10px]">Status</TableHead>
                <TableHead className="w-48 text-[10px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {digests.map((d: any) => (
                <TableRow key={d.id} className="border-border">
                  <TableCell
                    className="text-[13px] text-text-primary cursor-pointer"
                    onClick={() => {
                      setEditingId(d.id);
                      setWizardOpen(true);
                    }}
                  >
                    {d.name}
                  </TableCell>
                  <TableCell className="text-[11px] font-mono uppercase text-text-muted">
                    {d.frequency}
                  </TableCell>
                  <TableCell className="text-right text-[12px] font-mono text-accent">
                    {d.source_count}
                  </TableCell>
                  <TableCell className="text-right text-[12px] font-mono text-accent">
                    {d.recipient_count}
                  </TableCell>
                  <TableCell className="text-[11px] font-mono text-text-muted">
                    {fmt(d.next_send_at)}
                  </TableCell>
                  <TableCell className="text-[11px] font-mono text-text-muted">
                    {fmt(d.last_sent_at)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center h-5 px-2 rounded-[2px] border text-[10px] font-mono uppercase tracking-wider ${
                        d.is_active
                          ? "border-success/40 text-success bg-success/10"
                          : "border-border text-text-muted bg-panel-elevated"
                      }`}
                    >
                      {d.is_active ? "active" : "paused"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        disabled={busyId === d.id}
                        onClick={() => onSendNow(d.id)}
                        title="Send now"
                      >
                        {busyId === d.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        disabled={busyId === d.id}
                        onClick={() => onToggle(d.id, d.is_active)}
                        title={d.is_active ? "Pause" : "Resume"}
                      >
                        {d.is_active ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-danger hover:text-danger"
                        disabled={busyId === d.id}
                        onClick={() => onDelete(d.id)}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {wizardOpen && (
        <DigestWizard
          digestId={editingId}
          onClose={(saved) => {
            setWizardOpen(false);
            setEditingId(null);
            if (saved) qc.invalidateQueries({ queryKey: ["user-digests"] });
          }}
        />
      )}
    </div>
  );
}

export default DigestsList;