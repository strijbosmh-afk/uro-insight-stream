import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import {
  createWatchlist,
  updateWatchlist,
  setWatchlistTopics,
  listWatchlists,
  getMyWatchlistForTarget,
} from "@/serverFns/watchlists";
import { listGroups } from "@/serverFns/groups";

type TargetKind = "source" | "group";

export interface WatchlistFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, dialog opens in edit mode and loads existing watchlist by id. */
  watchlistId?: string;
  /** Pre-fill (and lock-kind for the typical flow) when launched from a Spotlight/group page. */
  initialTarget?: { kind: TargetKind; id: string; label?: string };
  onSaved?: () => void;
}

const COMMON_TZ = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function WatchlistFormDialog({
  open,
  onOpenChange,
  watchlistId,
  initialTarget,
  onSaved,
}: WatchlistFormDialogProps) {
  const qc = useQueryClient();
  const createFn = useServerFn(createWatchlist);
  const updateFn = useServerFn(updateWatchlist);
  const setTopicsFn = useServerFn(setWatchlistTopics);
  const listFn = useServerFn(listWatchlists);
  const listGroupsFn = useServerFn(listGroups);

  const isEdit = Boolean(watchlistId);

  // Form state.
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<TargetKind>(initialTarget?.kind ?? "source");
  const [sourceId, setSourceId] = React.useState<string>(
    initialTarget?.kind === "source" ? initialTarget.id : "",
  );
  const [sourceLabel, setSourceLabel] = React.useState<string>(
    initialTarget?.kind === "source" ? (initialTarget.label ?? `@${initialTarget.id}`) : "",
  );
  const [groupId, setGroupId] = React.useState<string>(
    initialTarget?.kind === "group" ? initialTarget.id : "",
  );
  const [topics, setTopics] = React.useState<string[]>([]);
  const [topicInput, setTopicInput] = React.useState("");
  const [emailEnabled, setEmailEnabled] = React.useState(false);
  const [quietStart, setQuietStart] = React.useState(22);
  const [quietEnd, setQuietEnd] = React.useState(8);
  const [maxPerDay, setMaxPerDay] = React.useState(10);
  const [timezone, setTimezone] = React.useState<string>(browserTimezone());
  const [isActive, setIsActive] = React.useState(true);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Load existing watchlist when editing.
  const editLoad = useQuery({
    queryKey: ["watchlist-edit", watchlistId],
    queryFn: async () => {
      const all = await listFn();
      const wl = all.find((w) => w.id === watchlistId);
      if (!wl) throw new Error("watchlist not found");
      return wl;
    },
    enabled: open && Boolean(watchlistId),
  });

  // Hydrate form when edit data arrives.
  React.useEffect(() => {
    if (!editLoad.data) return;
    const wl = editLoad.data;
    setName(wl.name);
    setKind(wl.target_kind as TargetKind);
    setSourceId((wl.target_source_id as string) ?? "");
    setSourceLabel(wl.target_source_id ? `@${wl.target_source_id}` : "");
    setGroupId((wl.target_group_id as string) ?? "");
    setTopics(wl.topics ?? []);
    setEmailEnabled(Boolean(wl.email_enabled));
    setQuietStart((wl.quiet_hours_start as number) ?? 22);
    setQuietEnd((wl.quiet_hours_end as number) ?? 8);
    setMaxPerDay((wl.max_emails_per_day as number) ?? 10);
    setTimezone(((wl as { timezone?: string }).timezone as string) || browserTimezone());
    setIsActive(Boolean(wl.is_active));
  }, [editLoad.data]);

  // Reset form when opening fresh (create mode) or when initialTarget changes.
  React.useEffect(() => {
    if (!open || isEdit) return;
    setName("");
    setKind(initialTarget?.kind ?? "source");
    setSourceId(initialTarget?.kind === "source" ? initialTarget.id : "");
    setSourceLabel(initialTarget?.kind === "source" ? (initialTarget.label ?? `@${initialTarget.id}`) : "");
    setGroupId(initialTarget?.kind === "group" ? initialTarget.id : "");
    setTopics([]);
    setTopicInput("");
    setEmailEnabled(false);
    setQuietStart(22);
    setQuietEnd(8);
    setMaxPerDay(10);
    setTimezone(browserTimezone());
    setIsActive(true);
    setErrors({});
  }, [open, isEdit, initialTarget?.kind, initialTarget?.id, initialTarget?.label]);

  // Auto-suggest a name once a target is picked.
  React.useEffect(() => {
    if (name) return;
    if (kind === "source" && sourceLabel) {
      setName(`${sourceLabel.replace(/^@/, "")} — alerts`);
    }
  }, [name, kind, sourceLabel]);

  const addTopic = (raw: string) => {
    const cleaned = raw.trim().replace(/^#/, "").toLowerCase();
    if (cleaned.length < 2) return;
    if (cleaned.length > 80) return;
    if (topics.length >= 20) {
      setErrors((p) => ({ ...p, topics: "Max 20 topics" }));
      return;
    }
    if (topics.includes(cleaned)) return;
    setTopics([...topics, cleaned]);
    setTopicInput("");
    setErrors((p) => {
      const { topics: _t, ...rest } = p;
      return rest;
    });
  };

  const onTopicKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTopic(topicInput);
    } else if (e.key === "Backspace" && !topicInput && topics.length > 0) {
      setTopics(topics.slice(0, -1));
    }
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Required";
    if (kind === "source" && !sourceId) next.target = "Pick a source";
    if (kind === "group" && !groupId) next.target = "Pick a group";
    if (topics.length === 0) next.topics = "Add at least one topic";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (isEdit && watchlistId) {
        await updateFn({
          data: {
            id: watchlistId,
            name: name.trim(),
            email_enabled: emailEnabled,
            quiet_hours_start: quietStart,
            quiet_hours_end: quietEnd,
            max_emails_per_day: maxPerDay,
            is_active: isActive,
            timezone: timezone || null,
          },
        });
        await setTopicsFn({ data: { watchlist_id: watchlistId, topics } });
        return { id: watchlistId };
      }
      const target =
        kind === "source"
          ? { target_kind: "source" as const, target_source_id: sourceId }
          : { target_kind: "group" as const, target_group_id: groupId };
      const created = await createFn({
        data: {
          name: name.trim(),
          email_enabled: emailEnabled,
          quiet_hours_start: quietStart,
          quiet_hours_end: quietEnd,
          max_emails_per_day: maxPerDay,
          timezone: timezone || null,
          topics,
          ...target,
        },
      });
      return created;
    },
    onSuccess: () => {
      toast.success(isEdit ? "Watchlist updated" : "Watchlist created", {
        action: {
          label: "View alerts",
          onClick: () => {
            window.location.href = "/alerts";
          },
        },
      });
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      qc.invalidateQueries({ queryKey: ["watchlist-for-target"] });
      qc.invalidateQueries({ queryKey: ["watchlist-unread"] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg);
      setErrors((p) => ({ ...p, _form: msg }));
    },
  });

  const onSubmit = () => {
    if (!validate()) return;
    saveMut.mutate();
  };

  // Group list for the group picker.
  const groupsQ = useQuery({
    queryKey: ["watchlist-form-groups"],
    queryFn: () =>
      listGroupsFn({
        data: { sort: "popular", limit: 100 },
      }),
    enabled: open && kind === "group",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-panel border-border text-text-primary max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[12px] uppercase tracking-[0.12em]">
            {isEdit ? "Edit watchlist" : "Create watchlist"}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-text-muted">
            Watch a source or group for tweets matching your topics.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Watching */}
          <div className="grid gap-2">
            <Label className="text-[10px] uppercase tracking-wider text-text-muted">
              Watching
            </Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={kind === "source" ? "default" : "outline"}
                onClick={() => setKind("source")}
                disabled={isEdit}
              >
                Source
              </Button>
              <Button
                type="button"
                size="sm"
                variant={kind === "group" ? "default" : "outline"}
                onClick={() => setKind("group")}
                disabled={isEdit}
              >
                Group
              </Button>
            </div>
            {kind === "source" ? (
              <SourcePicker
                value={sourceId}
                label={sourceLabel}
                onChange={(id, label) => {
                  setSourceId(id);
                  setSourceLabel(label);
                }}
                disabled={isEdit}
              />
            ) : (
              <Select value={groupId} onValueChange={setGroupId} disabled={isEdit}>
                <SelectTrigger>
                  <SelectValue placeholder={groupsQ.isLoading ? "Loading…" : "Select a group"} />
                </SelectTrigger>
                <SelectContent>
                  {(groupsQ.data ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}{" "}
                      <span className="ml-1 text-text-muted">({g.member_count})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.target && (
              <span className="text-[11px] text-destructive">{errors.target}</span>
            )}
          </div>

          {/* Name */}
          <div className="grid gap-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-text-muted">
              Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Smith — PARP alerts"
              maxLength={80}
            />
            {errors.name && (
              <span className="text-[11px] text-destructive">{errors.name}</span>
            )}
          </div>

          {/* Topics */}
          <div className="grid gap-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-text-muted">
              Topics
            </Label>
            <div className="rounded-[3px] border border-border bg-panel-elevated px-2 py-1.5 flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <Badge
                  key={t}
                  variant="outline"
                  className="gap-1 text-[11px] font-mono"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTopics(topics.filter((x) => x !== t))}
                    className="text-text-muted hover:text-destructive"
                    aria-label={`Remove ${t}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              <input
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={onTopicKey}
                onBlur={() => topicInput && addTopic(topicInput)}
                placeholder={topics.length ? "" : "Type a keyword and press Enter"}
                className="flex-1 min-w-[120px] bg-transparent text-[12px] outline-none text-text-primary placeholder:text-text-muted"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-text-muted">
              <span>{topics.length}/20 topics</span>
              {errors.topics && <span className="text-destructive">{errors.topics}</span>}
            </div>
          </div>

          {/* Email alerts */}
          <div className="rounded-[3px] border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-[12px] text-text-primary">Email alerts</Label>
                <p className="text-[11px] text-text-muted">
                  Get bursts of matches in a single bundled email.
                </p>
              </div>
              <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
            </div>
            {emailEnabled && (
              <div className="grid gap-3 pt-1 border-t border-border">
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <div className="grid gap-1">
                    <Label className="text-[10px] uppercase tracking-wider text-text-muted">
                      Quiet from
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={quietStart}
                      onChange={(e) =>
                        setQuietStart(Math.max(0, Math.min(23, Number(e.target.value) || 0)))
                      }
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-[10px] uppercase tracking-wider text-text-muted">
                      Quiet to
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={quietEnd}
                      onChange={(e) =>
                        setQuietEnd(Math.max(0, Math.min(23, Number(e.target.value) || 0)))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-wider text-text-muted">
                    Timezone
                  </Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set([browserTimezone(), ...COMMON_TZ])).map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-[10px] uppercase tracking-wider text-text-muted">
                    Max emails per day
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={maxPerDay}
                    onChange={(e) =>
                      setMaxPerDay(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                    }
                  />
                </div>
                <p className="text-[11px] text-text-muted">
                  We bundle bursts within 5 minutes into a single email.
                </p>
              </div>
            )}
          </div>

          {/* Active */}
          <div className="flex items-center justify-between rounded-[3px] border border-border p-3">
            <div>
              <Label className="text-[12px] text-text-primary">Active</Label>
              <p className="text-[11px] text-text-muted">
                Inactive watchlists never deliver. History is preserved.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {errors._form && (
            <p className="text-[11px] text-destructive">{errors._form}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={saveMut.isPending}>
            {saveMut.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Lightweight source picker: search by handle/display name against the
 * `sources` table (RLS allows authenticated read).
 */
function SourcePicker({
  value,
  label,
  onChange,
  disabled,
}: {
  value: string;
  label: string;
  onChange: (id: string, label: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const search = useQuery({
    queryKey: ["watchlist-source-search", query],
    queryFn: async () => {
      const term = query.trim().replace(/^@/, "");
      let q = supabase
        .from("sources")
        .select("id, handle, display_name, avatar_url, verified")
        .limit(20);
      if (term) q = q.or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`);
      else q = q.order("tweet_count", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="justify-start font-mono text-[12px]"
          disabled={disabled}
        >
          {value ? (
            <span className="truncate">{label || `@${value}`}</span>
          ) : (
            <span className="text-text-muted">Pick a source…</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by handle or name"
              className="pl-7 h-8 font-mono text-[12px]"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {search.isLoading ? (
            <div className="p-3 text-[12px] text-text-muted flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
            </div>
          ) : (search.data ?? []).length === 0 ? (
            <div className="p-3 text-[12px] text-text-muted">No matches.</div>
          ) : (
            (search.data ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onChange(
                    s.id as string,
                    `@${s.handle as string}${s.display_name ? ` · ${s.display_name as string}` : ""}`,
                  );
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-panel-elevated text-left"
              >
                {s.avatar_url ? (
                  <img src={s.avatar_url as string} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-panel-elevated border border-border" />
                )}
                <div className="min-w-0">
                  <div className="text-[12px] text-text-primary truncate">
                    {(s.display_name as string) || (s.handle as string)}
                  </div>
                  <div className="text-[11px] font-mono text-text-muted truncate">
                    @{s.handle as string}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Convenience wrapper: a button that flips between "Set up alerts" and
 * "Edit alerts" depending on whether the current user already has a
 * watchlist for the given target.
 */
export function SetUpAlertsButton({
  target,
  className,
  size = "sm",
  variant = "ghost",
}: {
  target: { kind: TargetKind; id: string; label?: string };
  className?: string;
  size?: "sm" | "default" | "lg";
  variant?: "ghost" | "outline" | "default";
}) {
  const [open, setOpen] = React.useState(false);
  const lookupFn = useServerFn(getMyWatchlistForTarget);
  const existing = useQuery({
    queryKey: ["watchlist-for-target", target.kind, target.id],
    queryFn: () => lookupFn({ data: { kind: target.kind, id: target.id } }),
  });
  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
        disabled={existing.isLoading}
      >
        {existing.data ? "Edit alerts" : "Set up alerts"}
      </Button>
      <WatchlistFormDialog
        open={open}
        onOpenChange={setOpen}
        watchlistId={existing.data?.id as string | undefined}
        initialTarget={target}
      />
    </>
  );
}