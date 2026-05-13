import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X, Sparkles, Calendar, Settings2, Plus } from "lucide-react";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { createDigest, updateDigest, getDigest } from "@/serverFns/digests";
import { DigestPreviewDialog } from "./DigestPreviewDialog";

const DAYS = [
  { v: 1, l: "M" },
  { v: 2, l: "T" },
  { v: 3, l: "W" },
  { v: 4, l: "T" },
  { v: 5, l: "F" },
  { v: 6, l: "S" },
  { v: 0, l: "S" },
];

type Frequency = "daily" | "weekly" | "biweekly" | "monthly";

interface Props {
  digestId?: string | null;
  onClose: (saved: boolean) => void;
}

export function MobileDigestWizard({ digestId, onClose }: Props) {
  const { user, prefs } = useAuth();
  const qc = useQueryClient();
  const createFn = useServerFn(createDigest);
  const updateFn = useServerFn(updateDigest);
  const getFn = useServerFn(getDigest);

  const [name, setName] = React.useState("");
  const [frequency, setFrequency] = React.useState<Frequency>(
    (prefs?.digest_default_frequency as Frequency | undefined) ?? "weekly",
  );
  const [dayOfWeek, setDayOfWeek] = React.useState<number>(1);
  const [sendHour, setSendHour] = React.useState<number>(prefs?.digest_default_send_hour ?? 9);
  const [timezone, setTimezone] = React.useState<string>(prefs?.digest_default_timezone ?? "UTC");
  const [isActive, setIsActive] = React.useState<boolean>(prefs?.digests_active_by_default ?? true);
  const [selectedSourceIds, setSelectedSourceIds] = React.useState<string[]>([]);
  const [specialtyId, setSpecialtyId] = React.useState<string | null>(null);
  const [congressId, setCongressId] = React.useState<string | null>(null);
  const [hashtags, setHashtags] = React.useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = React.useState("");
  const [recipients, setRecipients] = React.useState<string[]>([]);
  const [recipientInput, setRecipientInput] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [shake, setShake] = React.useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);

  const nameRef = React.useRef<HTMLInputElement>(null);
  const nameWrapRef = React.useRef<HTMLDivElement>(null);
  const bindingsRef = React.useRef<HTMLDivElement>(null);
  const recipientsRef = React.useRef<HTMLDivElement>(null);

  // Subscribed sources
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

  const userSpecialtiesQ = useQuery({
    queryKey: ["user-specialties-for-digest", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: specs } = await supabase
        .from("user_specialties")
        .select("specialty_id, is_primary")
        .eq("user_id", user!.id);
      const ids = ((specs ?? []) as Array<{ specialty_id: string; is_primary: boolean }>).map(
        (r) => r.specialty_id,
      );
      if (ids.length === 0)
        return { items: [] as Array<{ id: string; label: string; is_primary: boolean }>, primaryId: null as string | null };
      const { data: labels } = await supabase
        .from("urology_specialties")
        .select("id, label")
        .in("id", ids);
      const labelMap = new Map(((labels ?? []) as Array<{ id: string; label: string }>).map((r) => [r.id, r.label]));
      const items = ((specs ?? []) as Array<{ specialty_id: string; is_primary: boolean }>).map((r) => ({
        id: r.specialty_id,
        label: labelMap.get(r.specialty_id) ?? r.specialty_id,
        is_primary: r.is_primary,
      }));
      const primary = items.find((i) => i.is_primary) ?? items[0] ?? null;
      return { items, primaryId: primary?.id ?? null };
    },
  });

  const congressesQ = useQuery({
    queryKey: ["digests-congresses-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("congresses")
        .select("id, name, short_code, status")
        .order("start_date", { ascending: false });
      return (data ?? []) as Array<{
        id: string; name: string; short_code: string; status: string;
      }>;
    },
  });
  const liveCongresses = (congressesQ.data ?? []).filter((c) => c.status === "live");

  // Hydrate when editing
  React.useEffect(() => {
    if (!digestId) {
      if (user?.email && recipients.length === 0) setRecipients([user.email]);
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
      const dx = d as unknown as {
        timezone?: string;
        is_active?: boolean;
        specialty_id?: string | null;
        congress_id?: string | null;
        hashtags?: string[];
      };
      if (dx.timezone) setTimezone(dx.timezone);
      if (typeof dx.is_active === "boolean") setIsActive(dx.is_active);
      setSpecialtyId(dx.specialty_id ?? null);
      setCongressId(dx.congress_id ?? null);
      setHashtags(Array.isArray(dx.hashtags) ? dx.hashtags : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [digestId, getFn, user?.email, recipients.length]);

  React.useEffect(() => {
    // Autofocus name on open for new digests
    if (!digestId) {
      const t = setTimeout(() => nameRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [digestId]);

  const applyPreset = (p: "specialty" | "congress" | "custom") => {
    if (p === "specialty") {
      const id = userSpecialtiesQ.data?.primaryId ?? null;
      if (!id) {
        toast.error("Set a primary specialty in Settings → Profile first");
        return;
      }
      setSpecialtyId(id);
      if (!name) setName("My specialty digest");
    } else if (p === "congress") {
      if (liveCongresses.length === 1) {
        setCongressId(liveCongresses[0].id);
        if (!name) setName(`${liveCongresses[0].short_code || liveCongresses[0].name} digest`);
      }
    } else {
      // Custom — clear all
      setSpecialtyId(null);
      setCongressId(null);
      setSelectedSourceIds([]);
      setHashtags([]);
    }
  };

  const hasAnyBinding =
    selectedSourceIds.length > 0 || !!specialtyId || !!congressId || hashtags.length > 0;
  const valid = name.trim().length > 0 && hasAnyBinding && recipients.length > 0;

  const triggerShake = (which: "name" | "bindings" | "recipients") => {
    setShake(which);
    const ref = which === "name" ? nameWrapRef : which === "bindings" ? bindingsRef : recipientsRef;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setShake(null), 600);
  };

  const handleSave = async () => {
    if (!valid) {
      if (!name.trim()) triggerShake("name");
      else if (!hasAnyBinding) triggerShake("bindings");
      else triggerShake("recipients");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        frequency,
        day_of_week: frequency === "weekly" || frequency === "biweekly" ? dayOfWeek : null,
        send_hour: sendHour,
        timezone,
        is_active: isActive,
        source_ids: selectedSourceIds,
        specialty_id: specialtyId,
        congress_id: congressId,
        hashtags,
        recipients: recipients.map((email, idx) => ({ email, is_default: idx === 0 })),
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

  const addHashtag = () => {
    const v = hashtagInput.trim().replace(/^#/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!v) return;
    if (hashtags.includes(v)) {
      setHashtagInput("");
      return;
    }
    if (hashtags.length >= 50) return;
    setHashtags([...hashtags, v]);
    setHashtagInput("");
  };

  const shakeCls = (k: string) => (shake === k ? "animate-pulse ring-2 ring-danger rounded-[3px]" : "");

  return (
    <Sheet open onOpenChange={(o) => !o && onClose(false)}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] max-h-[100dvh] p-0 flex flex-col gap-0"
      >
        {/* Header */}
        <div className="h-12 px-2 flex items-center gap-2 border-b border-border shrink-0">
          <button
            type="button"
            onClick={() => onClose(false)}
            aria-label="Close"
            className="w-11 h-11 inline-flex items-center justify-center text-text-primary"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 text-center text-[15px] font-semibold text-text-primary">
            {digestId ? "Edit digest" : "New digest"}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className={
              "h-11 px-4 rounded-[3px] text-[14px] font-semibold inline-flex items-center justify-center " +
              (valid
                ? "bg-accent text-accent-foreground"
                : "bg-panel-elevated text-text-muted")
            }
          >
            {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-6 pb-12">
          {/* Quick start presets (only for new) */}
          {!digestId && (
            <div className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
                Quick start
              </div>
              <PresetButton
                icon={Sparkles}
                label="My specialty digest"
                hint={
                  userSpecialtiesQ.data?.primaryId
                    ? "Auto-fill primary specialty"
                    : "Set a primary specialty first"
                }
                disabled={!userSpecialtiesQ.data?.primaryId}
                onClick={() => applyPreset("specialty")}
              />
              <PresetButton
                icon={Calendar}
                label="Active congress digest"
                hint={
                  liveCongresses.length === 0
                    ? "No live congresses right now"
                    : liveCongresses.length === 1
                      ? `Auto-fill ${liveCongresses[0].short_code || liveCongresses[0].name}`
                      : `Pick from ${liveCongresses.length} live`
                }
                disabled={liveCongresses.length === 0}
                onClick={() => applyPreset("congress")}
              />
              <PresetButton
                icon={Settings2}
                label="Custom"
                hint="Pick sources, specialty, congress, hashtags"
                onClick={() => applyPreset("custom")}
              />
            </div>
          )}

          {/* Name */}
          <div ref={nameWrapRef} className={shakeCls("name")}>
            <SectionLabel>Name</SectionLabel>
            <Input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Prostate cancer KOLs"
              maxLength={120}
              className="h-11 text-[15px]"
            />
          </div>

          {/* Schedule */}
          <div className="space-y-3">
            <SectionLabel>Schedule</SectionLabel>
            <div className="flex gap-1 bg-panel-elevated rounded-[3px] p-1">
              {(["daily", "weekly", "biweekly", "monthly"] as Frequency[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFrequency(f)}
                  className={
                    "flex-1 h-9 text-[12px] font-medium rounded-[2px] capitalize " +
                    (frequency === f
                      ? "bg-accent text-accent-foreground"
                      : "text-text-muted")
                  }
                >
                  {f}
                </button>
              ))}
            </div>
            {(frequency === "weekly" || frequency === "biweekly") && (
              <div className="flex gap-1">
                {DAYS.map((d) => (
                  <button
                    key={d.v}
                    type="button"
                    onClick={() => setDayOfWeek(d.v)}
                    className={
                      "flex-1 h-10 rounded-[3px] text-[13px] font-medium border " +
                      (dayOfWeek === d.v
                        ? "bg-accent border-accent text-accent-foreground"
                        : "bg-panel border-border text-text-primary")
                    }
                  >
                    {d.l}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <label className="text-[13px] text-text-primary shrink-0">Send at</label>
              <input
                type="time"
                value={`${String(sendHour).padStart(2, "0")}:00`}
                onChange={(e) => {
                  const [h] = e.target.value.split(":");
                  const n = Number(h);
                  if (!Number.isNaN(n)) setSendHour(n);
                }}
                className="h-11 px-3 rounded-[3px] border border-border bg-panel text-[15px] text-text-primary"
              />
              <span className="ml-auto text-[11px] font-mono text-text-muted">
                {timezone}
              </span>
            </div>
          </div>

          {/* Content sources */}
          <div ref={bindingsRef} className={"space-y-2 " + shakeCls("bindings")}>
            <SectionLabel>Content</SectionLabel>
            <Accordion
              label="Sources"
              count={selectedSourceIds.length}
              defaultOpen={selectedSourceIds.length > 0}
            >
              {(subSourcesQ.data ?? []).length === 0 ? (
                <div className="text-[12px] text-text-muted px-1 py-2">
                  No subscribed sources yet. Add some from Discover first.
                </div>
              ) : (
                <div className="border border-border rounded-[3px] max-h-72 overflow-y-auto">
                  {(subSourcesQ.data ?? []).map((s) => {
                    const checked = selectedSourceIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex items-center gap-3 px-3 py-3 border-b border-border last:border-0"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            setSelectedSourceIds((prev) =>
                              prev.includes(s.id)
                                ? prev.filter((x) => x !== s.id)
                                : [...prev, s.id],
                            )
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] text-text-primary truncate">
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
              )}
            </Accordion>
            <Accordion
              label="Specialty"
              count={specialtyId ? 1 : 0}
              defaultOpen={!!specialtyId}
            >
              {(userSpecialtiesQ.data?.items ?? []).length === 0 ? (
                <div className="text-[12px] text-text-muted py-2">
                  No specialties yet. Set them from Settings → Profile.
                </div>
              ) : (
                <Select
                  value={specialtyId ?? "__none__"}
                  onValueChange={(v) => setSpecialtyId(v === "__none__" ? null : v)}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Pick a specialty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(userSpecialtiesQ.data?.items ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                        {s.is_primary ? " · primary" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Accordion>
            <Accordion
              label="Congress"
              count={congressId ? 1 : 0}
              defaultOpen={!!congressId}
            >
              <Select
                value={congressId ?? "__none__"}
                onValueChange={(v) => setCongressId(v === "__none__" ? null : v)}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Any —</SelectItem>
                  {(congressesQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.short_code || c.name}
                      {c.status === "live" ? " · live" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Accordion>
            <Accordion
              label="Hashtags"
              count={hashtags.length}
              defaultOpen={hashtags.length > 0}
            >
              <div className="flex gap-2">
                <Input
                  value={hashtagInput}
                  onChange={(e) => setHashtagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === ";") {
                      e.preventDefault();
                      addHashtag();
                    } else if (e.key === "Tab" && hashtagInput.trim()) {
                      e.preventDefault();
                      addHashtag();
                    }
                  }}
                  placeholder="#urology"
                  className="h-11 text-[14px]"
                />
                <button
                  type="button"
                  onClick={addHashtag}
                  className="h-11 px-3 rounded-[3px] border border-border bg-panel-elevated text-text-primary text-[13px]"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {hashtags.map((h) => (
                  <span
                    key={h}
                    className="inline-flex items-center gap-1 px-2 py-1 border border-border rounded-[3px] text-[12px] font-mono"
                  >
                    #{h}
                    <button
                      type="button"
                      onClick={() => setHashtags(hashtags.filter((x) => x !== h))}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </Accordion>
          </div>

          {/* Recipients */}
          <div ref={recipientsRef} className={"space-y-2 " + shakeCls("recipients")}>
            {hasAnyBinding && (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-[3px] border border-border bg-panel-elevated text-[14px] font-medium text-text-primary mb-3"
              >
                <Eye className="w-4 h-4" /> Preview this week's content
              </button>
            )}
            <SectionLabel>Recipients</SectionLabel>
            <div className="flex gap-2">
              <Input
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addRecipient();
                  } else if (e.key === "Tab" && recipientInput.trim()) {
                    e.preventDefault();
                    addRecipient();
                  }
                }}
                placeholder="recipient@example.com"
                type="email"
                className="h-11 text-[14px]"
              />
              <button
                type="button"
                onClick={addRecipient}
                className="h-11 w-11 inline-flex items-center justify-center rounded-[3px] border border-border bg-panel-elevated"
                aria-label="Add recipient"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              {recipients.map((r, idx) => (
                <div
                  key={r}
                  className="flex items-center justify-between px-3 py-3 border border-border rounded-[3px] text-[14px]"
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
                    onClick={() => setRecipients(recipients.filter((e) => e !== r))}
                    className="text-text-muted"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-[14px] text-text-primary">Send this digest</div>
              <div className="text-[12px] text-text-muted">
                Off = save the configuration but pause email sends.
              </div>
            </div>
            <Switch checked={isActive} onCheckedChange={(v) => setIsActive(!!v)} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
      {children}
    </div>
  );
}

function PresetButton({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-start gap-3 p-3 border border-border rounded-[3px] text-left bg-panel disabled:opacity-50"
    >
      <Icon className="w-5 h-5 text-accent shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-text-primary">{label}</div>
        <div className="text-[12px] text-text-muted mt-0.5">{hint}</div>
      </div>
    </button>
  );
}

function Accordion({
  label,
  count,
  defaultOpen,
  children,
}: {
  label: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <div className="border border-border rounded-[3px] bg-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-12 px-3 flex items-center justify-between"
      >
        <span className="text-[14px] font-medium text-text-primary">
          {label}
          {count > 0 && (
            <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-accent text-accent-foreground text-[11px] font-mono">
              {count}
            </span>
          )}
        </span>
        <span className="text-text-muted text-[12px]">{open ? "Hide" : "Show"}</span>
      </button>
      {open && <div className="border-t border-border p-3">{children}</div>}
    </div>
  );
}

export default MobileDigestWizard;
