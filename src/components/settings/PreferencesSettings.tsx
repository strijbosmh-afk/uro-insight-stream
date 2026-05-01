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

const DEFAULTS: UserPreferences = {
  default_congress_id: null,
  default_source_list_id: null,
  summary_tone: "clinical",
  summary_language: "English",
  theme_density: "comfortable",
  polling_interval_seconds: 30,
};

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
            <Label className="text-[12px]">Theme density</Label>
            <Select
              value={draft.theme_density}
              onValueChange={(v) =>
                update("theme_density", v as UserPreferences["theme_density"])
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
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