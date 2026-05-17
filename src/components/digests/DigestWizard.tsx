import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ArrowRight, ArrowLeft, X, Sparkles, Calendar, Settings2, ChevronDown, ChevronRight, Eye, Check } from "lucide-react";
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
import { createDigest, updateDigest, getDigest, previewSourcesSummary } from "@/serverFns/digests";
import { MobileDigestWizard } from "./MobileDigestWizard";
import { useIsMobile } from "@/hooks/use-mobile";
import { DigestPreviewDialog } from "./DigestPreviewDialog";

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
  initialPreset?: "specialty" | "congress" | "custom" | null;
}

export function DigestWizard(props: DigestWizardProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <MobileDigestWizard digestId={props.digestId} onClose={props.onClose} />
    );
  }
  return <DesktopDigestWizard {...props} />;
}

function DesktopDigestWizard({ digestId, onClose, initialPreset }: DigestWizardProps) {
  const { user, prefs } = useAuth();
  const qc = useQueryClient();
  const createFn = useServerFn(createDigest);
  const updateFn = useServerFn(updateDigest);
  const getFn = useServerFn(getDigest);
  const summaryFn = useServerFn(previewSourcesSummary);

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
  const [specialtyId, setSpecialtyId] = React.useState<string | null>(null);
  const [congressId, setCongressId] = React.useState<string | null>(null);
  const [hashtags, setHashtags] = React.useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = React.useState("");
  const [openSection, setOpenSection] = React.useState<"sources" | "specialty" | "congress" | "hashtags" | null>("sources");
  const [recipients, setRecipients] = React.useState<string[]>([]);
  const [recipientInput, setRecipientInput] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [sourceFilter, setSourceFilter] = React.useState("");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [includeSourcesSummary, setIncludeSourcesSummary] = React.useState(false);
  const [summaryPreview, setSummaryPreview] = React.useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = React.useState(false);

  // Load user's subscribed sources to choose from.
  const subSourcesQ = useQuery({
    queryKey: ["user-subscribed-sources", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_subscribed_sources")
        .select(
          "source_id, sources(id, handle, display_name, role, specialty, list_ids, last_seen_at, followers_count)",
        )
        .eq("user_id", user!.id);
      return ((data ?? []) as Array<{
        source_id: string;
        sources: {
          id: string;
          handle: string;
          display_name: string | null;
          role: string | null;
          specialty: string[] | null;
          list_ids: string[] | null;
          last_seen_at: string | null;
          followers_count: number | null;
        } | null;
      }>).map((r) => ({
        id: r.sources?.id ?? r.source_id,
        handle: r.sources?.handle ?? r.source_id,
        display_name: r.sources?.display_name ?? r.source_id,
        role: r.sources?.role ?? "other",
        specialty: r.sources?.specialty ?? [],
        list_ids: r.sources?.list_ids ?? [],
        last_seen_at: r.sources?.last_seen_at ?? null,
        followers_count: r.sources?.followers_count ?? 0,
      }));
    },
  });

  // Load user's source lists so we can group/bulk-add by list.
  const sourceListsQ = useQuery({
    queryKey: ["user-source-lists", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("source_lists")
        .select("id, name, color")
        .eq("user_id", user!.id)
        .order("name", { ascending: true });
      return (data ?? []) as Array<{ id: string; name: string; color: string | null }>;
    },
  });

  // User specialties — for "My specialty digest" preset and the specialty section.
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
      if (ids.length === 0) return { items: [] as Array<{ id: string; label: string; is_primary: boolean }>, primaryId: null as string | null };
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

  // Congresses for picker + "Active congress digest" preset.
  const congressesQ = useQuery({
    queryKey: ["digests-congresses-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("congresses")
        .select("id, name, short_code, status, start_date, end_date")
        .order("start_date", { ascending: false });
      return (data ?? []) as Array<{
        id: string; name: string; short_code: string; status: string;
        start_date: string | null; end_date: string | null;
      }>;
    },
  });

  const liveCongresses = React.useMemo(
    () => (congressesQ.data ?? []).filter((c) => c.status === "live"),
    [congressesQ.data],
  );

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
      // d may include timezone/is_active/topic bindings depending on serverFn shape
      const dx = d as unknown as {
        timezone?: string;
        is_active?: boolean;
        specialty_id?: string | null;
        congress_id?: string | null;
        hashtags?: string[];
        include_sources_summary?: boolean;
      };
      if (dx.timezone) setTimezone(dx.timezone);
      if (typeof dx.is_active === "boolean") setIsActive(dx.is_active);
      setSpecialtyId(dx.specialty_id ?? null);
      setCongressId(dx.congress_id ?? null);
      setHashtags(Array.isArray(dx.hashtags) ? dx.hashtags : []);
      setIncludeSourcesSummary(!!dx.include_sources_summary);
    })();
    return () => {
      cancelled = true;
    };
  }, [digestId, getFn, user?.email, recipients.length, prefs]);

  // Apply initial preset on first mount (new digests only).
  const presetAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (digestId || presetAppliedRef.current) return;
    if (!initialPreset) return;
    if (initialPreset === "specialty") {
      const primaryId = userSpecialtiesQ.data?.primaryId ?? null;
      if (primaryId) {
        setSpecialtyId(primaryId);
        setOpenSection("specialty");
        if (!name) setName("My specialty digest");
        presetAppliedRef.current = true;
      }
    } else if (initialPreset === "congress") {
      if (liveCongresses.length === 1) {
        setCongressId(liveCongresses[0].id);
        setOpenSection("congress");
        if (!name) setName(`${liveCongresses[0].short_code || liveCongresses[0].name} digest`);
        presetAppliedRef.current = true;
      } else if (liveCongresses.length > 1) {
        setOpenSection("congress");
        presetAppliedRef.current = true;
      }
    } else if (initialPreset === "custom") {
      setOpenSection("sources");
      presetAppliedRef.current = true;
    }
  }, [initialPreset, digestId, userSpecialtiesQ.data, liveCongresses, name]);

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

  const addSources = (ids: string[]) => {
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return Array.from(next);
    });
  };

  const removeSources = (ids: string[]) => {
    const drop = new Set(ids);
    setSelectedSourceIds((prev) => prev.filter((id) => !drop.has(id)));
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

  const normalizeHashtag = (raw: string) =>
    raw.trim().replace(/^#/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");

  const addHashtag = () => {
    const v = normalizeHashtag(hashtagInput);
    if (!v) return;
    if (hashtags.includes(v)) {
      setHashtagInput("");
      return;
    }
    if (hashtags.length >= 50) {
      toast.error("Max 50 hashtags");
      return;
    }
    setHashtags([...hashtags, v]);
    setHashtagInput("");
  };

  const removeHashtag = (h: string) => setHashtags(hashtags.filter((x) => x !== h));

  const hasAnyBinding =
    selectedSourceIds.length > 0 ||
    !!specialtyId ||
    !!congressId ||
    hashtags.length > 0;

  const canContinue = () => {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return hasAnyBinding;
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
        specialty_id: specialtyId,
        congress_id: congressId,
        hashtags,
        include_sources_summary: includeSourcesSummary,
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
              {step === 2 && "What goes in this digest?"}
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
            <Step2Bindings
              userPrimarySpecialtyId={userSpecialtiesQ.data?.primaryId ?? null}
              userSpecialties={userSpecialtiesQ.data?.items ?? []}
              liveCongresses={liveCongresses}
              allCongresses={congressesQ.data ?? []}
              subSources={subSourcesQ.data ?? []}
              subSourcesLoading={subSourcesQ.isLoading}
              filteredSources={filteredSources}
              sourceFilter={sourceFilter}
              setSourceFilter={setSourceFilter}
              selectedSourceIds={selectedSourceIds}
              toggleSource={toggleSource}
              addSources={addSources}
              removeSources={removeSources}
              sourceLists={sourceListsQ.data ?? []}
              specialtyId={specialtyId}
              setSpecialtyId={setSpecialtyId}
              congressId={congressId}
              setCongressId={setCongressId}
              hashtags={hashtags}
              hashtagInput={hashtagInput}
              setHashtagInput={setHashtagInput}
              addHashtag={addHashtag}
              removeHashtag={removeHashtag}
              openSection={openSection}
              setOpenSection={setOpenSection}
              applyPreset={(p) => {
                if (p === "specialty") {
                  const id = userSpecialtiesQ.data?.primaryId ?? null;
                  if (!id) {
                    toast.error("Set a primary specialty in Settings → Profile first");
                    return;
                  }
                  setSpecialtyId(id);
                  setOpenSection("specialty");
                  if (!name) setName("My specialty digest");
                } else if (p === "congress") {
                  if (liveCongresses.length === 1) {
                    setCongressId(liveCongresses[0].id);
                    setOpenSection("congress");
                    if (!name) setName(`${liveCongresses[0].short_code || liveCongresses[0].name} digest`);
                  } else {
                    setOpenSection("congress");
                  }
                } else {
                  setOpenSection("sources");
                }
              }}
            />
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              disabled={!hasAnyBinding}
              title={
                hasAnyBinding
                  ? "Preview this week's content"
                  : "Pick at least one source, specialty, congress, or hashtag"
              }
            >
              <Eye className="w-4 h-4 mr-1" /> Preview this week
            </Button>
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
      <DigestPreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        input={{
          source_ids: selectedSourceIds,
          specialty_id: specialtyId,
          congress_id: congressId,
          hashtags,
          digest_name: name,
        }}
      />
    </div>
  );
}

export default DigestWizard;

type PresetKind = "specialty" | "congress" | "custom";

interface Step2Props {
  userPrimarySpecialtyId: string | null;
  userSpecialties: Array<{ id: string; label: string; is_primary: boolean }>;
  liveCongresses: Array<{ id: string; name: string; short_code: string }>;
  allCongresses: Array<{ id: string; name: string; short_code: string; status: string }>;
  subSources: SourceItem[];
  subSourcesLoading: boolean;
  filteredSources: SourceItem[];
  sourceFilter: string;
  setSourceFilter: (v: string) => void;
  selectedSourceIds: string[];
  toggleSource: (id: string) => void;
  addSources: (ids: string[]) => void;
  removeSources: (ids: string[]) => void;
  sourceLists: Array<{ id: string; name: string; color: string | null }>;
  specialtyId: string | null;
  setSpecialtyId: (id: string | null) => void;
  congressId: string | null;
  setCongressId: (id: string | null) => void;
  hashtags: string[];
  hashtagInput: string;
  setHashtagInput: (v: string) => void;
  addHashtag: () => void;
  removeHashtag: (h: string) => void;
  openSection: "sources" | "specialty" | "congress" | "hashtags" | null;
  setOpenSection: (s: "sources" | "specialty" | "congress" | "hashtags" | null) => void;
  applyPreset: (p: PresetKind) => void;
}

type SourceItem = {
  id: string;
  handle: string;
  display_name: string;
  role: string;
  specialty: string[];
  list_ids: string[];
  last_seen_at: string | null;
  followers_count: number;
};

type GroupBy = "none" | "list" | "specialty";
type SortBy = "name" | "recent" | "followers";

function Step2Bindings(p: Step2Props) {
  const noLive = p.liveCongresses.length === 0;
  const Section = ({
    id,
    label,
    summary,
    children,
  }: {
    id: "sources" | "specialty" | "congress" | "hashtags";
    label: string;
    summary: string;
    children: React.ReactNode;
  }) => {
    const open = p.openSection === id;
    return (
      <div className="border border-border rounded-[3px]">
        <button
          type="button"
          onClick={() => p.setOpenSection(open ? null : id)}
          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-panel-elevated/40"
        >
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span className="text-[13px] font-medium text-text-primary">{label}</span>
          </div>
          <span className="text-[11px] font-mono text-text-muted">{summary}</span>
        </button>
        {open && <div className="border-t border-border p-3">{children}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Preset starters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => p.applyPreset("specialty")}
          disabled={!p.userPrimarySpecialtyId}
          className="flex items-start gap-2 p-3 border border-border rounded-[3px] text-left hover:border-accent/60 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-text-primary">My specialty digest</div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {p.userPrimarySpecialtyId ? "Auto-fill primary specialty" : "Set a primary specialty first"}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => p.applyPreset("congress")}
          disabled={noLive}
          className="flex items-start gap-2 p-3 border border-border rounded-[3px] text-left hover:border-accent/60 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Calendar className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-text-primary">Active congress digest</div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {noLive
                ? "no live congresses right now"
                : p.liveCongresses.length === 1
                  ? `Auto-fill ${p.liveCongresses[0].short_code || p.liveCongresses[0].name}`
                  : `Pick from ${p.liveCongresses.length} live`}
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => p.applyPreset("custom")}
          className="flex items-start gap-2 p-3 border border-border rounded-[3px] text-left hover:border-accent/60"
        >
          <Settings2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-text-primary">Custom</div>
            <div className="text-[10px] text-text-muted mt-0.5">Mix sources, specialty, congress, hashtags</div>
          </div>
        </button>
      </div>

      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
        Bindings — at least one is required
      </div>

      <Section
        id="sources"
        label="Sources"
        summary={`${p.selectedSourceIds.length} selected`}
      >
        <SourcesPicker p={p} />
      </Section>

      <Section
        id="specialty"
        label="Specialty"
        summary={
          p.specialtyId
            ? p.userSpecialties.find((s) => s.id === p.specialtyId)?.label ?? p.specialtyId
            : "none"
        }
      >
        {p.userSpecialties.length === 0 ? (
          <div className="text-[12px] text-text-muted">
            You haven't selected any specialties yet. Add some from Settings → Profile.
          </div>
        ) : (
          <Select
            value={p.specialtyId ?? "__none__"}
            onValueChange={(v) => p.setSpecialtyId(v === "__none__" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick a specialty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— None —</SelectItem>
              {p.userSpecialties.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}{s.is_primary ? " · primary" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Section>

      <Section
        id="congress"
        label="Congress"
        summary={
          p.congressId
            ? p.allCongresses.find((c) => c.id === p.congressId)?.short_code ??
              p.allCongresses.find((c) => c.id === p.congressId)?.name ??
              p.congressId
            : "none"
        }
      >
        <Select
          value={p.congressId ?? "__none__"}
          onValueChange={(v) => p.setCongressId(v === "__none__" ? null : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pick a congress" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {p.allCongresses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {(c.short_code || c.name)}{c.status === "live" ? " · live" : c.status === "upcoming" ? " · upcoming" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      <Section
        id="hashtags"
        label="Hashtags"
        summary={p.hashtags.length === 0 ? "none" : `${p.hashtags.length} added`}
      >
        <div className="flex gap-2 mb-2">
          <Input
            value={p.hashtagInput}
            onChange={(e) => p.setHashtagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "," || e.key === ";") {
                e.preventDefault();
                p.addHashtag();
              } else if (e.key === "Tab" && p.hashtagInput.trim()) {
                e.preventDefault();
                p.addHashtag();
              }
            }}
            placeholder="#urology"
            className="h-8 text-[12px]"
          />
          <Button type="button" variant="outline" size="sm" onClick={p.addHashtag}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {p.hashtags.map((h) => (
            <span
              key={h}
              className="inline-flex items-center gap-1 px-2 py-1 border border-border rounded-[3px] text-[11px] font-mono"
            >
              #{h}
              <button
                type="button"
                onClick={() => p.removeHashtag(h)}
                className="text-text-muted hover:text-danger"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </Section>
    </div>
  );
}

function SourcesPicker({ p }: { p: Step2Props }) {
  const [groupBy, setGroupBy] = React.useState<GroupBy>("none");
  const [sortBy, setSortBy] = React.useState<SortBy>("name");

  const sortFn = React.useCallback(
    (a: SourceItem, b: SourceItem) => {
      if (sortBy === "name") return a.display_name.localeCompare(b.display_name);
      if (sortBy === "followers") return (b.followers_count ?? 0) - (a.followers_count ?? 0);
      // recent
      const at = a.last_seen_at ? Date.parse(a.last_seen_at) : 0;
      const bt = b.last_seen_at ? Date.parse(b.last_seen_at) : 0;
      return bt - at;
    },
    [sortBy],
  );

  const filteredSorted = React.useMemo(
    () => [...p.filteredSources].sort(sortFn),
    [p.filteredSources, sortFn],
  );

  // Build groups
  type Group = { key: string; label: string; items: SourceItem[] };
  const groups: Group[] = React.useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: "All sources", items: filteredSorted }];
    }
    if (groupBy === "list") {
      const listNameById = new Map(p.sourceLists.map((l) => [l.id, l.name]));
      const buckets = new Map<string, SourceItem[]>();
      for (const s of filteredSorted) {
        const ids = s.list_ids.length > 0 ? s.list_ids : ["__none__"];
        for (const id of ids) {
          if (!buckets.has(id)) buckets.set(id, []);
          buckets.get(id)!.push(s);
        }
      }
      const out: Group[] = [];
      for (const l of p.sourceLists) {
        const items = buckets.get(l.id);
        if (items && items.length) out.push({ key: l.id, label: l.name, items });
      }
      const none = buckets.get("__none__");
      if (none && none.length) out.push({ key: "__none__", label: "No list", items: none });
      // Lists that don't exist anymore (orphan IDs) get their own bucket
      for (const [id, items] of buckets) {
        if (id === "__none__") continue;
        if (!listNameById.has(id)) out.push({ key: id, label: "Other list", items });
      }
      return out;
    }
    // specialty
    const buckets = new Map<string, SourceItem[]>();
    for (const s of filteredSorted) {
      const specs = s.specialty.length > 0 ? s.specialty : ["__none__"];
      for (const spec of specs) {
        if (!buckets.has(spec)) buckets.set(spec, []);
        buckets.get(spec)!.push(s);
      }
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => (a === "__none__" ? 1 : b === "__none__" ? -1 : a.localeCompare(b)))
      .map(([key, items]) => ({
        key,
        label: key === "__none__" ? "No specialty" : key,
        items,
      }));
  }, [filteredSorted, groupBy, p.sourceLists]);

  const selectedSet = React.useMemo(
    () => new Set(p.selectedSourceIds),
    [p.selectedSourceIds],
  );

  const filteredIds = React.useMemo(
    () => p.filteredSources.map((s) => s.id),
    [p.filteredSources],
  );
  const filteredSelectedCount = filteredIds.filter((id) => selectedSet.has(id)).length;
  const allFilteredSelected =
    filteredIds.length > 0 && filteredSelectedCount === filteredIds.length;

  const selectedItems = React.useMemo(
    () => p.subSources.filter((s) => selectedSet.has(s.id)),
    [p.subSources, selectedSet],
  );

  if (p.subSources.length === 0 && !p.subSourcesLoading) {
    return (
      <div className="p-3 text-[12px] text-text-muted border border-border rounded-[3px]">
        You don't have any subscribed sources yet. Add some from Discover or Sources first.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1 p-2 border border-border rounded-[3px] bg-panel-elevated/30 max-h-[88px] overflow-y-auto">
          {selectedItems.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => p.toggleSource(s.id)}
              title={`Remove @${s.handle}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 border border-border rounded-[3px] text-[11px] font-mono bg-panel hover:bg-panel-elevated"
            >
              @{s.handle}
              <X className="w-3 h-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => p.removeSources(selectedItems.map((s) => s.id))}
            className="ml-auto text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted hover:text-danger px-1"
          >
            clear
          </button>
        </div>
      )}

      {/* Filter + sort + group */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={p.sourceFilter}
          onChange={(e) => p.setSourceFilter(e.target.value)}
          placeholder="filter by name or @handle…"
          className="h-8 text-[12px] flex-1 min-w-[180px]"
        />
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
          <SelectTrigger className="h-8 w-[140px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No grouping</SelectItem>
            <SelectItem value="list">By source list</SelectItem>
            <SelectItem value="specialty">By specialty</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
          <SelectTrigger className="h-8 w-[130px] text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">A → Z</SelectItem>
            <SelectItem value="recent">Most recent</SelectItem>
            <SelectItem value="followers">Most followed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Select all / count */}
      <div className="flex items-center justify-between text-[11px] font-mono text-text-muted px-1">
        <span>
          {p.selectedSourceIds.length} selected · {p.filteredSources.length} shown ·{" "}
          {p.subSources.length} total
        </span>
        <button
          type="button"
          onClick={() =>
            allFilteredSelected ? p.removeSources(filteredIds) : p.addSources(filteredIds)
          }
          className="uppercase tracking-[0.12em] hover:text-accent"
          disabled={filteredIds.length === 0}
        >
          {allFilteredSelected ? "deselect shown" : "select shown"}
        </button>
      </div>

      {/* Grouped list */}
      <div className="border border-border rounded-[3px] max-h-[320px] overflow-y-auto">
        {groups.length === 0 && (
          <div className="p-3 text-[12px] text-text-muted">No matches.</div>
        )}
        {groups.map((g) => (
          <SourceGroup
            key={g.key}
            label={g.label}
            items={g.items}
            selectedSet={selectedSet}
            onToggle={p.toggleSource}
            onAdd={p.addSources}
            onRemove={p.removeSources}
            collapsible={groupBy !== "none"}
          />
        ))}
      </div>
    </div>
  );
}

function SourceGroup({
  label,
  items,
  selectedSet,
  onToggle,
  onAdd,
  onRemove,
  collapsible,
}: {
  label: string;
  items: SourceItem[];
  selectedSet: Set<string>;
  onToggle: (id: string) => void;
  onAdd: (ids: string[]) => void;
  onRemove: (ids: string[]) => void;
  collapsible: boolean;
}) {
  const [open, setOpen] = React.useState(true);
  const ids = items.map((s) => s.id);
  const selectedCount = ids.filter((id) => selectedSet.has(id)).length;
  const allSelected = selectedCount === ids.length && ids.length > 0;
  return (
    <div className="border-b border-border last:border-b-0">
      {collapsible && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-panel-elevated/30 sticky top-0 z-[1]">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.12em] text-text-muted hover:text-text-primary"
          >
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {label} <span className="text-text-muted/70">({selectedCount}/{ids.length})</span>
          </button>
          <button
            type="button"
            onClick={() => (allSelected ? onRemove(ids) : onAdd(ids))}
            className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.12em] text-accent hover:opacity-80"
          >
            <Check className="w-3 h-3" />
            {allSelected ? "remove all" : "add all"}
          </button>
        </div>
      )}
      {open &&
        items.map((s) => {
          const checked = selectedSet.has(s.id);
          return (
            <label
              key={`${label}-${s.id}`}
              className="flex items-center gap-3 px-3 py-2 border-t border-border cursor-pointer hover:bg-panel-elevated/60"
            >
              <Checkbox checked={checked} onCheckedChange={() => onToggle(s.id)} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text-primary truncate">{s.display_name}</div>
                <div className="text-[11px] font-mono text-text-muted truncate">
                  @{s.handle}
                  {s.role && s.role !== "other" ? ` · ${s.role}` : ""}
                  {s.specialty.length > 0 ? ` · ${s.specialty.join(", ")}` : ""}
                </div>
              </div>
            </label>
          );
        })}
    </div>
  );
}