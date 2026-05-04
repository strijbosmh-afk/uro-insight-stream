import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Loader2,
  Check,
  X,
  Search,
  Star,
  Trash2,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  lookupCongressFromQuery,
  createCongressFromWizard,
  updateCongressFromWizard,
  getCongressForWizard,
} from "@/serverFns/congresses";

const STEPS = ["Lookup", "Basics", "Cancer areas", "Hashtags", "KOLs", "Review"] as const;
type StepName = (typeof STEPS)[number];

type Kol = {
  handle: string; // canonical (no @)
  display_name?: string;
  avatar_url?: string;
  verified?: boolean;
  role?: string | null;
  reason?: string;
  status: "pending" | "looking-up" | "found" | "not-found";
};

type CancerArea = { id: string; slug: string; name: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editId?: string | null;
  onSaved?: (id: string) => void;
}

function cleanHandle(h: string): string {
  return h.replace(/^@+/, "").trim();
}

export function CongressWizard({ open, onOpenChange, editId, onSaved }: Props) {
  const qc = useQueryClient();
  const lookupFn = useServerFn(lookupCongressFromQuery);
  const createFn = useServerFn(createCongressFromWizard);
  const updateFn = useServerFn(updateCongressFromWizard);
  const loadFn = useServerFn(getCongressForWizard);

  const [stepIdx, setStepIdx] = React.useState(0);
  const step = STEPS[stepIdx];

  // Lookup
  const [lookupQuery, setLookupQuery] = React.useState("");
  const [lookupLoading, setLookupLoading] = React.useState(false);
  const [lookupCitations, setLookupCitations] = React.useState<Array<{ url: string; title: string }>>([]);
  const [lookupConfidence, setLookupConfidence] = React.useState<"high" | "medium" | "low" | null>(null);
  const [lookupNoMatch, setLookupNoMatch] = React.useState(false);

  // Basics
  const [name, setName] = React.useState("");
  const [shortCode, setShortCode] = React.useState("");
  const [city, setCity] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<"upcoming" | "live" | "archived">("upcoming");

  // Areas
  const [areaIds, setAreaIds] = React.useState<string[]>([]);
  const [primaryAreaId, setPrimaryAreaId] = React.useState<string | null>(null);

  // Hashtags
  const [primaryTags, setPrimaryTags] = React.useState<string[]>([]);
  const [communityTags, setCommunityTags] = React.useState<string[]>([]);
  const [primaryTagInput, setPrimaryTagInput] = React.useState("");
  const [communityTagInput, setCommunityTagInput] = React.useState("");

  // KOLs
  const [kols, setKols] = React.useState<Kol[]>([]);
  const [kolInput, setKolInput] = React.useState("");
  // Per-wizard-session enrichment cache so back/forward doesn't re-hit X.
  const enrichCache = React.useRef<
    Map<string, { display_name?: string; avatar_url?: string; verified?: boolean; found: boolean }>
  >(new Map());
  const inFlight = React.useRef<Set<string>>(new Set());

  // ---------- Cancer areas reference ----------
  const { data: areas = [] } = useQuery({
    queryKey: ["cancer-areas"],
    queryFn: async (): Promise<CancerArea[]> => {
      const { data } = await supabase
        .from("cancer_areas")
        .select("id, slug, name, display_order")
        .order("display_order");
      return ((data ?? []) as Array<CancerArea & { display_order: number }>).map((a) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
      }));
    },
    staleTime: 5 * 60_000,
  });
  const areaBySlug = React.useMemo(() => {
    const m = new Map<string, CancerArea>();
    for (const a of areas) m.set(a.slug, a);
    return m;
  }, [areas]);

  // ---------- Reset on open/close ----------
  const reset = React.useCallback(() => {
    setStepIdx(0);
    setLookupQuery("");
    setLookupLoading(false);
    setLookupCitations([]);
    setLookupConfidence(null);
    setLookupNoMatch(false);
    setName("");
    setShortCode("");
    setCity("");
    setCountry("");
    setStartDate("");
    setEndDate("");
    setWebsite("");
    setDescription("");
    setStatus("upcoming");
    setAreaIds([]);
    setPrimaryAreaId(null);
    setPrimaryTags([]);
    setCommunityTags([]);
    setPrimaryTagInput("");
    setCommunityTagInput("");
    setKols([]);
    setKolInput("");
    enrichCache.current.clear();
    inFlight.current.clear();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    reset();
    if (editId) {
      // Skip lookup step in edit mode
      void (async () => {
        try {
          const r = await loadFn({ data: { id: editId } });
          const c = r.congress as {
            name: string; short_code: string; city: string | null; country: string | null;
            start_date: string | null; end_date: string | null; status: string;
            primary_hashtags: string[]; community_hashtags: string[] | null;
            website: string | null; description: string | null;
          };
          setName(c.name);
          setShortCode(c.short_code);
          setCity(c.city ?? "");
          setCountry(c.country ?? "");
          setStartDate(c.start_date ?? "");
          setEndDate(c.end_date ?? "");
          setStatus((c.status as "upcoming" | "live" | "archived") ?? "upcoming");
          setWebsite(c.website ?? "");
          setDescription(c.description ?? "");
          setPrimaryTags(c.primary_hashtags ?? []);
          setCommunityTags(c.community_hashtags ?? []);
          const ca = r.cancer_areas;
          setAreaIds(ca.map((a) => a.id));
          setPrimaryAreaId(ca.find((a) => a.is_primary)?.id ?? ca[0]?.id ?? null);
          setKols(
            r.featured_sources.map((f): Kol => ({
              handle: f.handle,
              display_name: f.display_name,
              avatar_url: f.avatar_url,
              verified: f.verified,
              role: f.role,
              status: "found",
            })),
          );
          setStepIdx(1); // Basics
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to load congress");
        }
      })();
    }
  }, [open, editId, loadFn, reset]);

  // ---------- Lookup ----------
  const runLookup = async () => {
    const q = lookupQuery.trim();
    if (q.length < 3) {
      toast.error("Type a congress name (3+ chars)");
      return;
    }
    setLookupLoading(true);
    setLookupNoMatch(false);
    setLookupCitations([]);
    setLookupConfidence(null);
    try {
      const r = await lookupFn({ data: { query: q } });
      if (!r.ok) {
        toast.error(r.error === "rate_limited" ? "AI is rate-limited, try again shortly" : "Lookup failed");
        return;
      }
      if (r.no_match) {
        setLookupNoMatch(true);
        toast.message("Couldn't identify the congress — fill it in manually");
        // Still let them advance with name pre-filled
        setName(q);
        setStepIdx(1);
        return;
      }
      // Pre-fill state
      if (r.name) setName(r.name);
      if (r.short_code) setShortCode(r.short_code);
      if (r.city) setCity(r.city);
      if (r.country) setCountry(r.country);
      if (r.start_date) setStartDate(r.start_date);
      if (r.end_date) setEndDate(r.end_date);
      if (r.website) setWebsite(r.website);
      if (r.description) setDescription(r.description);
      setPrimaryTags(r.primary_hashtags ?? []);
      setCommunityTags(r.community_hashtags ?? []);
      setLookupCitations(r.citations ?? []);
      setLookupConfidence(r.confidence);
      // Map slugs → ids
      const ids = (r.cancer_area_slugs ?? [])
        .map((s) => areaBySlug.get(s)?.id)
        .filter((x): x is string => !!x);
      if (ids.length > 0) {
        setAreaIds(ids);
        setPrimaryAreaId(ids[0]);
      }
      // Seed suggested KOLs (don't enrich yet — happens on step 5 entry)
      const suggested = (r.suggested_kols ?? []).map((k): Kol => ({
        handle: cleanHandle(k.handle),
        reason: k.reason,
        status: "pending",
      }));
      setKols(suggested);
      setStepIdx(1);
      toast.success(`Pre-filled (${r.confidence} confidence${r.cached ? ", cached" : ""})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLookupLoading(false);
    }
  };

  const skipLookup = () => {
    setStepIdx(1);
  };

  // ---------- KOL enrichment via /api/lookup-handle ----------
  const enrichHandle = React.useCallback(async (handle: string) => {
    const key = handle.toLowerCase();
    if (enrichCache.current.has(key) || inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setKols((prev) =>
      prev.map((k) => (k.handle.toLowerCase() === key ? { ...k, status: "looking-up" } : k)),
    );
    try {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token;
      if (!token) throw new Error("not authenticated");
      const res = await fetch("/api/lookup-handle", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ handles: [key] }),
      });
      if (res.status === 429) {
        setKols((prev) =>
          prev.map((k) => (k.handle.toLowerCase() === key ? { ...k, status: "not-found" } : k)),
        );
        toast.error("Handle lookup rate-limited");
        return;
      }
      const json = (await res.json()) as {
        results?: Array<{
          handle: string;
          found: boolean;
          source?: { handle: string; display_name: string; avatar_url: string; verified: boolean };
        }>;
      };
      const r = json.results?.[0];
      if (r?.found && r.source) {
        const info = {
          display_name: r.source.display_name,
          avatar_url: r.source.avatar_url,
          verified: r.source.verified,
          found: true,
        };
        enrichCache.current.set(key, info);
        setKols((prev) =>
          prev.map((k) =>
            k.handle.toLowerCase() === key
              ? { ...k, ...info, handle: r.source!.handle, status: "found" }
              : k,
          ),
        );
      } else {
        enrichCache.current.set(key, { found: false });
        setKols((prev) =>
          prev.map((k) => (k.handle.toLowerCase() === key ? { ...k, status: "not-found" } : k)),
        );
      }
    } catch (err) {
      console.error(err);
      setKols((prev) =>
        prev.map((k) => (k.handle.toLowerCase() === key ? { ...k, status: "not-found" } : k)),
      );
    } finally {
      inFlight.current.delete(key);
    }
  }, []);

  // Bounded-concurrency pump for pending KOLs (3 in flight)
  React.useEffect(() => {
    if (step !== "KOLs") return;
    const pending = kols.filter((k) => k.status === "pending").map((k) => k.handle);
    if (pending.length === 0) return;
    const slots = Math.max(0, 3 - inFlight.current.size);
    pending.slice(0, slots).forEach((h) => void enrichHandle(h));
  }, [step, kols, enrichHandle]);

  // ---------- Hashtag chip helpers ----------
  const addTag = (raw: string, kind: "primary" | "community") => {
    const t = raw.replace(/^#+/, "").trim().toLowerCase();
    if (!t) return;
    if (!/^[a-z0-9_]{1,80}$/.test(t)) {
      toast.error("Hashtag: letters/numbers/underscore only");
      return;
    }
    if (kind === "primary") {
      setPrimaryTags((p) => (p.includes(t) ? p : [...p, t]));
      setPrimaryTagInput("");
    } else {
      setCommunityTags((p) => (p.includes(t) ? p : [...p, t]));
      setCommunityTagInput("");
    }
  };

  const addKol = (raw: string) => {
    const h = cleanHandle(raw);
    if (!/^[A-Za-z0-9_]{1,15}$/.test(h)) {
      toast.error("Invalid X handle");
      return;
    }
    if (kols.some((k) => k.handle.toLowerCase() === h.toLowerCase())) {
      toast.message("Already added");
      return;
    }
    const cached = enrichCache.current.get(h.toLowerCase());
    if (cached) {
      setKols((p) => [
        ...p,
        cached.found
          ? {
              handle: h,
              display_name: cached.display_name,
              avatar_url: cached.avatar_url,
              verified: cached.verified,
              status: "found",
            }
          : { handle: h, status: "not-found" },
      ]);
    } else {
      setKols((p) => [...p, { handle: h, status: "pending" }]);
    }
    setKolInput("");
  };

  // ---------- Validation per step ----------
  const canContinue = (): boolean => {
    if (step === "Lookup") return true; // can always skip
    if (step === "Basics") return name.trim().length >= 2 && shortCode.trim().length >= 2;
    if (step === "Cancer areas") return areaIds.length > 0 && !!primaryAreaId && areaIds.includes(primaryAreaId);
    if (step === "Hashtags") return true;
    if (step === "KOLs") return true;
    if (step === "Review") return true;
    return false;
  };

  // ---------- Save ----------
  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        ...(editId ? { id: editId } : {}),
        name: name.trim(),
        short_code: shortCode.trim().toUpperCase(),
        city: city.trim(),
        country: country.trim(),
        start_date: startDate || null,
        end_date: endDate || null,
        status,
        website: website.trim() || null,
        description: description.trim() || null,
        primary_hashtags: primaryTags,
        community_hashtags: communityTags,
        cancer_area_ids: areaIds,
        primary_cancer_area_id: primaryAreaId!,
        kols: kols
          .filter((k) => k.status === "found" || k.status === "not-found")
          .map((k) => ({
            handle: k.handle,
            display_name: k.display_name,
            avatar_url: k.avatar_url,
            verified: !!k.verified,
            role: k.role ?? null,
          })),
      };
      if (editId) return updateFn({ data: payload as Parameters<typeof updateFn>[0]["data"] });
      return createFn({ data: payload as Parameters<typeof createFn>[0]["data"] });
    },
    onSuccess: (r) => {
      toast.success(editId ? "Congress updated" : "Congress created");
      qc.invalidateQueries({ queryKey: ["congresses"] });
      qc.invalidateQueries({ queryKey: ["congresses-rich"] });
      qc.invalidateQueries({ queryKey: ["congress-cancer-areas"] });
      onSaved?.(r.id);
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Save failed");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="bg-panel border-border text-text-primary max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[12px] uppercase tracking-[0.12em]">
            {editId ? "Edit congress" : "New congress"} · {step}
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-1.5 mb-3">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i <= stepIdx ? "bg-accent" : "bg-border",
              )}
            />
          ))}
        </div>

        <div className="min-h-[360px] max-h-[60vh] overflow-auto">
          {step === "Lookup" && (
            <LookupStep
              query={lookupQuery}
              onQueryChange={setLookupQuery}
              loading={lookupLoading}
              onRun={runLookup}
              onSkip={skipLookup}
              noMatch={lookupNoMatch}
            />
          )}
          {step === "Basics" && (
            <BasicsStep
              name={name} onName={setName}
              shortCode={shortCode} onShortCode={setShortCode}
              city={city} onCity={setCity}
              country={country} onCountry={setCountry}
              startDate={startDate} onStartDate={setStartDate}
              endDate={endDate} onEndDate={setEndDate}
              status={status} onStatus={setStatus}
              website={website} onWebsite={setWebsite}
              description={description} onDescription={setDescription}
              citations={lookupCitations}
              confidence={lookupConfidence}
            />
          )}
          {step === "Cancer areas" && (
            <AreasStep
              areas={areas}
              selected={areaIds}
              primary={primaryAreaId}
              onChange={(ids, primary) => {
                setAreaIds(ids);
                setPrimaryAreaId(primary);
              }}
            />
          )}
          {step === "Hashtags" && (
            <HashtagsStep
              primaryTags={primaryTags}
              communityTags={communityTags}
              primaryInput={primaryTagInput}
              communityInput={communityTagInput}
              onPrimaryInput={setPrimaryTagInput}
              onCommunityInput={setCommunityTagInput}
              onAdd={addTag}
              onRemovePrimary={(t) => setPrimaryTags((p) => p.filter((x) => x !== t))}
              onRemoveCommunity={(t) => setCommunityTags((p) => p.filter((x) => x !== t))}
            />
          )}
          {step === "KOLs" && (
            <KolsStep
              kols={kols}
              input={kolInput}
              onInput={setKolInput}
              onAdd={addKol}
              onRemove={(h) => setKols((p) => p.filter((k) => k.handle !== h))}
              onRetry={(h) => {
                enrichCache.current.delete(h.toLowerCase());
                setKols((p) =>
                  p.map((k) => (k.handle === h ? { ...k, status: "pending" } : k)),
                );
              }}
            />
          )}
          {step === "Review" && (
            <ReviewStep
              name={name} shortCode={shortCode} city={city} country={country}
              startDate={startDate} endDate={endDate} status={status}
              website={website} description={description}
              areas={areas.filter((a) => areaIds.includes(a.id))}
              primaryAreaId={primaryAreaId}
              primaryTags={primaryTags} communityTags={communityTags}
              kols={kols}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border pt-3 mt-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            Step {stepIdx + 1} / {STEPS.length}
          </div>
          <div className="flex items-center gap-2">
            {stepIdx > 0 && step !== "Lookup" && (
              <Button variant="outline" size="sm" onClick={() => setStepIdx((i) => Math.max(0, i - 1))}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
            )}
            {step === "Lookup" && (
              <Button variant="ghost" size="sm" onClick={skipLookup}>
                Skip lookup
              </Button>
            )}
            {step !== "Review" && step !== "Lookup" && (
              <Button
                size="sm"
                onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
                disabled={!canContinue()}
              >
                Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {step === "Lookup" && (
              <Button size="sm" onClick={runLookup} disabled={lookupLoading || lookupQuery.trim().length < 3}>
                {lookupLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                Look up
              </Button>
            )}
            {step === "Review" && (
              <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !primaryAreaId || areaIds.length === 0 || !name.trim() || !shortCode.trim()}>
                {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                {editId ? "Save changes" : "Create congress"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Sub-components ----------

function LookupStep({
  query, onQueryChange, loading, onRun, onSkip, noMatch,
}: {
  query: string; onQueryChange: (v: string) => void;
  loading: boolean; onRun: () => void; onSkip: () => void; noMatch: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-text-primary">Find a congress online</h3>
        <p className="text-[12px] text-text-muted mt-1">
          Type a congress name (e.g. "ASCO GU 2026", "ESMO Congress 2025"). We'll pre-fill basics, hashtags, cancer areas, and suggested KOLs using AI.
        </p>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="ASCO GU 2026, ESMO Breast 2025…"
            className="pl-8"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading && query.trim().length >= 3) {
                e.preventDefault();
                onRun();
              }
            }}
          />
        </div>
        <Button onClick={onRun} disabled={loading || query.trim().length < 3}>
          {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Look up
        </Button>
      </div>
      {noMatch && (
        <div className="text-[12px] text-amber-400 border border-amber-400/30 bg-amber-400/5 rounded-[3px] p-2">
          <AlertTriangle className="inline w-3 h-3 mr-1" />
          Couldn't identify that congress. Continue manually.
        </div>
      )}
      <div className="text-[11px] text-text-muted border-t border-border pt-3">
        Or{" "}
        <button onClick={onSkip} className="text-accent hover:underline">
          skip and enter manually
        </button>
      </div>
    </div>
  );
}

function BasicsStep(props: {
  name: string; onName: (v: string) => void;
  shortCode: string; onShortCode: (v: string) => void;
  city: string; onCity: (v: string) => void;
  country: string; onCountry: (v: string) => void;
  startDate: string; onStartDate: (v: string) => void;
  endDate: string; onEndDate: (v: string) => void;
  status: "upcoming" | "live" | "archived"; onStatus: (v: "upcoming" | "live" | "archived") => void;
  website: string; onWebsite: (v: string) => void;
  description: string; onDescription: (v: string) => void;
  citations: Array<{ url: string; title: string }>;
  confidence: "high" | "medium" | "low" | null;
}) {
  const conf = props.confidence;
  return (
    <div className="space-y-3">
      {conf && (
        <div
          className={cn(
            "text-[11px] flex items-center gap-1.5 border rounded-[3px] px-2 py-1.5",
            conf === "high" && "border-cyan-400/30 bg-cyan-400/5 text-cyan-300",
            conf === "medium" && "border-amber-400/30 bg-amber-400/5 text-amber-300",
            conf === "low" && "border-red-400/30 bg-red-400/5 text-red-300",
          )}
        >
          <Sparkles className="w-3 h-3" /> AI pre-filled · {conf} confidence — verify before saving
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" full>
          <Input value={props.name} onChange={(e) => props.onName(e.target.value)} placeholder="EAU 2027 Annual Meeting" />
        </Field>
        <Field label="Short code">
          <Input value={props.shortCode} onChange={(e) => props.onShortCode(e.target.value.toUpperCase())} placeholder="EAU27" className="font-mono uppercase" />
        </Field>
        <Field label="Status">
          <Select value={props.status} onValueChange={(v) => props.onStatus(v as "upcoming" | "live" | "archived")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="live">Live</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="City"><Input value={props.city} onChange={(e) => props.onCity(e.target.value)} placeholder="Madrid" /></Field>
        <Field label="Country"><Input value={props.country} onChange={(e) => props.onCountry(e.target.value)} placeholder="Spain" /></Field>
        <Field label="Start date"><Input type="date" value={props.startDate} onChange={(e) => props.onStartDate(e.target.value)} /></Field>
        <Field label="End date"><Input type="date" value={props.endDate} onChange={(e) => props.onEndDate(e.target.value)} /></Field>
        <Field label="Website" full>
          <Input value={props.website} onChange={(e) => props.onWebsite(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Description" full>
          <Textarea value={props.description} onChange={(e) => props.onDescription(e.target.value)} rows={3} placeholder="Brief description (1-2 sentences)" />
        </Field>
      </div>
      {props.citations.length > 0 && (
        <div className="border-t border-border pt-3">
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Sources cited by AI</div>
          <ul className="space-y-1">
            {props.citations.map((c) => (
              <li key={c.url} className="text-[11px]">
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                  {c.title} <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AreasStep({
  areas, selected, primary, onChange,
}: {
  areas: CancerArea[];
  selected: string[];
  primary: string | null;
  onChange: (ids: string[], primary: string | null) => void;
}) {
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    let nextPrimary = primary;
    if (!next.includes(primary ?? "")) nextPrimary = next[0] ?? null;
    if (next.length > 0 && !nextPrimary) nextPrimary = next[0];
    onChange(next, nextPrimary);
  };
  const setPrimary = (id: string) => {
    if (!selected.includes(id)) onChange([...selected, id], id);
    else onChange(selected, id);
  };
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-text-muted">
        Pick all relevant cancer areas for this congress. Mark one as <strong>primary</strong> — used as the default grouping.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {areas.map((a) => {
          const on = selected.includes(a.id);
          const isPrim = primary === a.id;
          return (
            <div
              key={a.id}
              className={cn(
                "flex items-center justify-between border rounded-[3px] px-3 py-2 cursor-pointer transition",
                on ? "border-accent bg-accent/5" : "border-border hover:border-text-muted",
              )}
              onClick={() => toggle(a.id)}
            >
              <div className="flex items-center gap-2">
                <div className={cn("w-3 h-3 border rounded-sm flex items-center justify-center", on ? "border-accent bg-accent" : "border-border")}>
                  {on && <Check className="w-2.5 h-2.5 text-bg" />}
                </div>
                <span className="text-[12px]">{a.name}</span>
              </div>
              {on && (
                <button
                  onClick={(e) => { e.stopPropagation(); setPrimary(a.id); }}
                  className={cn(
                    "text-[10px] uppercase tracking-wider flex items-center gap-1",
                    isPrim ? "text-accent" : "text-text-muted hover:text-text-primary",
                  )}
                  title="Set as primary"
                >
                  <Star className={cn("w-3 h-3", isPrim && "fill-current")} />
                  {isPrim ? "primary" : "set primary"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HashtagsStep({
  primaryTags, communityTags, primaryInput, communityInput,
  onPrimaryInput, onCommunityInput, onAdd, onRemovePrimary, onRemoveCommunity,
}: {
  primaryTags: string[]; communityTags: string[];
  primaryInput: string; communityInput: string;
  onPrimaryInput: (v: string) => void; onCommunityInput: (v: string) => void;
  onAdd: (v: string, kind: "primary" | "community") => void;
  onRemovePrimary: (t: string) => void; onRemoveCommunity: (t: string) => void;
}) {
  return (
    <div className="space-y-4">
      <TagSection
        label="Primary hashtags"
        hint="Official congress hashtags (1–3). Used for matching feed posts."
        tags={primaryTags}
        input={primaryInput}
        onInput={onPrimaryInput}
        onAdd={(v) => onAdd(v, "primary")}
        onRemove={onRemovePrimary}
        accent
      />
      <TagSection
        label="Community hashtags"
        hint="Topical / variant tags (up to ~8) used by attendees."
        tags={communityTags}
        input={communityInput}
        onInput={onCommunityInput}
        onAdd={(v) => onAdd(v, "community")}
        onRemove={onRemoveCommunity}
      />
    </div>
  );
}

function TagSection({
  label, hint, tags, input, onInput, onAdd, onRemove, accent = false,
}: {
  label: string; hint: string; tags: string[]; input: string;
  onInput: (v: string) => void; onAdd: (v: string) => void;
  onRemove: (t: string) => void; accent?: boolean;
}) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-text-muted">{label}</Label>
      <p className="text-[11px] text-text-muted mt-0.5 mb-2">{hint}</p>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.length === 0 && <span className="text-[11px] text-text-muted italic">None yet</span>}
        {tags.map((t) => (
          <span
            key={t}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono border rounded-[2px]",
              accent ? "border-accent text-accent bg-accent/10" : "border-border text-text-primary",
            )}
          >
            #{t}
            <button onClick={() => onRemove(t)} className="hover:text-red-400">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => onInput(e.target.value)}
          placeholder="EAU27"
          className="font-mono"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              if (input.trim()) onAdd(input);
            }
          }}
        />
        <Button variant="outline" size="sm" onClick={() => input.trim() && onAdd(input)}>Add</Button>
      </div>
    </div>
  );
}

function KolsStep({
  kols, input, onInput, onAdd, onRemove, onRetry,
}: {
  kols: Kol[]; input: string;
  onInput: (v: string) => void; onAdd: (v: string) => void;
  onRemove: (h: string) => void; onRetry: (h: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-text-muted">
        Featured KOLs/speakers. AI-suggested handles are enriched automatically — verify avatars and display names below.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-sm">@</span>
          <Input
            value={input}
            onChange={(e) => onInput(e.target.value)}
            placeholder="urology_handle"
            className="pl-7 font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) {
                e.preventDefault();
                onAdd(input);
              }
            }}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => input.trim() && onAdd(input)}>Add</Button>
      </div>
      <div className="space-y-1.5">
        {kols.length === 0 && (
          <div className="text-[12px] text-text-muted italic py-4 text-center border border-dashed border-border rounded-[3px]">
            No KOLs yet. Add handles above or run the lookup step for suggestions.
          </div>
        )}
        {kols.map((k) => (
          <div
            key={k.handle}
            className="flex items-center gap-2 border border-border rounded-[3px] px-2 py-1.5"
          >
            <div className="w-7 h-7 rounded-full bg-panel-elevated overflow-hidden flex items-center justify-center text-[10px] text-text-muted shrink-0">
              {k.avatar_url
                ? <img src={k.avatar_url} alt="" className="w-full h-full object-cover" />
                : <span>@</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium truncate">
                  {k.display_name || `@${k.handle}`}
                </span>
                {k.verified && <span className="text-cyan-400 text-[10px]">✓</span>}
              </div>
              <div className="text-[10px] font-mono text-text-muted truncate">
                @{k.handle}{k.reason ? ` · ${k.reason}` : ""}
              </div>
            </div>
            <div className="shrink-0">
              {k.status === "looking-up" && <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" />}
              {k.status === "pending" && <span className="text-[10px] text-text-muted font-mono">queued</span>}
              {k.status === "not-found" && (
                <button
                  onClick={() => onRetry(k.handle)}
                  className="text-[10px] text-amber-400 hover:underline font-mono"
                  title="Handle not found on X — click to retry"
                >
                  not found · retry
                </button>
              )}
              {k.status === "found" && <Check className="w-3.5 h-3.5 text-cyan-400" />}
            </div>
            <button onClick={() => onRemove(k.handle)} className="text-text-muted hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewStep(props: {
  name: string; shortCode: string; city: string; country: string;
  startDate: string; endDate: string; status: string;
  website: string; description: string;
  areas: CancerArea[]; primaryAreaId: string | null;
  primaryTags: string[]; communityTags: string[];
  kols: Kol[];
}) {
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-1.5 border-b border-border/50">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="text-[12px] text-text-primary">{value || <span className="text-text-muted italic">—</span>}</div>
    </div>
  );
  return (
    <div className="space-y-1">
      <Row label="Name" value={props.name} />
      <Row label="Short code" value={<span className="font-mono">{props.shortCode}</span>} />
      <Row label="Status" value={props.status} />
      <Row label="Location" value={[props.city, props.country].filter(Boolean).join(", ")} />
      <Row label="Dates" value={props.startDate && props.endDate ? `${props.startDate} → ${props.endDate}` : ""} />
      {props.website && <Row label="Website" value={<a href={props.website} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{props.website}</a>} />}
      {props.description && <Row label="Description" value={props.description} />}
      <Row
        label="Cancer areas"
        value={
          props.areas.length ? (
            <div className="flex flex-wrap gap-1">
              {props.areas.map((a) => (
                <span key={a.id} className={cn(
                  "text-[10px] uppercase tracking-wider px-1.5 py-0.5 border rounded-[2px]",
                  a.id === props.primaryAreaId ? "border-accent text-accent bg-accent/10" : "border-border text-text-muted",
                )}>
                  {a.name}{a.id === props.primaryAreaId && " ★"}
                </span>
              ))}
            </div>
          ) : ""
        }
      />
      <Row
        label="Primary hashtags"
        value={props.primaryTags.length ? props.primaryTags.map((t) => `#${t}`).join("  ") : ""}
      />
      <Row
        label="Community hashtags"
        value={props.communityTags.length ? props.communityTags.map((t) => `#${t}`).join("  ") : ""}
      />
      <Row
        label="Featured KOLs"
        value={
          props.kols.length ? (
            <div className="flex flex-wrap gap-1.5">
              {props.kols.map((k) => (
                <span key={k.handle} className="text-[11px] font-mono text-text-primary border border-border rounded-[2px] px-1.5 py-0.5">
                  @{k.handle}
                </span>
              ))}
            </div>
          ) : ""
        }
      />
    </div>
  );
}

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("grid gap-1", full ? "col-span-2" : "")}>
      <Label className="text-[10px] uppercase tracking-wider text-text-muted">{label}</Label>
      {children}
    </div>
  );
}

export default CongressWizard;