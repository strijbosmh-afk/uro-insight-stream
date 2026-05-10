import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Mail,
  ArrowRight,
  AlertTriangle,
  Send,
  Trash2,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/auth/AuthProvider";
import {
  listUserDigests,
  toggleDigest,
  deleteDigest,
  sendDigestNow,
} from "@/serverFns/digests";
import { DigestWizard } from "./DigestWizard";

const DAY_LABELS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

interface Digest {
  id: string;
  name: string;
  frequency: string;
  day_of_week: number | null;
  send_hour: number;
  timezone: string | null;
  is_active: boolean;
  last_sent_at: string | null;
  next_send_at: string | null;
  specialty_id: string | null;
  congress_id: string | null;
  hashtags: string[] | null;
  source_count: number;
  recipient_count: number;
}

function fmtDate(iso: string | null) {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scheduleSummary(d: Digest): string {
  const hour = `${String(d.send_hour).padStart(2, "0")}:00`;
  if (d.frequency === "daily") return `Daily ${hour}`;
  if (d.frequency === "weekly") {
    const day = d.day_of_week != null ? DAY_LABELS[d.day_of_week] : "Mondays";
    return `${day} ${hour}`;
  }
  if (d.frequency === "biweekly") {
    const day = d.day_of_week != null ? DAY_LABELS[d.day_of_week] : "Mondays";
    return `Biweekly ${day} ${hour}`;
  }
  if (d.frequency === "monthly") return `Monthly ${hour}`;
  return `${d.frequency} ${hour}`;
}

function bindingSummary(d: Digest): string {
  const parts: string[] = [];
  if (d.source_count > 0) parts.push(`${d.source_count} source${d.source_count === 1 ? "" : "s"}`);
  if (d.specialty_id) parts.push("specialty");
  if (d.congress_id) parts.push("congress");
  const tagCount = d.hashtags?.length ?? 0;
  if (tagCount > 0) parts.push(`${tagCount} hashtag${tagCount === 1 ? "" : "s"}`);
  return parts.length === 0 ? "no bindings" : parts.join(" + ");
}

export function MobileDigestsList() {
  const { prefs } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listUserDigests);
  const toggleFn = useServerFn(toggleDigest);
  const deleteFn = useServerFn(deleteDigest);
  const sendFn = useServerFn(sendDigestNow);

  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const { data: digests = [], isLoading } = useQuery({
    queryKey: ["user-digests"],
    queryFn: () => listFn() as Promise<Digest[]>,
  });

  const active = digests.filter((d) => d.is_active);
  const paused = digests.filter((d) => !d.is_active);
  const masterPaused = prefs && prefs.digests_master_enabled === false;

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

  const onSendNow = async (id: string) => {
    setBusyId(id);
    try {
      const r = await sendFn({ data: { id } });
      if (r.ok) {
        toast.success("Sent. Check your inbox in a moment.");
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

  const onDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deleteFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["user-digests"] });
      toast.success("Digest deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setWizardOpen(true);
  };
  const openEdit = (id: string) => {
    setEditingId(id);
    setWizardOpen(true);
  };

  const empty = digests.length === 0 && !isLoading;

  return (
    <div className="flex flex-col gap-3 px-4 pt-2 pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-bg/95 backdrop-blur border-b border-border flex items-end justify-between">
        <h1 className="text-[18px] font-semibold text-text-primary">Digests</h1>
        <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
          {active.length} active · {paused.length} paused
        </span>
      </div>

      {masterPaused && (
        <Link
          to="/settings"
          search={{ tab: "notifications" }}
          className="flex items-start gap-3 p-3 rounded-[3px] border border-warning/40 bg-warning/10 text-text-primary"
        >
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div className="flex-1 text-[13px] leading-relaxed">
            All digests are currently paused via Settings → Notifications.
            <span className="block mt-1 text-accent text-[12px] font-medium">
              Enable digests →
            </span>
          </div>
        </Link>
      )}

      {empty ? (
        <div className="flex flex-col items-center text-center gap-3 py-10">
          <Mail className="w-10 h-10 text-text-muted/60" />
          <h2 className="text-[16px] font-semibold text-text-primary">
            No digests yet
          </h2>
          <p className="text-[13px] text-text-muted max-w-xs">
            Create your first digest to get a weekly summary email from your
            subscriptions.
          </p>
          <CreateNewCard onClick={openCreate} />
        </div>
      ) : (
        <>
          <CreateNewCard onClick={openCreate} />

          {active.length > 0 && (
            <SectionHeader label="Active" count={active.length} />
          )}
          {active.map((d) => (
            <SwipeableDigestCard
              key={d.id}
              digest={d}
              busy={busyId === d.id}
              onTap={() => openEdit(d.id)}
              onToggle={() => onToggle(d.id, d.is_active)}
              actions={[
                {
                  label: "Send now",
                  color: "warning",
                  icon: Send,
                  onAction: () => onSendNow(d.id),
                },
                {
                  label: "Delete",
                  color: "danger",
                  icon: Trash2,
                  onAction: () => setConfirmDeleteId(d.id),
                },
              ]}
            />
          ))}

          {paused.length > 0 && (
            <SectionHeader label="Paused" count={paused.length} />
          )}
          {paused.map((d) => (
            <SwipeableDigestCard
              key={d.id}
              digest={d}
              busy={busyId === d.id}
              onTap={() => openEdit(d.id)}
              onToggle={() => onToggle(d.id, d.is_active)}
              actions={[
                {
                  label: "Activate",
                  color: "accent",
                  icon: Play,
                  onAction: () => onToggle(d.id, d.is_active),
                },
                {
                  label: "Delete",
                  color: "danger",
                  icon: Trash2,
                  onAction: () => setConfirmDeleteId(d.id),
                },
              ]}
            />
          ))}
        </>
      )}

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

      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this digest?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Recipients will stop receiving emails for
              this digest.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteId && onDelete(confirmDeleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-1 mt-2 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
      {label} · {count}
    </div>
  );
}

function CreateNewCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full bg-panel border-2 border-accent border-dashed rounded-[4px] p-4 flex items-center gap-3"
    >
      <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
        <Plus className="w-6 h-6 text-accent" />
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="font-semibold text-[15px] text-text-primary">
          Create a new digest
        </div>
        <div className="text-text-muted text-[12px] mt-0.5">
          Get a weekly AI-summarized email from sources, specialties, or
          congresses
        </div>
      </div>
      <ArrowRight className="w-5 h-5 text-accent shrink-0" />
    </button>
  );
}

