import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Play,
  CheckCircle2,
  AlertCircle,
  Activity,
  Gauge,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  getIngestionStatus,
  triggerIngestion,
  updateIngestionConfig,
} from "@/serverFns/ingestion";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";

const ADAPTERS = [
  { value: "x_api_v2", label: "X API v2 (Bearer token)" },
  { value: "mock", label: "Mock (no upstream)" },
  { value: "socialdata", label: "socialdata.tools (stub)" },
  { value: "twitterapi_io", label: "twitterapi.io (stub)" },
];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    error: "bg-red-500/15 text-red-400 border-red-500/30",
    rate_limited: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    running: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

export function IngestionSettings() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getIngestionStatus);
  const updateCfg = useServerFn(updateIngestionConfig);
  const trigger = useServerFn(triggerIngestion);

  const { data, isLoading } = useQuery({
    queryKey: ["ingestion-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 15_000,
  });

  const [manualType, setManualType] = React.useState<"handle" | "hashtag">("handle");
  const [manualTarget, setManualTarget] = React.useState("");

  type CfgPatch = {
    adapter?: "x_api_v2" | "mock" | "socialdata" | "twitterapi_io";
    enabled?: boolean;
    poll_interval_minutes?: number;
    rate_limit_per_15min?: number;
    default_lookback_minutes?: number;
  };
  const cfgMutation = useMutation({
    mutationFn: (patch: CfgPatch) => updateCfg({ data: patch }),
    onSuccess: () => {
      toast.success("Config saved");
      qc.invalidateQueries({ queryKey: ["ingestion-status"] });
    },
    onError: (e) => toast.error("Save failed", { description: (e as Error).message }),
  });

  const triggerMutation = useMutation({
    mutationFn: (vars: { targetType: "handle" | "hashtag"; target: string }) =>
      trigger({ data: vars }),
    onSuccess: (res) => {
      if (res.status === "success") {
        toast.success(`Synced ${res.target}`, {
          description: `${res.fetched} fetched · ${res.inserted} new`,
        });
      } else {
        toast.error(`Sync ${res.status}: ${res.target}`, {
          description: res.error ?? "",
        });
      }
      qc.invalidateQueries({ queryKey: ["ingestion-status"] });
    },
    onError: (e) => toast.error("Trigger failed", { description: (e as Error).message }),
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading ingestion status…
      </div>
    );
  }

  const cfg = data.config;
  const rateUsage = data.recentRunCount;
  const ratePct = Math.min(100, (rateUsage / cfg.rate_limit_per_15min) * 100);

  return (
    <div className="space-y-8">
      {/* Adapter & status panel */}
      <section className="border border-border bg-panel p-4 relative">
        <div className="absolute top-0 left-0 h-0.5 w-12 bg-cyan-400" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <h3 className="font-mono text-sm uppercase tracking-wide">
              Adapter · {cfg.adapter}
            </h3>
            <Badge variant={cfg.enabled ? "default" : "secondary"}>
              {cfg.enabled ? "enabled" : "disabled"}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground">
            <span className="flex items-center gap-1">
              <Gauge className="h-3.5 w-3.5" />
              runs: {rateUsage}/{cfg.rate_limit_per_15min} · 15min
            </span>
            <span>
              lookup rate: {data.lookup?.count ?? 0} / {data.lookup?.limit ?? 200} / 15min
            </span>
            <span>
              queue depth: {data.queue?.pending ?? 0} pending · {data.queue?.processing ?? 0} processing · last drain:{" "}
              {data.queue?.lastDrainAt
                ? formatDistanceToNow(new Date(data.queue.lastDrainAt), { addSuffix: true })
                : "—"}
            </span>
          </div>
        </div>

        <div className="h-1 bg-muted overflow-hidden mb-4">
          <div
            className={`h-full ${ratePct > 80 ? "bg-amber-400" : "bg-cyan-400"}`}
            style={{ width: `${ratePct}%` }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Adapter</Label>
            <Select
              value={cfg.adapter}
              disabled={!isAdmin}
              onValueChange={(v) => cfgMutation.mutate({ adapter: v as never })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADAPTERS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={cfg.enabled}
                disabled={!isAdmin}
                onCheckedChange={(v) => cfgMutation.mutate({ enabled: v })}
              />
              <Label>Ingestion enabled</Label>
            </div>
          </div>
          <div>
            <Label>Lookback (minutes)</Label>
            <Input
              type="number"
              defaultValue={cfg.default_lookback_minutes}
              disabled={!isAdmin}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v && v !== cfg.default_lookback_minutes) {
                  cfgMutation.mutate({ default_lookback_minutes: v });
                }
              }}
            />
          </div>
          <div>
            <Label>Rate limit / 15min</Label>
            <Input
              type="number"
              defaultValue={cfg.rate_limit_per_15min}
              disabled={!isAdmin}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v && v !== cfg.rate_limit_per_15min) {
                  cfgMutation.mutate({ rate_limit_per_15min: v });
                }
              }}
            />
          </div>
        </div>
      </section>

      {/* Top lookup users */}
      {(data.topLookupUsers ?? []).length > 0 && (
        <section className="border border-border bg-panel p-4 relative">
          <div className="absolute top-0 left-0 h-0.5 w-12 bg-cyan-400" />
          <h3 className="font-mono text-sm uppercase tracking-wide mb-3">
            Top lookup users · last hour
          </h3>
          <div className="space-y-1 font-mono text-xs">
            {data.topLookupUsers!.map((u) => (
              <div key={u.user_id} className="flex items-center justify-between">
                <span className="text-text-primary">@{u.handle}</span>
                <span className="text-accent">{u.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Manual sync */}
      <section className="border border-border bg-panel p-4 relative">
        <div className="absolute top-0 left-0 h-0.5 w-12 bg-cyan-400" />
        <h3 className="font-mono text-sm uppercase tracking-wide mb-4">
          Manual sync
        </h3>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <Label>Type</Label>
            <Select value={manualType} onValueChange={(v) => setManualType(v as "handle" | "hashtag")}>
              <SelectTrigger className="w-32 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="handle">handle</SelectItem>
                <SelectItem value="hashtag">hashtag</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label>{manualType === "handle" ? "@handle" : "#tag"}</Label>
            <Input
              placeholder={manualType === "handle" ? "drhwang" : "EAU24"}
              value={manualTarget}
              onChange={(e) => setManualTarget(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button
            disabled={!manualTarget.trim() || triggerMutation.isPending}
            onClick={() =>
              triggerMutation.mutate({
                targetType: manualType,
                target: manualTarget.trim(),
              })
            }
          >
            {triggerMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Sync now
          </Button>
        </div>
      </section>

      {/* Run log */}
      <section className="border border-border bg-panel p-4 relative">
        <div className="absolute top-0 left-0 h-0.5 w-12 bg-cyan-400" />
        <h3 className="font-mono text-sm uppercase tracking-wide mb-4">
          Recent runs
        </h3>
        {data.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <div className="space-y-1 font-mono text-xs">
            {data.runs.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_60px_1fr_80px_80px_120px] gap-3 items-center py-1 border-b border-border/40"
              >
                <span className="truncate">
                  {r.target_type === "hashtag" ? "#" : "@"}
                  {r.target}
                </span>
                <Badge variant="outline" className={statusBadge(r.status)}>
                  {r.status === "success" ? (
                    <CheckCircle2 className="h-3 w-3 mr-0.5" />
                  ) : r.status === "running" ? (
                    <Loader2 className="h-3 w-3 mr-0.5 animate-spin" />
                  ) : (
                    <AlertCircle className="h-3 w-3 mr-0.5" />
                  )}
                  {r.status}
                </Badge>
                <span className="truncate text-muted-foreground">
                  {r.error_message ?? `${r.tweets_inserted}/${r.tweets_fetched} new`}
                </span>
                <span className="text-right">{r.tweets_fetched}</span>
                <span className="text-right">{r.tweets_inserted}</span>
                <span className="text-right text-muted-foreground">
                  {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tweet → session matcher */}
      <section className="border border-border bg-panel p-4 relative">
        <div className="absolute top-0 left-0 h-0.5 w-12 bg-cyan-400" />
        <h3 className="font-mono text-sm uppercase tracking-wide mb-3">
          Tweet matcher
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
          <div>
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">unmatched</div>
            <div className="text-base">{data.matcher?.unmatched ?? 0}</div>
          </div>
          <div>
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">matched · 24h</div>
            <div className="text-base">{data.matcher?.matchedLast24h ?? 0}</div>
          </div>
          <div>
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">llm calls · 24h</div>
            <div className="text-base">{data.matcher?.llmCallsLast24h ?? 0}</div>
          </div>
          <div>
            <div className="text-muted-foreground uppercase tracking-wider text-[10px]">llm tokens · 24h</div>
            <div className="text-base">{data.matcher?.llmTokensLast24h ?? 0}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
