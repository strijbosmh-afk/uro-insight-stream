import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, X, ArrowRight, ArrowLeft, Sparkles, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { enqueueUserSources, getUserIngestStatus } from "@/server/onboarding.functions";

const STEPS = ["Welcome", "Specialties", "Sources", "Review", "Provisioning"] as const;
type StepName = (typeof STEPS)[number];

type Specialty = { id: string; label: string; description: string };
type DraftSource = {
  handle: string;
  status: "pending" | "looking-up" | "found" | "not-found" | "rate-limited";
  display_name?: string;
  avatar_url?: string;
};

export interface WizardProps {
  onClose: (reason: "completed" | "skipped" | "dismissed") => void;
  initialStep?: number; // 1..5
}

export function OnboardingWizard({ onClose, initialStep = 1 }: WizardProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [stepIndex, setStepIndex] = React.useState(Math.max(1, Math.min(5, initialStep)));
  const [selectedSpecialties, setSelectedSpecialties] = React.useState<string[]>([]);
  const [primarySpecialty, setPrimarySpecialty] = React.useState<string | null>(null);
  const [draftSources, setDraftSources] = React.useState<DraftSource[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const enqueueFn = useServerFn(enqueueUserSources);

  const persistStep = React.useCallback(
    async (next: number) => {
      if (!user) return;
      await supabase
        .from("user_onboarding_state")
        .upsert(
          {
            user_id: user.id,
            current_step: next,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
    },
    [user],
  );

  const goNext = async () => {
    const next = Math.min(STEPS.length, stepIndex + 1);
    setStepIndex(next);
    await persistStep(next);
  };
  const goBack = async () => {
    const next = Math.max(1, stepIndex - 1);
    setStepIndex(next);
    await persistStep(next);
  };

  const handleSkip = async () => {
    if (!user) return;
    await supabase
      .from("user_onboarding_state")
      .upsert(
        {
          user_id: user.id,
          current_step: stepIndex,
          skipped_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    qc.invalidateQueries({ queryKey: ["onboarding-state"] });
    onClose("skipped");
  };

  const handleFinish = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    try {
      // 1. Save specialties
      if (selectedSpecialties.length > 0) {
        const rows = selectedSpecialties.map((id) => ({
          user_id: user.id,
          specialty_id: id,
          is_primary: id === primarySpecialty,
        }));
        await supabase.from("user_specialties").upsert(rows, { onConflict: "user_id,specialty_id" });
      }
      // 2. Subscribe to chosen sources
      const found = draftSources.filter((s) => s.status === "found");
      if (found.length > 0) {
        const subs = found.map((s) => ({
          user_id: user.id,
          source_id: s.handle.toLowerCase(),
        }));
        await supabase.from("user_subscribed_sources").upsert(subs, { onConflict: "user_id,source_id" });
        // 3. Enqueue ingest jobs (server-side, admin-context)
        await enqueueFn({ data: { source_ids: found.map((s) => s.handle.toLowerCase()) } });
      }
      // 4. Advance to provisioning step
      setStepIndex(5);
      await persistStep(5);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleProvisioningDone = async () => {
    if (!user) return;
    await supabase
      .from("user_onboarding_state")
      .upsert(
        {
          user_id: user.id,
          current_step: 5,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    qc.invalidateQueries({ queryKey: ["onboarding-state"] });
    onClose("completed");
  };

  const stepName = STEPS[stepIndex - 1];
  const canContinue = stepValidates(stepName, { selectedSpecialties, draftSources });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 backdrop-blur-sm p-6">
      <div
        className="relative w-full max-w-3xl flex flex-col"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          minHeight: "600px",
          maxHeight: "90vh",
        }}
      >
        {/* Cyan accent stripe */}
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "var(--accent)" }} />

        {/* Body */}
        <div className="flex-1 overflow-auto p-10">
          {stepName === "Welcome" && (
            <WelcomeStep onSkip={handleSkip} />
          )}
          {stepName === "Specialties" && (
            <SpecialtiesStep
              selected={selectedSpecialties}
              primary={primarySpecialty}
              onChange={(ids, primary) => {
                setSelectedSpecialties(ids);
                setPrimarySpecialty(primary);
              }}
            />
          )}
          {stepName === "Sources" && (
            <SourcesStep
              draft={draftSources}
              onChange={setDraftSources}
              token={null /* using fetch with session */}
            />
          )}
          {stepName === "Review" && (
            <ReviewStep
              specialties={selectedSpecialties}
              primarySpecialty={primarySpecialty}
              sources={draftSources.filter((s) => s.status === "found")}
            />
          )}
          {stepName === "Provisioning" && (
            <ProvisioningStep onDone={handleProvisioningDone} />
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-10 py-5"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-text-secondary uppercase tracking-wider">
              Step {stepIndex} / {STEPS.length} · {stepName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {stepName !== "Provisioning" && stepName !== "Welcome" && (
              <Button variant="ghost" size="sm" onClick={handleSkip}>
                Skip — I'll set this up later
              </Button>
            )}
            {stepIndex > 1 && stepIndex < 5 && (
              <Button variant="outline" size="sm" onClick={goBack}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
            {stepName === "Welcome" && (
              <Button size="sm" onClick={goNext}>
                Get started <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {stepName === "Specialties" && (
              <Button size="sm" onClick={goNext} disabled={!canContinue}>
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {stepName === "Sources" && (
              <Button size="sm" onClick={goNext} disabled={!canContinue}>
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {stepName === "Review" && (
              <Button size="sm" onClick={handleFinish} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Confirm and provision
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function stepValidates(name: StepName, state: { selectedSpecialties: string[]; draftSources: DraftSource[] }) {
  if (name === "Specialties") return state.selectedSpecialties.length >= 1;
  if (name === "Sources") return state.draftSources.filter((s) => s.status === "found").length >= 1;
  return true;
}

// ---------------- Welcome ----------------
function WelcomeStep({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-text-primary">Welcome to UroFeed</h2>
        <p className="mt-2 text-sm text-text-secondary max-w-xl">
          We'll set up your personalized feed in under a minute. Pick your areas of focus, add the
          accounts you trust, and we'll start ingesting their posts in real time.
        </p>
      </div>
      <div className="space-y-3 max-w-xl">
        <Step number={1} label="Choose your urology specialties" />
        <Step number={2} label="Add the X accounts you want to track" />
        <Step number={3} label="Review and provision your feed" />
      </div>
      <p className="text-xs text-text-muted">
        You can change everything later from Settings → Interests.{" "}
        <button className="underline hover:text-accent" onClick={onSkip}>
          Or skip for now.
        </button>
      </p>
    </div>
  );
}

function Step({ number, label }: { number: number; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="font-mono text-xs flex items-center justify-center"
        style={{
          width: "24px",
          height: "24px",
          border: "1px solid var(--border)",
          color: "var(--accent)",
        }}
      >
        {number}
      </span>
      <span className="text-sm text-text-primary">{label}</span>
    </div>
  );
}

// ---------------- Specialties ----------------
function SpecialtiesStep({
  selected,
  primary,
  onChange,
}: {
  selected: string[];
  primary: string | null;
  onChange: (ids: string[], primary: string | null) => void;
}) {
  const { data: specialties = [] } = useQuery({
    queryKey: ["urology-specialties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("urology_specialties")
        .select("id, label, description")
        .order("sort_order");
      if (error) throw error;
      return data as Specialty[];
    },
  });

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      const next = selected.filter((s) => s !== id);
      const newPrimary = primary === id ? next[0] ?? null : primary;
      onChange(next, newPrimary);
    } else {
      if (selected.length >= 3) return;
      const next = [...selected, id];
      onChange(next, primary ?? id);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Pick your specialties</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Choose 1–3. The first one is your primary focus.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {specialties.map((s) => {
          const isSelected = selected.includes(s.id);
          const isPrimary = primary === s.id;
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={cn(
                "text-left p-3 transition-all",
                isSelected ? "border-accent" : "hover:border-text-muted",
              )}
              style={{
                background: isSelected ? "var(--panel-elevated)" : "var(--panel)",
                border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">{s.label}</span>
                {isPrimary && (
                  <span className="font-mono text-[10px] uppercase text-accent">Primary</span>
                )}
              </div>
              <p className="mt-1 text-xs text-text-secondary line-clamp-2">{s.description}</p>
            </button>
          );
        })}
      </div>
      {selected.length > 1 && (
        <div className="text-xs text-text-secondary">
          Primary:{" "}
          <select
            value={primary ?? ""}
            onChange={(e) => onChange(selected, e.target.value)}
            className="bg-panel border border-border px-2 py-1 text-text-primary"
          >
            {selected.map((id) => {
              const s = specialties.find((x) => x.id === id);
              return (
                <option key={id} value={id}>
                  {s?.label ?? id}
                </option>
              );
            })}
          </select>
        </div>
      )}
    </div>
  );
}

// ---------------- Sources ----------------
function SourcesStep({
  draft,
  onChange,
}: {
  draft: DraftSource[];
  onChange: (next: DraftSource[]) => void;
  token: string | null;
}) {
  const [input, setInput] = React.useState("");
  const [warning, setWarning] = React.useState<{ kind: "user" | "global"; resetsIn: number } | null>(null);

  const addHandles = async () => {
    if (!input.trim()) return;
    const raw = input
      .split(/[,\s]+/)
      .map((h) => h.trim().replace(/^@/, "").toLowerCase())
      .filter((h) => /^[a-z0-9_]{1,15}$/.test(h));
    const existingHandles = new Set(draft.map((d) => d.handle.toLowerCase()));
    const fresh = raw.filter((h) => !existingHandles.has(h));
    if (fresh.length === 0) {
      setInput("");
      return;
    }
    // Optimistically add as looking-up
    const next = [...draft, ...fresh.map((h): DraftSource => ({ handle: h, status: "looking-up" }))];
    onChange(next);
    setInput("");

    // Call lookup endpoint
    try {
      const sessionRes = await supabase.auth.getSession();
      const accessToken = sessionRes.data.session?.access_token;
      const res = await fetch("/api/lookup-handle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ handles: fresh }),
      });
      if (res.status === 429) {
        const body = (await res.json()) as { error?: string; resets_in_seconds?: number };
        const kind = body.error === "global_rate_limit" ? "global" : "user";
        setWarning({ kind, resetsIn: body.resets_in_seconds ?? 60 });
        // Mark as rate-limited so user can retry
        onChange(next.map((d) => (fresh.includes(d.handle) ? { ...d, status: "rate-limited" } : d)));
        return;
      }
      if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
      const body = (await res.json()) as {
        results: Array<{
          handle: string;
          found: boolean;
          source?: { display_name: string; avatar_url: string };
        }>;
      };
      const updated = next.map((d) => {
        const result = body.results.find((r) => r.handle === d.handle);
        if (!result) return d;
        if (result.found && result.source) {
          return {
            ...d,
            status: "found" as const,
            display_name: result.source.display_name,
            avatar_url: result.source.avatar_url,
          };
        }
        return { ...d, status: "not-found" as const };
      });
      onChange(updated);
      setWarning(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lookup failed");
      onChange(next.map((d) => (fresh.includes(d.handle) ? { ...d, status: "not-found" } : d)));
    }
  };

  const removeHandle = (h: string) => {
    onChange(draft.filter((d) => d.handle !== h));
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Who do you want to follow?</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Add X handles — KOLs, journals, societies. We'll verify each one and start pulling their
          posts immediately.
        </p>
      </div>

      {warning && (
        <div
          className="flex items-start gap-2 p-3 text-xs"
          style={{
            background: warning.kind === "user" ? "color-mix(in oklab, #FBBF24 12%, var(--panel))" : "color-mix(in oklab, #F59E0B 12%, var(--panel))",
            border: `1px solid ${warning.kind === "user" ? "#FBBF24" : "#F59E0B"}`,
            color: "var(--text-primary)",
          }}
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            {warning.kind === "user" ? (
              <>Slow down — added handles will resolve in ~{warning.resetsIn}s.</>
            ) : (
              <>System is busy — your handles will resolve when the queue clears (~{warning.resetsIn}s). You can continue.</>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="@Uroweb, @AmerUrological, JUrology…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addHandles();
            }
          }}
        />
        <Button onClick={addHandles} disabled={!input.trim()}>Add</Button>
      </div>

      <div className="space-y-1.5 max-h-[280px] overflow-auto">
        {draft.length === 0 && (
          <p className="text-xs text-text-muted italic">No handles added yet.</p>
        )}
        {draft.map((d) => (
          <div
            key={d.handle}
            className="flex items-center justify-between px-3 py-2"
            style={{ background: "var(--panel-elevated)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-3 min-w-0">
              {d.avatar_url ? (
                <img src={d.avatar_url} alt="" className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-panel border border-border" />
              )}
              <div className="min-w-0">
                <div className="text-sm text-text-primary truncate">
                  {d.display_name ?? `@${d.handle}`}
                </div>
                <div className="font-mono text-[10px] text-text-secondary">@{d.handle}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {d.status === "looking-up" && <Loader2 className="h-3.5 w-3.5 animate-spin text-text-secondary" />}
              {d.status === "found" && <Check className="h-3.5 w-3.5 text-accent" />}
              {d.status === "not-found" && (
                <span className="font-mono text-[10px] text-red-400 uppercase">Not found</span>
              )}
              {d.status === "rate-limited" && (
                <span className="font-mono text-[10px] text-yellow-400 uppercase">Queued</span>
              )}
              <button onClick={() => removeHandle(d.handle)} className="text-text-muted hover:text-text-primary">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- Review ----------------
function ReviewStep({
  specialties,
  primarySpecialty,
  sources,
}: {
  specialties: string[];
  primarySpecialty: string | null;
  sources: DraftSource[];
}) {
  const { data: specs = [] } = useQuery({
    queryKey: ["urology-specialties"],
    queryFn: async () => {
      const { data } = await supabase.from("urology_specialties").select("id, label");
      return (data ?? []) as Array<{ id: string; label: string }>;
    },
  });

  const labelFor = (id: string) => specs.find((s) => s.id === id)?.label ?? id;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Review your setup</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Confirm and we'll start pulling tweets from the last 72 hours immediately.
        </p>
      </div>

      <Section title="Specialties">
        <div className="flex flex-wrap gap-2">
          {specialties.map((id) => (
            <span
              key={id}
              className={cn(
                "px-2 py-1 text-xs font-mono",
                id === primarySpecialty ? "text-accent-foreground" : "text-text-primary",
              )}
              style={{
                background: id === primarySpecialty ? "var(--accent)" : "var(--panel-elevated)",
                border: "1px solid var(--border)",
              }}
            >
              {labelFor(id)}
              {id === primarySpecialty && " · primary"}
            </span>
          ))}
        </div>
      </Section>

      <Section title={`Sources (${sources.length})`}>
        <div className="space-y-1">
          {sources.map((s) => (
            <div key={s.handle} className="flex items-center gap-2 text-sm">
              <Check className="h-3.5 w-3.5 text-accent" />
              <span className="text-text-primary">{s.display_name ?? `@${s.handle}`}</span>
              <span className="font-mono text-[10px] text-text-secondary">@{s.handle}</span>
            </div>
          ))}
          {sources.length === 0 && (
            <p className="text-xs text-text-muted italic">No sources — feed will be empty.</p>
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-mono text-xs uppercase tracking-wider text-text-secondary mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ---------------- Provisioning ----------------
function ProvisioningStep({ onDone }: { onDone: () => void }) {
  const fetchStatus = useServerFn(getUserIngestStatus);
  const { data, refetch } = useQuery({
    queryKey: ["onboarding-ingest-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 2000,
  });

  const total = (data?.queued ?? 0) + (data?.processing ?? 0) + (data?.completed ?? 0) + (data?.failed ?? 0);
  const done = (data?.completed ?? 0) + (data?.failed ?? 0);
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;

  React.useEffect(() => {
    if (allDone) {
      const t = setTimeout(() => onDone(), 1200);
      return () => clearTimeout(t);
    }
  }, [allDone, onDone]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Provisioning your feed…</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Fetching the last 72 hours of posts from your sources. This usually takes under a minute.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between font-mono text-xs">
          <span className="text-text-secondary">Progress</span>
          <span className="text-text-primary">{progress}%</span>
        </div>
        <div className="h-1" style={{ background: "var(--panel-elevated)" }}>
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${progress}%`, background: "var(--accent)" }}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label="Queued" value={data?.queued ?? 0} />
        <Stat label="Processing" value={data?.processing ?? 0} />
        <Stat label="Completed" value={data?.completed ?? 0} accent />
        <Stat label="Failed" value={data?.failed ?? 0} />
      </div>

      {allDone && (
        <div className="text-center text-sm text-accent flex items-center justify-center gap-2">
          <Check className="h-4 w-4" /> All sources provisioned. Redirecting to your dashboard…
        </div>
      )}

      {!allDone && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={onDone}>
            Skip waiting — go to dashboard
          </Button>
        </div>
      )}

      <button hidden onClick={() => refetch()} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="p-3" style={{ background: "var(--panel-elevated)", border: "1px solid var(--border)" }}>
      <div className={cn("font-mono text-2xl", accent ? "text-accent" : "text-text-primary")}>{value}</div>
      <div className="font-mono text-[10px] uppercase text-text-secondary mt-1">{label}</div>
    </div>
  );
}