interface SwipeAction {
  label: string;
  color: "danger" | "warning" | "accent";
  icon: React.ComponentType<{ className?: string }>;
  onAction: () => void;
}

function SwipeableDigestCard({
  digest,
  busy,
  onTap,
  onToggle,
  actions,
}: {
  digest: Digest;
  busy: boolean;
  onTap: () => void;
  onToggle: () => void;
  actions: SwipeAction[];
}) {
  const [offset, setOffset] = React.useState(0);
  const startX = React.useRef<number | null>(null);
  const startedAtSwipe = React.useRef(false);
  const ACTION_WIDTH = 88;
  const REVEAL = ACTION_WIDTH * actions.length;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startedAtSwipe.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) {
      startedAtSwipe.current = true;
      setOffset(Math.max(-REVEAL - 30, dx));
    } else if (offset < 0) {
      setOffset(Math.min(0, -REVEAL + dx));
    }
  };
  const onTouchEnd = () => {
    if (offset < -REVEAL / 2) setOffset(-REVEAL);
    else setOffset(0);
    startX.current = null;
  };

  const handleCardClick = () => {
    if (offset !== 0) {
      setOffset(0);
      return;
    }
    if (startedAtSwipe.current) {
      startedAtSwipe.current = false;
      return;
    }
    onTap();
  };

  const colorClass = (c: SwipeAction["color"]) => {
    if (c === "danger") return "bg-danger text-danger-foreground";
    if (c === "warning") return "bg-warning text-warning-foreground";
    return "bg-accent text-accent-foreground";
  };

  return (
    <div className="relative overflow-hidden rounded-[4px]">
      {/* Action layer */}
      <div className="absolute inset-y-0 right-0 flex">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.label}
              type="button"
              disabled={busy}
              onClick={() => {
                a.onAction();
                setOffset(0);
              }}
              style={{ width: ACTION_WIDTH }}
              className={
                "h-full inline-flex flex-col items-center justify-center gap-1 text-[11px] font-medium " +
                colorClass(a.color)
              }
            >
              <Icon className="w-4 h-4" />
              {a.label}
            </button>
          );
        })}
      </div>

      {/* Card content */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClick={handleCardClick}
        style={{
          transform: `translateX(${offset}px)`,
          transition: startX.current == null ? "transform 200ms" : "none",
        }}
        className="relative w-full bg-panel border border-border rounded-[4px] p-3 flex items-center gap-3 cursor-pointer"
      >
        <div className="w-10 h-10 rounded-[3px] bg-panel-elevated flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px] text-text-primary truncate">
            {digest.name}
          </div>
          <div className="text-text-muted text-[12px] mt-0.5 truncate">
            {scheduleSummary(digest)} · {bindingSummary(digest)}
          </div>
          <div className="text-text-muted text-[11px] font-mono mt-1">
            Last sent: {fmtDate(digest.last_sent_at)}
          </div>
        </div>
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <Switch checked={digest.is_active} onCheckedChange={onToggle} disabled={busy} />
        </div>
      </div>
    </div>
  );
}

export default MobileDigestsList;
