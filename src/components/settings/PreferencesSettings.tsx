import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type UserPreferences } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { feedService } from "@/services/feedService";
import { AI_TONES, AI_LANGUAGES } from "@/hooks/useAiSettings";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DEFAULTS: UserPreferences = {
  default_congress_id: null,
  default_source_list_id: null,
  summary_tone: "clinical",
  summary_language: "English",
  theme_density: "comfortable",
  polling_interval_seconds: 30,
};

type Density = UserPreferences["theme_density"];
const DENSITY_OPTIONS: ReadonlyArray<{
  value: Density;
  label: string;
  caption: string;
  isDefault?: boolean;
  // mini preview tweet body sizing
  tweet: number;
  lineHeight: number;
}> = [
  {
    value: "compact",
    label: "Compact",
    caption: "Tightest layout. Maximum information density.",
    tweet: 13,
    lineHeight: 1.45,
  },
  {
    value: "comfortable",
    label: "Comfortable",
    caption: "Recommended for most monitors.",
    isDefault: true,
    tweet: 15,
    lineHeight: 1.55,
  },
  {
    value: "spacious",
    label: "Spacious",
    caption: "Larger text and more breathing room. Best for large displays at 100% scaling.",
    tweet: 16,
    lineHeight: 1.65,
  },
];

export function PreferencesSettings() {
  const { user, prefs, reload } = useAuth();
  const [draft, setDraft] = React.useState<UserPreferences>(prefs ?? DEFAULTS);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (prefs) setDraft(prefs);
  }, [prefs]);

  const { data: congresses = [] } = useQuery({
    queryKey: ["congresses"],
    queryFn: () => feedService.listCongresses(),
  });
  const { data: sourceLists = [] } = useQuery({
    queryKey: ["source-lists"],
    queryFn: () => feedService.listSourceLists(),
  });

  const update = <K extends keyof UserPreferences>(k: K, v: UserPreferences[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const persistDensity = async (next: Density) => {
    update("theme_density", next);
    // Apply class instantly (don't wait for round trip).
    if (typeof document !== "undefined") {
      document.body.classList.remove(
        "density-compact",
        "density-comfortable",
        "density-spacious",
      );
      document.body.classList.add(`density-${next}`);
    }
    if (!user) return;
    const { error } = await supabase
      .from("user_preferences")
      .upsert(
        [{ user_id: user.id, ...draft, theme_density: next }],
        { onConflict: "user_id" },
      );
    if (error) {
      toast.error("Could not save density");
    } else {
      void reload();
    }
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_preferences")
        .upsert([{ user_id: user.id, ...draft }], { onConflict: "user_id" });
      if (error) throw error;
      await reload();
      toast.success("Preferences saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(prefs ?? DEFAULTS);

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">
          Preferences
        </h1>
        <p className="text-[13px] text-text-muted mt-1">
          Personal defaults applied across the app.
        </p>
      </header>

      <section className="border border-border rounded-[3px] bg-panel p-4 space-y-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Defaults
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[12px]">Default congress</Label>
            <Select
              value={draft.default_congress_id ?? "__none__"}
              onValueChange={(v) =>
                update("default_congress_id", v === "__none__" ? null : v)
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {congresses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Default source list</Label>
            <Select
              value={draft.default_source_list_id ?? "__none__"}
              onValueChange={(v) =>
                update("default_source_list_id", v === "__none__" ? null : v)
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {sourceLists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Summary tone</Label>
            <Select
              value={draft.summary_tone}
              onValueChange={(v) => update("summary_tone", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Summary language</Label>
            <Select
              value={draft.summary_language}
              onValueChange={(v) => update("summary_language", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Polling interval (seconds)</Label>
            <Input
              type="number"
              min={5}
              max={600}
              value={draft.polling_interval_seconds}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                update("polling_interval_seconds", Math.min(600, Math.max(5, Math.round(n))));
              }}
            />
          </div>
        </div>
      </section>

      <section className="border border-border rounded-[3px] bg-panel p-4 space-y-3">
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            Display density
          </h2>
          <p className="text-[12px] text-text-muted mt-1">
            Scales tweet, summary, and title text. Chrome (sidebar, status bar,
            panel headers) stays unchanged. Saved instantly.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {DENSITY_OPTIONS.map((opt) => {
            const selected = draft.theme_density === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => void persistDensity(opt.value)}
                className={cn(
                  "w-[160px] text-left p-2.5 rounded-[3px] border transition-colors",
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-accent/40 bg-panel-elevated/30",
                )}
              >
                {/* Mini preview */}
                <div className="border border-border/60 rounded-[2px] p-1.5 bg-panel mb-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="bg-text-muted/30 rounded-[1px]"
                      style={{
                        height: `${Math.max(4, opt.tweet - 9)}px`,
                        marginTop: i === 0 ? 0 : `${(opt.lineHeight - 1) * 6}px`,
                        width: i === 2 ? "60%" : "100%",
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-text-primary">
                    {opt.label}
                  </span>
                  {opt.isDefault && (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted">
                      default
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-muted mt-1 leading-snug">
                  {opt.caption}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex gap-2">
        <Button onClick={save} disabled={!dirty || saving}>
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
          ) : (
            <Save className="w-3.5 h-3.5 mr-1.5" />
          )}
          Save
        </Button>
        <Button
          variant="ghost"
          disabled={!dirty}
          onClick={() => setDraft(prefs ?? DEFAULTS)}
        >
          Discard
        </Button>
      </div>
    </div>
  );
}

export default PreferencesSettings;