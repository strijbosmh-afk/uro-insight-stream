import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type UserPreferences } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { SwitchRow } from "./SwitchRow";
import { MobileSaveBar } from "./MobileSaveBar";

const BRAINSTORM_DISABLE_KEY = "brainstorm:disableUnreadDialog";

const FREQUENCIES: Array<{ value: UserPreferences["digest_default_frequency"]; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly (~30 days)" },
];

function listTimezones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof fn === "function") return fn("timeZone");
  } catch { /* noop */ }
  return [
    "UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
    "Europe/Amsterdam", "Europe/Stockholm", "America/New_York", "America/Chicago",
    "America/Denver", "America/Los_Angeles", "America/Toronto", "Asia/Tokyo",
    "Asia/Singapore", "Asia/Dubai", "Australia/Sydney",
  ];
}

export function NotificationsSettings() {
  const { user, prefs, reload } = useAuth();
  const [draft, setDraft] = React.useState<UserPreferences | null>(prefs);
  const [saving, setSaving] = React.useState(false);
  const [brainstormPopup, setBrainstormPopup] = React.useState(true);
  const tzs = React.useMemo(listTimezones, []);

  React.useEffect(() => { if (prefs) setDraft(prefs); }, [prefs]);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setBrainstormPopup(localStorage.getItem(BRAINSTORM_DISABLE_KEY) !== "1");
  }, []);

  const toggleBrainstormPopup = (enabled: boolean) => {
    setBrainstormPopup(enabled);
    if (typeof window === "undefined") return;
    if (enabled) localStorage.removeItem(BRAINSTORM_DISABLE_KEY);
    else localStorage.setItem(BRAINSTORM_DISABLE_KEY, "1");
    toast.success(enabled ? "Brainstorm popup enabled" : "Brainstorm popup disabled");
  };

  if (!draft) {
    return <div className="p-4 text-sm text-text-muted flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
  }

  const update = <K extends keyof UserPreferences>(k: K, v: UserPreferences[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const dirty = JSON.stringify(draft) !== JSON.stringify(prefs);

  const save = async () => {
    if (!user || !draft) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_preferences")
        .upsert([{ user_id: user.id, ...draft }], { onConflict: "user_id" });
      if (error) throw error;
      await reload();
      toast.success("Notifications saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">Notifications</h1>
        <p className="text-[13px] text-text-muted mt-1">
          How and when UroFeed reaches you. Manage individual digest schedules and recipients on the Digests page.
        </p>
      </header>

      <section className="border border-border rounded-[3px] bg-panel p-4 space-y-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-text-muted">Email digests</h2>

        <SwitchRow
          label="Send email digests"
          description="Master switch. When off, no digest emails are sent regardless of individual schedules."
          checked={draft.digests_master_enabled}
          onCheckedChange={(v) => update("digests_master_enabled", v)}
        />
        <SwitchRow
          label="New digests start active"
          description="When you create a new digest, mark it active by default."
          checked={draft.digests_active_by_default}
          onCheckedChange={(v) => update("digests_active_by_default", v)}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="space-y-1.5">
            <Label className="text-[12px]">Default frequency</Label>
            <Select
              value={draft.digest_default_frequency}
              onValueChange={(v) => update("digest_default_frequency", v as UserPreferences["digest_default_frequency"])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Default send hour</Label>
            <Select
              value={String(draft.digest_default_send_hour)}
              onValueChange={(v) => update("digest_default_send_hour", Number(v))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, h) => (
                  <SelectItem key={h} value={String(h)}>
                    {String(h).padStart(2, "0")}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Default timezone</Label>
            <Select
              value={draft.digest_default_timezone}
              onValueChange={(v) => update("digest_default_timezone", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {tzs.map((tz) => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="border border-border rounded-[3px] bg-panel p-4 space-y-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-text-muted">Email events</h2>

        <SwitchRow
          label="New AI summary ready"
          description="Email me when a new summary is generated for sources I follow."
          checked={draft.notify_new_summary}
          onCheckedChange={(v) => update("notify_new_summary", v)}
        />
        <SwitchRow
          label="New post from a followed source"
          description="Real-time email when a source you follow posts (high volume — off by default)."
          checked={draft.notify_new_tweet_followed_source}
          onCheckedChange={(v) => update("notify_new_tweet_followed_source", v)}
        />
        <SwitchRow
          label="Weekly recap"
          description="A short Monday-morning round-up of last week's highlights."
          checked={draft.notify_weekly_recap}
          onCheckedChange={(v) => update("notify_weekly_recap", v)}
        />
      </section>

      <section className="border border-border rounded-[3px] bg-panel p-4 space-y-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-text-muted">In-app</h2>
        <SwitchRow
          label="Brainstorm unread popup"
          description="Show a popup on login when there are unread Brainstorm messages."
          checked={brainstormPopup}
          onCheckedChange={toggleBrainstormPopup}
        />
      </section>

      <div className="hidden md:flex gap-2">
        <Button onClick={save} disabled={!dirty || saving} size="sm">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
          Save
        </Button>
        <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => prefs && setDraft(prefs)}>
          Discard
        </Button>
      </div>
      <MobileSaveBar
        visible={dirty}
        saving={saving}
        onSave={save}
        onCancel={() => prefs && setDraft(prefs)}
      />
    </div>
  );
}

export default NotificationsSettings;
