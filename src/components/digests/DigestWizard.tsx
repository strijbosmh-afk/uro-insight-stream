import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ArrowRight, ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { createDigest, updateDigest, getDigest } from "@/serverFns/digests";
import { feedService } from "@/services/feedService";

const DAYS = [
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
  { v: 0, l: "Sun" },
];

type Frequency = "daily" | "weekly" | "biweekly" | "monthly";

interface DigestWizardProps {
  digestId?: string | null;
  onClose: (saved: boolean) => void;
}

export function DigestWizard({ digestId, onClose }: DigestWizardProps) {
  const { user, prefs } = useAuth();
  const qc = useQueryClient();
  const createFn = useServerFn(createDigest);
  const updateFn = useServerFn(updateDigest);
  const getFn = useServerFn(getDigest);

  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState("");
  const [frequency, setFrequency] = React.useState<Frequency>(
    (prefs?.digest_default_frequency as Frequency | undefined) ?? "weekly",
  );
  const [dayOfWeek, setDayOfWeek] = React.useState<number>(1);
  const [sendHour, setSendHour] = React.useState<number>(prefs?.digest_default_send_hour ?? 9);
  const [timezone, setTimezone] = React.useState<string>(prefs?.digest_default_timezone ?? "UTC");
  const [isActive, setIsActive] = React.useState<boolean>(prefs?.digests_active_by_default ?? true);
  const [selectedSourceIds, setSelectedSourceIds] = React.useState<string[]>([]);
  const [recipients, setRecipients] = React.useState<string[]>([]);
  const [recipientInput, setRecipientInput] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [sourceFilter, setSourceFilter] = React.useState("");

  // Load user's subscribed sources to choose from.
  const subSourcesQ = useQuery({
    queryKey: ["user-subscribed-sources", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_subscribed_sources")
        .select("source_id, sources(id, handle, display_name)")
        .eq("user_id", user!.id);
      return ((data ?? []) as Array<{
        source_id: string;
        sources: { id: string; handle: string; display_name: string | null } | null;
      }>).map((r) => ({
        id: r.sources?.id ?? r.source_id,
        handle: r.sources?.handle ?? r.source_id,
        display_name: r.sources?.display_name ?? r.source_id,
      }));
    },
  });

  // Hydrate when editing.
  React.useEffect(() => {
    if (!digestId) {
      // Default recipient = user email
      if (user?.email && recipients.length === 0) {
        setRecipients([user.email]);
      }
      if (prefs) {
        setFrequency(prefs.digest_default_frequency as Frequency);
        setSendHour(prefs.digest_default_send_hour);
        setTimezone(prefs.digest_default_timezone);
        setIsActive(prefs.digests_active_by_default);
      }
      return;
    }
    let cancelled = false;
    (async () => {
      const d = await getFn({ data: { id: digestId } });
      if (cancelled || !d) return;
      setName(d.name);
      setFrequency(d.frequency as Frequency);
      setDayOfWeek(d.day_of_week ?? 1);
      setSendHour(d.send_hour);
      setSelectedSourceIds(d.source_ids);
      setRecipients(d.recipients.map((r) => r.email));
      // d may include timezone/is_active depending on serverFn shape
      const dx = d as unknown as { timezone?: string; is_active?: boolean };
      if (dx.timezone) setTimezone(dx.timezone);
      if (typeof dx.is_active === "boolean") setIsActive(dx.is_active);
    })();
    return () => {
      cancelled = true;
    };
  }, [digestId, getFn, user?.email, recipients.length, prefs]);

  const filteredSources = React.useMemo(() => {
    const all = subSourcesQ.data ?? [];
    if (!sourceFilter.trim()) return all;
    const k = sourceFilter.toLowerCase();
    return all.filter(
      (s) =>
        s.handle.toLowerCase().includes(k) ||
        (s.display_name ?? "").toLowerCase().includes(k),
    );
  }, [subSourcesQ.data, sourceFilter]);

  const toggleSource = (id: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const addRecipient = () => {
    const v = recipientInput.trim().toLowerCase();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      toast.error("Invalid email");
      return;
    }
    if (recipients.includes(v)) {
      setRecipientInput("");
      return;
    }
    if (recipients.length >= 20) {
      toast.error("Max 20 recipients");
      return;
    }
    setRecipients([...recipients, v]);
    setRecipientInput("");
  };

  const removeRecipient = (e: string) => {
    setRecipients(recipients.filter((r) => r !== e));
  };

  const canContinue = () => {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return selectedSourceIds.length > 0;
    if (step === 3) return true; // schedule always valid (defaults set)
    if (step === 4) return recipients.length > 0;
    return true;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        frequency,
        day_of_week:
          frequency === "weekly" || frequency === "biweekly" ? dayOfWeek : null,
        send_hour: sendHour,
        timezone,
        is_active: isActive,
        source_ids: selectedSourceIds,
        recipients: recipients.map((email, idx) => ({
          email,
          is_default: idx === 0,
        })),
      };
      if (digestId) {
        await updateFn({ data: { ...payload, id: digestId } });
        toast.success("Digest updated");
      } else {
        await createFn({ data: payload });
        toast.success("Digest created");
      }
      qc.invalidateQueries({ queryKey: ["user-digests"] });
      onClose(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 backdrop-blur-sm p-6">
      <div
        className="relative w-full max-w-2xl flex flex-col"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          minHeight: "520px",
          maxHeight: "90vh",
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "var(--accent)" }}
        />

        <div className="flex-1 overflow-auto p-8">
          <div className="mb-6">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-1">
              {digestId ? "Edit digest" : "New digest"} · Step {step} / 4
            </div>
            <h2 className="text-xl font-semibold text-text-primary">
              {step === 1 && "Name your digest"}
              {step === 2 && "Pick your sources"}
              {step === 3 && "Set the schedule"}
              {step === 4 && "Where should it go?"}
            </h2>
          </div>

          {step === 1 && (
            <div className="space-y-4 max-w-md">
              <div>
                <Label htmlFor="digest-name" className="text-[12px]">
                  Digest name
                </Label>
                <Input
                  id="digest-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Prostate cancer KOLs"
                  className="mt-1"
                  maxLength={120}
                />
                <p className="text-[11px] text-text-muted mt-2">
                  A short label so you can recognise this digest later.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Input
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                placeholder="filter sources…"
                className="h-8 text-[12px]"
              />
              <div className="border border-border rounded-[3px] max-h-[320px] overflow-y-auto">
                {(subSourcesQ.data ?? []).length === 0 && !subSourcesQ.isLoading && (
                  <div className="p-4 text-[12px] text-text-muted">
                    You don't have any subscribed sources yet. Add some from the
                    Sources page first.
                  </div>
                )}
                {filteredSources.map((s) => {
                  const checked = selectedSourceIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 px-3 py-2 border-b border-border cursor-pointer hover:bg-panel-elevated/60"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSource(s.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-text-primary truncate">
                          {s.display_name}
                        </div>
                        <div className="text-[11px] font-mono text-text-muted">
                          @{s.handle}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-text-muted">
                {selectedSourceIds.length} selected
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 max-w-md">
              <div>
                <Label className="text-[12px]">Frequency</Label>
                <Select
                  value={frequency}
                  onValueChange={(v) => setFrequency(v as Frequency)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                    <SelectItem value="monthly">Monthly (~30 days)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(frequency === "weekly" || frequency === "biweekly") && (
                <div>
                  <Label className="text-[12px]">Day of week</Label>
                  <Select
                    value={String(dayOfWeek)}
                    onValueChange={(v) => setDayOfWeek(Number(v))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => (
                        <SelectItem key={d.v} value={String(d.v)}>
                          {d.l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-[12px]">Send hour (UTC)</Label>
                <Select
                  value={String(sendHour)}
                  onValueChange={(v) => setSendHour(Number(v))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, h) => (
                      <SelectItem key={h} value={String(h)}>
                        {String(h).padStart(2, "0")}:00 UTC
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 max-w-md">
              <div className="flex gap-2">
                <Input
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addRecipient();
                    }
                  }}
                  placeholder="recipient@example.com"
                  type="email"
                />
                <Button type="button" variant="outline" onClick={addRecipient}>
                  Add
                </Button>
              </div>
              <div className="space-y-1">
                {recipients.map((r, idx) => (
                  <div
                    key={r}
                    className="flex items-center justify-between px-3 py-2 border border-border rounded-[3px] text-[13px]"
                  >
                    <span className="truncate">
                      {r}
                      {idx === 0 && (
                        <span className="ml-2 text-[10px] font-mono uppercase text-accent">
                          default
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRecipient(r)}
                      className="text-text-muted hover:text-danger"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-text-muted">
                Up to 20 recipients per digest. The first recipient is treated as
                the default.
              </p>
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-between px-8 py-4"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <Button variant="ghost" size="sm" onClick={() => onClose(false)}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(step - 1)}
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            )}
            {step < 4 && (
              <Button
                size="sm"
                onClick={() => setStep(step + 1)}
                disabled={!canContinue()}
              >
                Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {step === 4 && (
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!canContinue() || submitting}
              >
                {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                {digestId ? "Save changes" : "Create digest"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DigestWizard;