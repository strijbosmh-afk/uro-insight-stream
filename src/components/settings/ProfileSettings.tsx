import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Star, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/shell/Panel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Specialty = { id: string; label: string; description: string; sort_order: number };
type UserSpec = { specialty_id: string; is_primary: boolean };

const MAX_SPECIALTIES = 3;

export function ProfileSettings() {
  const { user, profile, reload } = useAuth();
  const qc = useQueryClient();

  const [displayName, setDisplayName] = React.useState(profile?.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(profile?.avatar_url ?? "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
  }, [profile?.display_name, profile?.avatar_url]);

  const dirty =
    (profile?.display_name ?? "") !== displayName ||
    (profile?.avatar_url ?? "") !== avatarUrl;

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: displayName.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        })
        .eq("id", user.id);
      if (error) throw error;
      await reload();
      toast.success("Profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const { data: specialties = [], isLoading: loadingSpecs } = useQuery({
    queryKey: ["urology-specialties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("urology_specialties")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as Specialty[];
    },
  });

  const { data: mine = [], isLoading: loadingMine } = useQuery({
    queryKey: ["user-specialties", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_specialties")
        .select("specialty_id, is_primary")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data as UserSpec[];
    },
  });

  const selectedIds = React.useMemo(() => new Set(mine.map((m) => m.specialty_id)), [mine]);
  const primaryId = React.useMemo(
    () => mine.find((m) => m.is_primary)?.specialty_id ?? null,
    [mine],
  );

  const toggleSpecialty = async (id: string) => {
    if (!user) return;
    if (selectedIds.has(id)) {
      await supabase.from("user_specialties").delete().eq("user_id", user.id).eq("specialty_id", id);
    } else {
      if (selectedIds.size >= MAX_SPECIALTIES) {
        toast.error(`Pick up to ${MAX_SPECIALTIES} specialties`);
        return;
      }
      const isFirst = selectedIds.size === 0;
      await supabase
        .from("user_specialties")
        .insert({ user_id: user.id, specialty_id: id, is_primary: isFirst });
    }
    qc.invalidateQueries({ queryKey: ["user-specialties", user.id] });
  };

  const setPrimary = async (id: string) => {
    if (!user) return;
    await supabase
      .from("user_specialties")
      .update({ is_primary: false })
      .eq("user_id", user.id)
      .eq("is_primary", true);
    await supabase
      .from("user_specialties")
      .update({ is_primary: true })
      .eq("user_id", user.id)
      .eq("specialty_id", id);
    qc.invalidateQueries({ queryKey: ["user-specialties", user.id] });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-text-primary">Profile</h1>
        <p className="text-[13px] text-text-muted mt-1">
          Your name, avatar, and specialty focus.
        </p>
      </header>

      <section className="border border-border rounded-[3px] bg-panel p-4 space-y-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Identity
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[12px]">Email</Label>
            <Input value={profile?.email ?? ""} disabled />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">Display name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Dr. Jane Doe"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-[12px]">Avatar URL</Label>
            <Input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>
        <div>
          <Button onClick={saveProfile} disabled={!dirty || saving} size="sm">
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save profile
          </Button>
        </div>
      </section>

      <Panel title="Specialties">
        <p className="text-[12px] text-text-muted mb-4">
          Pick up to {MAX_SPECIALTIES}. The starred one is your primary focus and gets the highest weight in
          recommendations.
        </p>
        {loadingSpecs || loadingMine ? (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {specialties.map((s) => {
              const selected = selectedIds.has(s.id);
              const primary = primaryId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSpecialty(s.id)}
                  className={cn(
                    "relative text-left p-3 border rounded-[4px] transition-colors",
                    selected
                      ? "border-accent bg-accent/5"
                      : "border-border bg-panel hover:bg-panel-elevated/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-text-primary flex items-center gap-1.5">
                        {s.label}
                        {primary && (
                          <span className="text-[9px] font-mono uppercase tracking-wider text-accent border border-accent/40 px-1 py-px rounded-[2px]">
                            primary
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5 leading-snug">
                        {s.description}
                      </div>
                    </div>
                    {selected && (
                      <div className="flex flex-col items-end gap-1">
                        <Check className="w-3.5 h-3.5 text-accent shrink-0" />
                        {!primary && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              void setPrimary(s.id);
                            }}
                            className="text-[9px] font-mono uppercase tracking-wider text-text-muted hover:text-accent cursor-pointer"
                          >
                            <Star className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

export default ProfileSettings;
