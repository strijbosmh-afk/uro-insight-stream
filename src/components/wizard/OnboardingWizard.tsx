import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, X, ArrowRight, ArrowLeft, Sparkles, AlertTriangle, Calendar, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { enqueueUserSources, getUserIngestStatus, processUserIngestQueue } from "@/serverFns/onboarding";
import { Link } from "@tanstack/react-router";
import { useCongressSuggest, type CongressSuggestion } from "@/hooks/useCongressSuggest";
import { feedService } from "@/services/feedService";
import { XConnectWizard } from "@/components/x-wizard/XConnectWizard";
import { getXConnectionStatus } from "@/serverFns/x-credentials";
import { getXSetupProgress } from "@/serverFns/x-setup-progress";
import { ImportFollowsPanel } from "@/components/x/ImportFollowsPanel";

const STEPS = [
  "Welcome",
  "Specialties",
  "Congresses",
  "ConnectX",
  "ImportFollows",
  "Sources",
  "Hashtags",
  "Review",
  "Provisioning",
] as const;
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
  initialStep?: number; // 1..7
  /**
   * When set, the wizard renders ONLY that step in standalone mode for
   * Settings re-runs. Saving exits via onClose("completed").
   */
  scopeStep?: StepName;
}

export function OnboardingWizard({ onClose, initialStep = 1, scopeStep }: WizardProps) {
  const { user } = useAuth();
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();
  const scopedIndex = scopeStep ? STEPS.indexOf(scopeStep) + 1 : null;
  const [stepIndex, setStepIndex] = React.useState(
    scopedIndex ?? Math.max(1, Math.min(STEPS.length, initialStep)),
  );
  const [selectedSpecialties, setSelectedSpecialties] = React.useState<string[]>([]);
  const [primarySpecialty, setPrimarySpecialty] = React.useState<string | null>(null);
  const [selectedCongressIds, setSelectedCongressIds] = React.useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = React.useState("");
  const [acceptedHashtags, setAcceptedHashtags] = React.useState<string[]>([]);
  const [draftSources, setDraftSources] = React.useState<DraftSource[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const enqueueFn = useServerFn(enqueueUserSources);
  const [xWizardOpen, setXWizardOpen] = React.useState(false);
  const { data: xStatus } = useQuery({
    queryKey: ["x-connection-status"],
    queryFn: () => getXConnectionStatus(),
  });
  const { data: xSetup } = useQuery({
    queryKey: ["x-setup-progress"],
    queryFn: () => getXSetupProgress(),
  });

  // Hydrate existing user state when scope-running so users see their picks.
  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [specsRes, congRes, hashRes, subSrcRes] = await Promise.all([
        supabase
          .from("user_specialties")
          .select("specialty_id, is_primary")
          .eq("user_id", user.id),
        supabase
          .from("user_subscribed_congresses")
          .select("congress_id")
          .eq("user_id", user.id),
        supabase
          .from("user_subscribed_hashtags")
          .select("hashtag_id, hashtags(tag)")
          .eq("user_id", user.id),
        supabase
          .from("user_subscribed_sources")
          .select("source_id, sources(id, handle, display_name, avatar_url)")
          .eq("user_id", user.id),
      ]);
      if (cancelled) return;
      const specs = (specsRes.data ?? []) as Array<{ specialty_id: string; is_primary: boolean }>;
      if (specs.length > 0) {
        setSelectedSpecialties(specs.map((s) => s.specialty_id));
        setPrimarySpecialty(specs.find((s) => s.is_primary)?.specialty_id ?? specs[0].specialty_id);
      }
      setSelectedCongressIds((congRes.data ?? []).map((c: { congress_id: string }) => c.congress_id));
      const tags = ((hashRes.data ?? []) as Array<{ hashtags: { tag: string } | null }>)
        .map((r) => r.hashtags?.tag)
        .filter((t): t is string => !!t);
      setAcceptedHashtags(tags);
      const srcRows = (subSrcRes.data ?? []) as Array<{
        source_id: string;
        sources: { id: string; handle: string; display_name: string; avatar_url: string } | null;
      }>;
      if (srcRows.length > 0) {
        setDraftSources(
          srcRows.map((r): DraftSource => ({
            handle: r.sources?.handle ?? r.source_id,
            status: "found",
            display_name: r.sources?.display_name,
            avatar_url: r.sources?.avatar_url,
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const persistStep = React.useCallback(
    async (next: number) => {
      if (!user || scopeStep) return; // partial re-runs don't touch onboarding state
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
    [user, scopeStep],
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
    if (scopeStep) {
      onClose("dismissed");
      return;
    }
    const skippedAt = new Date().toISOString();
    // Optimistically mark the gate as skipped BEFORE closing so the
    // AppShell auto-open effect doesn't reopen the wizard while the
    // refetch is still in flight.
    qc.setQueryData(["onboarding-state", user.id], (prev: unknown) => {
      const base =
        (prev as { state: unknown; hasSpecialty: boolean } | undefined) ?? {
          state: null,
          hasSpecialty: false,
        };
      return {
        ...base,
        state: {
          current_step: stepIndex,
          completed_at: null,
          ...((base.state as object) ?? {}),
          skipped_at: skippedAt,
        },
      };
    });
    onClose("skipped");
    await supabase
      .from("user_onboarding_state")
      .upsert(
        {
          user_id: user.id,
          current_step: stepIndex,
          skipped_at: skippedAt,
        },
        { onConflict: "user_id" },
      );
    qc.invalidateQueries({ queryKey: ["onboarding-state"] });
  };

  // ---- Persistence helpers (scoped saves use these too) ----
  const persistSpecialties = React.useCallback(async () => {
    if (!user) return;
    // Replace user's specialty rows with current selection
    await supabase.from("user_specialties").delete().eq("user_id", user.id);
    if (selectedSpecialties.length > 0) {
      const rows = selectedSpecialties.map((id) => ({
        user_id: user.id,
        specialty_id: id,
        is_primary: id === primarySpecialty,
      }));
      await supabase.from("user_specialties").insert(rows);
    }
  }, [user, selectedSpecialties, primarySpecialty]);

  const persistCongresses = React.useCallback(async () => {
    if (!user) return;
    if (selectedCongressIds.length > 0) {
      const rows = selectedCongressIds.map((id) => ({ user_id: user.id, congress_id: id }));
      await supabase
        .from("user_subscribed_congresses")
        .upsert(rows, { onConflict: "user_id,congress_id" });
    }
  }, [user, selectedCongressIds]);

  const persistHashtags = React.useCallback(async () => {
    if (!user || acceptedHashtags.length === 0) return;
    // Lowercase normalisation; insert into global hashtags then subscribe.
    const lc = Array.from(new Set(acceptedHashtags.map((t) => t.toLowerCase())));
    const { data: existing } = await supabase
      .from("hashtags")
      .select("id, tag")
      .in("tag", lc);
    const existingByTag = new Map(
      ((existing ?? []) as Array<{ id: string; tag: string }>).map((h) => [
        h.tag.toLowerCase(),
        h.id,
      ]),
    );
    const toCreate = lc.filter((t) => !existingByTag.has(t));
    if (toCreate.length > 0) {
      const newRows = toCreate.map((tag) => ({ id: `tag_${tag}`, tag, active: true }));
      const { data: inserted, error } = await supabase
        .from("hashtags")
        .insert(newRows)
        .select("id, tag");
      if (error) {
        // RLS blocks non-admin/editor users from creating new hashtags. Fall
        // back to subscribing only to the ones that already exist.
        toast.message("Some hashtags require an admin to create them first");
      } else {
        for (const row of inserted ?? []) existingByTag.set(row.tag.toLowerCase(), row.id);
      }
    }
    const subs = lc
      .map((t) => existingByTag.get(t))
      .filter((id): id is string => !!id)
      .map((id) => ({ user_id: user.id, hashtag_id: id }));
    if (subs.length > 0) {
      await supabase
        .from("user_subscribed_hashtags")
        .upsert(subs, { onConflict: "user_id,hashtag_id" });
    }
  }, [user, acceptedHashtags]);

  const persistSources = React.useCallback(async () => {
    if (!user) return;
    const found = draftSources.filter((s) => s.status === "found");
    if (found.length === 0) return;
    const subs = found.map((s) => ({
      user_id: user.id,
      source_id: s.handle.toLowerCase(),
    }));
    await supabase
      .from("user_subscribed_sources")
      .upsert(subs, { onConflict: "user_id,source_id" });
    await enqueueFn({ data: { source_ids: found.map((s) => s.handle.toLowerCase()) } });
  }, [user, draftSources, enqueueFn]);

  const handleScopedSave = async () => {
    if (!user || submitting || !scopeStep) return;
    setSubmitting(true);
    try {
      if (scopeStep === "Specialties") await persistSpecialties();
      else if (scopeStep === "Congresses") await persistCongresses();
      else if (scopeStep === "Hashtags") await persistHashtags();
      else if (scopeStep === "Sources") await persistSources();
      qc.invalidateQueries({ queryKey: ["user-specialties", user.id] });
      qc.invalidateQueries({ queryKey: ["user-subscribed-sources", user.id] });
      qc.invalidateQueries({ queryKey: ["user-subscribed-hashtags", user.id] });
      qc.invalidateQueries({ queryKey: ["user-subscribed-congresses", user.id] });
      qc.invalidateQueries({ queryKey: ["new-recommended-sources-count"] });
      toast.success("Saved");
      onClose("completed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinish = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    try {
      await persistSpecialties();
      await persistCongresses();
      await persistHashtags();
      await persistSources();
      // Advance to provisioning step
      const provIdx = STEPS.indexOf("Provisioning") + 1;
      setStepIndex(provIdx);
      await persistStep(provIdx);
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
          current_step: STEPS.length,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    qc.invalidateQueries({ queryKey: ["onboarding-state"] });
    onClose("completed");
  };

  const stepName = STEPS[stepIndex - 1];
  const canContinue = stepValidates(stepName, {
    selectedSpecialties,
    draftSources,
    selectedCongressIds,
  });

  // Pre-check recommended congresses & sources whenever specialties change AND we
  // are entering those steps for the first time (no existing selection).
  const recommendedSeededRef = React.useRef<{ congresses: boolean; sources: boolean }>({
    congresses: false,
    sources: false,
  });
  const seedRecommendedCongresses = React.useCallback(async () => {
    if (recommendedSeededRef.current.congresses) return;
    if (selectedSpecialties.length === 0) return;
    const { data } = await supabase
      .from("recommended_congresses_by_specialty")
      .select("congress_id, weight")
      .in("specialty_id", selectedSpecialties)
      .order("weight", { ascending: false });
    const ids = Array.from(
      new Set(((data ?? []) as Array<{ congress_id: string }>).map((r) => r.congress_id)),
    );
    setSelectedCongressIds((prev) => Array.from(new Set([...prev, ...ids])));
    recommendedSeededRef.current.congresses = true;
  }, [selectedSpecialties]);

  const seedRecommendedSources = React.useCallback(async () => {
    if (recommendedSeededRef.current.sources) return;
    if (selectedSpecialties.length === 0) return;
    const { data } = await supabase
      .from("recommended_sources_by_specialty")
      .select("source_id, weight, sources(id, handle, display_name, avatar_url)")
      .in("specialty_id", selectedSpecialties)
      .order("weight", { ascending: false });
    const seen = new Set(draftSources.map((d) => d.handle.toLowerCase()));
    const fresh: DraftSource[] = [];
    for (const row of (data ?? []) as Array<{
      source_id: string;
      sources: { id: string; handle: string; display_name: string; avatar_url: string } | null;
    }>) {
      const handle = (row.sources?.handle ?? row.source_id).toLowerCase();
      if (seen.has(handle)) continue;
      seen.add(handle);
      fresh.push({
        handle,
        status: "found",
        display_name: row.sources?.display_name,
        avatar_url: row.sources?.avatar_url,
      });
    }
    if (fresh.length > 0) setDraftSources((prev) => [...prev, ...fresh]);
    recommendedSeededRef.current.sources = true;
  }, [selectedSpecialties, draftSources]);

  React.useEffect(() => {
    if (stepName === "Congresses") void seedRecommendedCongresses();
    if (stepName === "Sources") void seedRecommendedSources();
  }, [stepName, seedRecommendedCongresses, seedRecommendedSources]);

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
          {stepName === "Congresses" && (
            <CongressesStep
              specialtyIds={selectedSpecialties}
              selected={selectedCongressIds}
              onChange={setSelectedCongressIds}
            />
          )}
          {stepName === "Sources" && (
            <SourcesStep
              draft={draftSources}
              onChange={setDraftSources}
              token={null /* using fetch with session */}
            />
          )}
          {stepName === "ConnectX" && (
            <ConnectXStep
              connected={!!xStatus}
              username={xStatus?.x_username ?? null}
              currentStep={xSetup?.progress?.current_step ?? 1}
              onLaunch={() => setXWizardOpen(true)}
              onDefer={async () => {
                if (!user) return;
                await supabase
                  .from("profiles")
                  .update({ pending_x_connection: true })
                  .eq("id", user.id);
                await goNext();
              }}
            />
          )}
          {stepName === "ImportFollows" && (
            <>
              {xStatus ? (
                <ImportFollowsPanel
                  onDone={() => void goNext()}
                  onSkip={() => void goNext()}
                />
              ) : (
                <div className="space-y-4 max-w-xl">
                  <h2 className="text-xl font-semibold text-text-primary">
                    Import your X follows
                  </h2>
                  <p className="text-sm text-text-secondary">
                    Skipped because X isn't connected — you can import your
                    follows anytime from the Sources page after connecting.
                  </p>
                  <Button size="sm" onClick={() => void goNext()}>
                    Continue <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
          {stepName === "Hashtags" && (
            <HashtagsStep
              input={hashtagInput}
              onInput={setHashtagInput}
              accepted={acceptedHashtags}
              onAccepted={setAcceptedHashtags}
            />
          )}
          {stepName === "Review" && (
            <ReviewStep
              specialties={selectedSpecialties}
              primarySpecialty={primarySpecialty}
              sources={draftSources.filter((s) => s.status === "found")}
              congressIds={selectedCongressIds}
              hashtags={acceptedHashtags}
            />
          )}
          {stepName === "Provisioning" && (
            <ProvisioningStep
              onDone={handleProvisioningDone}
              isAdmin={isAdmin}
              onRestart={async () => {
                setStepIndex(1);
                await persistStep(1);
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-10 py-5"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-text-secondary uppercase tracking-wider">
              Step {stepIndex} / {STEPS.length} · {stepName.toLowerCase()}
              {stepName === "Congresses" && ` · ${selectedCongressIds.length} selected`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!scopeStep && stepName !== "Provisioning" && stepName !== "Welcome" && (
              <Button variant="ghost" size="sm" onClick={handleSkip}>
                Skip — I'll set this up later
              </Button>
            )}
            {!scopeStep && stepIndex > 1 && stepName !== "Provisioning" && stepName !== "Review" && (
              <Button variant="outline" size="sm" onClick={goBack}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
            {scopeStep && (
              <>
                <Button variant="ghost" size="sm" onClick={() => onClose("dismissed")}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleScopedSave} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Save changes
                </Button>
              </>
            )}
            {!scopeStep && stepName === "Welcome" && (
              <Button size="sm" onClick={goNext}>
                Get started <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {!scopeStep && (stepName === "Specialties" || stepName === "Congresses" || stepName === "Sources" || stepName === "Hashtags" || stepName === "ImportFollows") && (
              <Button size="sm" onClick={goNext} disabled={!canContinue}>
                Continue <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            {!scopeStep && stepName === "Review" && (
              <Button size="sm" onClick={handleFinish} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Confirm and provision
              </Button>
            )}
          </div>
        </div>
      </div>
      {xWizardOpen && (
        <XConnectWizard
          open={xWizardOpen}
          onOpenChange={setXWizardOpen}
          onConnected={async () => {
            if (user) {
              await supabase
                .from("profiles")
                .update({ pending_x_connection: false })
                .eq("id", user.id);
            }
            qc.invalidateQueries({ queryKey: ["x-connection-status"] });
            setXWizardOpen(false);
            await goNext();
          }}
        />
      )}
    </div>
  );
}

function stepValidates(
  name: StepName,
  state: {
    selectedSpecialties: string[];
    draftSources: DraftSource[];
    selectedCongressIds: string[];
  },
) {
  if (name === "Specialties") return state.selectedSpecialties.length >= 1;
  if (name === "Congresses") return true; // optional, but pre-checked
  if (name === "Sources") return state.draftSources.filter((s) => s.status === "found").length >= 1;
  if (name === "Hashtags") return true; // optional
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

// ---------------- Connect X ----------------
function ConnectXStep({
  connected,
  username,
  currentStep,
  onLaunch,
  onDefer,
}: {
  connected: boolean;
  username: string | null;
  currentStep: number;
  onLaunch: () => void;
  onDefer: () => void | Promise<void>;
}) {
  const completed = Math.max(0, Math.min(8, currentStep - 1));
  const inProgress = !connected && completed > 0;
  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">
          Connect your X (Twitter) API
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          UroFeed runs ingestion and posting through <b>your</b> X developer
          credentials so the platform doesn't share a single quota across
          everyone. The setup wizard walks you through the X Developer Portal
          in 8 illustrated steps — about 5 minutes.
        </p>
      </div>
      {connected ? (
        <div className="border border-success/40 bg-success/10 rounded-[3px] p-3 text-sm">
          <Check className="inline w-4 h-4 text-success mr-1" />
          Connected as <b>@{username}</b>. You can continue.
        </div>
      ) : (
        <div className="border border-border rounded-[3px] p-3 text-xs text-text-muted bg-panel-elevated">
          You have a 14-day grace window: ingestion runs once daily on up to
          10 sources using a shared platform token while you set this up.
          After that, ingestion pauses until you connect.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onLaunch}>
          {connected
            ? "Manage X connection"
            : inProgress
              ? `Resume setup (${completed} of 8 complete)`
              : "Set this up now"}
        </Button>
        <Button variant="ghost" onClick={() => void onDefer()}>
          I'll do this later
        </Button>
      </div>
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
  congressIds,
  hashtags,
}: {
  specialties: string[];
  primarySpecialty: string | null;
  sources: DraftSource[];
  congressIds: string[];
  hashtags: string[];
}) {
  const { data: specs = [] } = useQuery({
    queryKey: ["urology-specialties"],
    queryFn: async () => {
      const { data } = await supabase.from("urology_specialties").select("id, label");
      return (data ?? []) as Array<{ id: string; label: string }>;
    },
  });
  const { data: congs = [] } = useQuery({
    queryKey: ["wizard-review-congresses", congressIds.join(",")],
    enabled: congressIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("congresses")
        .select("id, name, short_code")
        .in("id", congressIds);
      return (data ?? []) as Array<{ id: string; name: string; short_code: string }>;
    },
  });

  const labelFor = (id: string) => specs.find((s) => s.id === id)?.label ?? id;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Review your setup</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Confirm and we'll start pulling posts from the last 72 hours immediately.
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

      <Section title={`Congresses (${congressIds.length})`}>
        <div className="flex flex-wrap gap-2">
          {congs.map((c) => (
            <span
              key={c.id}
              className="px-2 py-1 text-xs font-mono text-text-primary"
              style={{ background: "var(--panel-elevated)", border: "1px solid var(--border)" }}
            >
              {c.short_code}
            </span>
          ))}
          {congressIds.length === 0 && (
            <p className="text-xs text-text-muted italic">None selected.</p>
          )}
        </div>
      </Section>

      <Section title={`Hashtags (${hashtags.length})`}>
        <div className="flex flex-wrap gap-2">
          {hashtags.map((t) => (
            <span
              key={t}
              className="px-2 py-1 text-xs font-mono text-accent"
              style={{ background: "var(--panel-elevated)", border: "1px solid var(--border)" }}
            >
              #{t}
            </span>
          ))}
          {hashtags.length === 0 && (
            <p className="text-xs text-text-muted italic">None added.</p>
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
function ProvisioningStep({
  onDone,
  isAdmin,
  onRestart,
}: {
  onDone: () => void;
  isAdmin: boolean;
  onRestart: () => void;
}) {
  const fetchStatus = useServerFn(getUserIngestStatus);
  const processQueue = useServerFn(processUserIngestQueue);
  const { data, refetch } = useQuery({
    queryKey: ["onboarding-ingest-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 2000,
  });

  // Admin bootstrap nudge: render an extra "configure recommendations" CTA
  // when the recommendations matrices are empty.
  const { data: recsState } = useQuery({
    queryKey: ["wizard-admin-recs-empty"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ count: srcCount }, { count: congCount }] = await Promise.all([
        supabase
          .from("recommended_sources_by_specialty")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("recommended_congresses_by_specialty")
          .select("id", { count: "exact", head: true }),
      ]);
      return { empty: (srcCount ?? 0) === 0 || (congCount ?? 0) === 0 };
    },
  });

  const total = (data?.queued ?? 0) + (data?.processing ?? 0) + (data?.completed ?? 0) + (data?.failed ?? 0);
  const done = (data?.completed ?? 0) + (data?.failed ?? 0);
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;
  const nothingToDo = !!data && total === 0;

  React.useEffect(() => {
    if (allDone) {
      const t = setTimeout(() => onDone(), 1200);
      return () => clearTimeout(t);
    }
  }, [allDone, onDone]);

  React.useEffect(() => {
    if (!data || allDone || nothingToDo || (data.processing ?? 0) > 0 || (data.queued ?? 0) === 0) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      try {
        await processQueue({ data: { limit: 5 } });
        await refetch();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to provision sources");
      }
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [allDone, data, nothingToDo, processQueue, refetch]);

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

      {nothingToDo && (
        <div
          className="p-4"
          style={{
            background: "color-mix(in oklab, var(--accent) 8%, var(--panel))",
            border: "1px solid var(--accent)",
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-accent mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-text-primary">
                No sources to provision
              </h3>
              <p className="text-xs text-text-secondary">
                You haven't subscribed to any sources yet. Restart the wizard
                to pick some, or add them later from the Sources page.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={onRestart}>
              <ArrowLeft className="h-3 w-3 mr-1" /> Restart wizard
            </Button>
            <Link
              to="/sources"
              onClick={onDone}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase"
              style={{ background: "var(--accent)", color: "var(--accent-foreground, #000)" }}
            >
              Go to Sources <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {allDone && (
        <div className="text-center text-sm text-accent flex items-center justify-center gap-2">
          <Check className="h-4 w-4" /> All sources provisioned. Redirecting to your dashboard…
        </div>
      )}

      {!allDone && !nothingToDo && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={onDone}>
            Skip waiting — go to dashboard
          </Button>
        </div>
      )}

      {isAdmin && recsState?.empty && (
        <div
          className="p-4 mt-2"
          style={{
            background: "color-mix(in oklab, var(--accent) 8%, var(--panel))",
            border: "1px solid var(--accent)",
          }}
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">
            step {STEPS.length} / {STEPS.length} · admin bootstrap
          </div>
          <h3 className="mt-2 text-sm font-medium text-text-primary">
            Configure recommendations before regular users sign up.
          </h3>
          <p className="mt-1 text-xs text-text-secondary">
            Recommendation matrices are empty. New users won't see pre-checked
            congresses or sources until you populate them.
          </p>
          <Link
            to="/admin/recommendations"
            className="inline-flex items-center gap-1 mt-3 px-3 py-1.5 text-xs font-mono uppercase"
            style={{ background: "var(--accent)", color: "var(--accent-foreground, #000)" }}
          >
            Open Admin → Recommendations <ArrowRight className="h-3 w-3" />
          </Link>
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

// ---------------- Congresses ----------------
type CongressRow = {
  id: string;
  name: string;
  short_code: string;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  primary_hashtags: string[];
};

function CongressesStep({
  specialtyIds,
  selected,
  onChange,
}: {
  specialtyIds: string[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: recommended = [], isLoading } = useQuery({
    queryKey: ["wizard-recommended-congresses", specialtyIds.join(",")],
    enabled: specialtyIds.length > 0,
    queryFn: async () => {
      const { data: recRows } = await supabase
        .from("recommended_congresses_by_specialty")
        .select("congress_id, weight, note")
        .in("specialty_id", specialtyIds)
        .order("weight", { ascending: false });
      const rows = (recRows ?? []) as Array<{ congress_id: string; note: string | null }>;
      const ids = Array.from(new Set(rows.map((r) => r.congress_id)));
      if (ids.length === 0) return [] as Array<{ congress: CongressRow; note: string | null }>;
      const { data: congs } = await supabase
        .from("congresses")
        .select("id, name, short_code, start_date, end_date, city, primary_hashtags")
        .in("id", ids);
      const congMap = new Map(((congs ?? []) as CongressRow[]).map((c) => [c.id, c]));
      const seen = new Set<string>();
      const out: Array<{ congress: CongressRow; note: string | null }> = [];
      for (const row of rows) {
        if (seen.has(row.congress_id)) continue;
        const c = congMap.get(row.congress_id);
        if (!c) continue;
        seen.add(row.congress_id);
        out.push({ congress: c, note: row.note });
      }
      return out;
    },
  });

  const [showAddDialog, setShowAddDialog] = React.useState(false);

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Pick the congresses you follow</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Pre-checked based on your specialties. Uncheck anything irrelevant or add more.
        </p>
      </div>

      {isLoading && (
        <div className="text-sm text-text-muted flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading recommendations…
        </div>
      )}

      <div className="space-y-2">
        {recommended.map(({ congress, note }) => {
          const isSelected = selected.includes(congress.id);
          return (
            <button
              key={congress.id}
              type="button"
              onClick={() => toggle(congress.id)}
              className="w-full text-left p-3 transition-colors"
              style={{
                background: isSelected ? "var(--panel-elevated)" : "var(--panel)",
                border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  <div
                    className="w-4 h-4 flex items-center justify-center"
                    style={{
                      background: isSelected ? "var(--accent)" : "transparent",
                      border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    {isSelected && <Check className="w-3 h-3" style={{ color: "var(--bg)" }} />}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {congress.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase text-accent shrink-0">
                      {congress.short_code}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] font-mono text-text-secondary">
                    {congress.start_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {congress.start_date}
                        {congress.end_date && ` → ${congress.end_date}`}
                      </span>
                    )}
                    {congress.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {congress.city}
                      </span>
                    )}
                  </div>
                  {congress.primary_hashtags?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {congress.primary_hashtags.map((h) => (
                        <span
                          key={h}
                          className="font-mono text-[10px] px-1.5 py-px"
                          style={{
                            border: "1px solid var(--border)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {h.startsWith("#") ? h : `#${h}`}
                        </span>
                      ))}
                    </div>
                  )}
                  {note && (
                    <p className="mt-1.5 text-[11px] text-text-muted italic line-clamp-1">{note}</p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        {!isLoading && recommended.length === 0 && (
          <p className="text-xs text-text-muted italic">
            No recommendations for your specialties — add congresses manually below.
          </p>
        )}
      </div>

      <div>
        <Button variant="outline" size="sm" onClick={() => setShowAddDialog((v) => !v)}>
          + Add another congress
        </Button>
        {showAddDialog && (
          <CongressTypeahead
            excludeIds={selected.concat(recommended.map((r) => r.congress.id))}
            onAdd={(id) => onChange([...selected, id])}
          />
        )}
      </div>
    </div>
  );
}

function CongressTypeahead({
  excludeIds,
  onAdd,
}: {
  excludeIds: string[];
  onAdd: (id: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const qc = useQueryClient();
  const { data: results = [] } = useQuery({
    queryKey: ["wizard-congress-typeahead", query],
    enabled: query.trim().length >= 2,
    queryFn: async () => {
      const q = query.trim();
      const { data } = await supabase
        .from("congresses")
        .select("id, name, short_code, city")
        .or(`name.ilike.%${q}%,short_code.ilike.%${q}%`)
        .limit(10);
      return ((data ?? []) as Array<{ id: string; name: string; short_code: string; city: string | null }>)
        .filter((r) => !excludeIds.includes(r.id));
    },
  });
  const { data: suggest, isFetching } = useCongressSuggest(query);
  const aiMatches = (suggest?.matches ?? []).filter(
    (m) => !m.existing_id || !excludeIds.includes(m.existing_id),
  );

  const pickAi = async (m: CongressSuggestion) => {
    if (m.already_exists && m.existing_id) {
      onAdd(m.existing_id);
      setQuery("");
      return;
    }
    try {
      const created = await feedService.addCongress({
        name: m.name,
        shortCode: m.short_code.toUpperCase(),
        city: m.city,
        country: m.country,
        startDate: m.start_date,
        endDate: m.end_date,
        status: m.status,
        primaryHashtags: (m.primary_hashtags ?? []).map((t) => "#" + t.replace(/^#/, "")),
      });
      qc.invalidateQueries({ queryKey: ["congresses"] });
      onAdd(created.id);
      setQuery("");
    } catch {
      toast.error("Could not create congress");
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <Input
        autoFocus
        placeholder="Search congresses…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {isFetching && query.trim().length >= 3 && results.length === 0 && aiMatches.length === 0 && (
        <div className="text-[11px] font-mono text-cyan-400 flex items-center gap-2 px-1">
          <span className="inline-block h-3 w-3 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
          looking up congress …
        </div>
      )}
      {results.length > 0 && (
        <div className="border border-border divide-y divide-border">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onAdd(r.id);
                setQuery("");
              }}
              className="w-full px-3 py-2 text-left text-xs hover:bg-panel-elevated/60 flex items-center justify-between"
            >
              <span>
                <span className="text-text-primary">{r.name}</span>
                {r.city && <span className="text-text-muted ml-2">{r.city}</span>}
              </span>
              <span className="font-mono text-[10px] text-accent uppercase">{r.short_code}</span>
            </button>
          ))}
        </div>
      )}
      {aiMatches.length > 0 && (
        <div className="border border-border divide-y divide-border">
          {aiMatches.map((m, i) => {
            const conf =
              m.confidence === "high"
                ? "text-cyan-400"
                : m.confidence === "low"
                  ? "text-red-400"
                  : "text-amber-400";
            return (
              <button
                key={`ai-${m.short_code}-${i}`}
                type="button"
                onClick={() => pickAi(m)}
                className="w-full px-3 py-2 text-left text-xs hover:bg-panel-elevated/60 flex items-center justify-between gap-3"
              >
                <span className="flex-1 min-w-0">
                  <span className="text-text-primary flex items-center gap-1.5">
                    <Sparkles className={"h-3 w-3 " + conf} />
                    {m.name}
                    {m.already_exists && (
                      <span className="text-[10px] font-mono text-text-muted">· in database</span>
                    )}
                  </span>
                  <span className="text-text-muted text-[10px] font-mono block mt-0.5">
                    {m.start_date && m.end_date ? `${m.start_date} → ${m.end_date}` : "dates tbd"}
                    {m.city ? ` · ${m.city}` : ""}
                  </span>
                </span>
                <span className={"font-mono text-[10px] uppercase " + conf}>{m.short_code}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- Hashtags ----------------
const HASHTAG_TAG_RE = /^[A-Za-z0-9_]{1,100}$/;

function HashtagsStep({
  input,
  onInput,
  accepted,
  onAccepted,
}: {
  input: string;
  onInput: (v: string) => void;
  accepted: string[];
  onAccepted: (v: string[]) => void;
}) {
  const [errors, setErrors] = React.useState<string[]>([]);

  const commit = () => {
    if (!input.trim()) return;
    const tokens = input
      .split(/[\n,]+/)
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);
    const newErrors: string[] = [];
    const lcExisting = new Set(accepted.map((t) => t.toLowerCase()));
    const fresh: string[] = [];
    for (const t of tokens) {
      if (!HASHTAG_TAG_RE.test(t)) {
        newErrors.push(t);
        continue;
      }
      const lc = t.toLowerCase();
      if (lcExisting.has(lc)) continue;
      lcExisting.add(lc);
      fresh.push(t);
    }
    if (fresh.length > 0) onAccepted([...accepted, ...fresh]);
    setErrors(newErrors);
    onInput("");
  };

  const remove = (t: string) => onAccepted(accepted.filter((x) => x !== t));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">Track specific hashtags</h2>
        <p className="mt-1 text-sm text-text-secondary">
          <span className="font-mono text-[10px] uppercase mr-1.5 text-text-muted">Optional</span>
          Add hashtags beyond the ones tied to congresses you selected.
        </p>
      </div>

      <div className="space-y-2">
        <textarea
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onBlur={commit}
          rows={3}
          placeholder="UroSoMe, prostatecancer, endourology…"
          className="w-full p-3 text-sm font-mono"
          style={{
            background: "var(--panel-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={commit} disabled={!input.trim()}>
            Add tags
          </Button>
          <span className="text-[11px] text-text-muted">
            Comma- or newline-separated · letters, digits, underscore only
          </span>
        </div>
        {errors.length > 0 && (
          <p className="text-[11px] text-red-400">
            Skipped invalid: {errors.map((e) => `"${e}"`).join(", ")}
          </p>
        )}
      </div>

      {accepted.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {accepted.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono"
              style={{
                background: "var(--panel-elevated)",
                border: "1px solid var(--border)",
                color: "var(--accent)",
              }}
            >
              #{t}
              <button
                type="button"
                onClick={() => remove(t)}
                className="text-text-muted hover:text-text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}