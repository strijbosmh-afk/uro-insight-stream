import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getScoredFollows,
  bulkSubscribeFromFollows,
} from "@/serverFns/x-follows";

type Item = {
  x_user_id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  verified: boolean;
  followers_count: number | null;
  score: number;
  matched_signals: Array<{ value: string; weight: number; area_slug: string }>;
  suggested_area_slugs: string[];
};

export function ImportFollowsPanel({
  onDone,
  onSkip,
  mode = "full",
}: {
  onDone?: (counts: { subscribed: number }) => void;
  onSkip?: () => void;
  mode?: "full" | "diff";
}) {
  const qc = useQueryClient();
  const [started, setStarted] = React.useState(mode === "diff");
  const [initialScope, setInitialScope] = React.useState<"suggested" | "all">(
    "suggested",
  );
  const [filter, setFilter] = React.useState("");
  const [showOther, setShowOther] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const fetchFn = useServerFn(getScoredFollows);
  const subscribeFn = useServerFn(bulkSubscribeFromFollows);

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["x-scored-follows", mode],
    enabled: started,
    queryFn: () => fetchFn({ data: { refresh: false, mode } }),
    staleTime: 5 * 60_000,
  });

  // Pre-select suggested when first loaded.
  React.useEffect(() => {
    if (!data || !("ok" in data) || !data.ok) return;
    const subbed = new Set(data.already_subscribed);
    setSelected((prev) => {
      if (prev.size > 0) return prev;
      const next = new Set<string>();
      for (const it of data.suggested) {
        const h = it.handle.toLowerCase();
        if (!subbed.has(h)) next.add(h);
      }
      if (initialScope === "all") {
        for (const it of data.other) {
          const h = it.handle.toLowerCase();
          if (!subbed.has(h)) next.add(h);
        }
      }
      return next;
    });
  }, [data, initialScope]);

  const subscribeMut = useMutation({
    mutationFn: (handles: string[]) => subscribeFn({ data: { handles } }),
    onSuccess: (res) => {
      toast.success(
        `Subscribed to ${res.subscribed} accounts` +
          (res.skipped_existing
            ? ` · ${res.skipped_existing} already followed`
            : "") +
          (res.failed ? ` · ${res.failed} failed` : ""),
      );
      qc.invalidateQueries({ queryKey: ["user-subscribed-sources"] });
      qc.invalidateQueries({ queryKey: ["user-subscribed-source-ids"] });
      qc.invalidateQueries({ queryKey: ["sources"] });
      onDone?.({ subscribed: res.subscribed });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Subscribe failed"),
  });

  const selectAllAccounts = (includeOther: boolean) => {
    if (!data || !("ok" in data) || !data.ok) return;
    setSelected(() => {
      const next = new Set<string>();
      for (const it of data.suggested) {
        const h = it.handle.toLowerCase();
        if (!subbed.has(h)) next.add(h);
      }
      if (includeOther) {
        for (const it of data.other) {
          const h = it.handle.toLowerCase();
          if (!subbed.has(h)) next.add(h);
        }
      }
      return next;
    });
    if (includeOther) setShowOther(true);
  };

  // Landing pitch
  if (!started) {
    return (
      <div className="space-y-5 max-w-xl">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">
            Import the accounts you follow on X
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Pull in the accounts you already follow on X so your feed starts
            populated. We'll pre-select the ones that look oncology-relevant
            and let you uncheck anything before subscribing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setInitialScope("suggested");
              setStarted(true);
            }}
          >
            Import urology-relevant
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setInitialScope("all");
              setShowOther(true);
              setStarted(true);
            }}
          >
            Import all follows
          </Button>
          {onSkip && (
            <Button variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
          )}
        </div>
        <p className="text-xs text-text-muted">
          You can still adjust the selection before subscribing.
        </p>
      </div>
    );
  }

  if (isFetching && !data) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching the accounts you follow on X — this can take 10–20 seconds
          for large follow lists.
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-sm"
              style={{ background: "var(--panel-elevated)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-red-400">
          Couldn't load your X follows. {error instanceof Error ? error.message : ""}
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data.ok) {
    if (data.error === "not_connected") {
      return (
        <div className="text-sm text-text-secondary">
          Connect your X account first, then come back to import your follows.
        </div>
      );
    }
    if (data.error === "rate_limited") {
      const mins = Math.max(1, Math.ceil(data.retry_after_seconds / 60));
      return (
        <div className="text-sm text-text-secondary">
          X is rate-limiting your account. Try again in ~{mins} minute
          {mins === 1 ? "" : "s"}.
        </div>
      );
    }
    if (data.error === "scope_missing") {
      return (
        <div className="text-sm text-text-secondary">{data.message}</div>
      );
    }
    return (
      <div className="text-sm text-red-400">
        X API error ({data.status}): {data.message}
      </div>
    );
  }

  const subbed = new Set(data.already_subscribed);
  const totalShown = data.suggested.length + data.other.length;

  if (totalShown === 0) {
    return (
      <div className="text-sm text-text-secondary">
        Looks like you don't follow anyone on X yet. You can search for handles
        to subscribe to from the Sources page.
      </div>
    );
  }

  const f = filter.trim().toLowerCase();
  const matchFilter = (it: Item) =>
    !f ||
    it.handle.toLowerCase().includes(f) ||
    it.display_name.toLowerCase().includes(f);

  const suggested = data.suggested.filter(matchFilter);
  const other = data.other.filter(matchFilter);

  const toggle = (handle: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(handle);
      else next.delete(handle);
      return next;
    });
  };

  const selectAllSuggested = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const it of data.suggested) {
        const h = it.handle.toLowerCase();
        if (!subbed.has(h)) next.add(h);
      }
      return next;
    });
  };

  const deselectAll = () => setSelected(new Set());

  const Row = ({ it, showSignals }: { it: Item; showSignals: boolean }) => {
    const h = it.handle.toLowerCase();
    const isSubbed = subbed.has(h);
    const checked = selected.has(h);
    return (
      <div
        className="flex items-start gap-3 px-3 py-2"
        style={{
          background: "var(--panel-elevated)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="pt-1">
          <Checkbox
            checked={isSubbed || checked}
            disabled={isSubbed}
            onCheckedChange={(v) => toggle(h, !!v)}
          />
        </div>
        {it.avatar_url ? (
          <img src={it.avatar_url} alt="" className="w-8 h-8 rounded-full" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-panel border border-border" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">
              {it.display_name}
            </span>
            <span className="font-mono text-[10px] text-text-secondary">
              @{it.handle}
            </span>
            {isSubbed && (
              <span className="font-mono text-[10px] uppercase text-accent">
                Following
              </span>
            )}
          </div>
          {it.bio && (
            <p className="text-[11px] text-text-secondary line-clamp-1">
              {it.bio}
            </p>
          )}
          {showSignals && it.matched_signals.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {it.matched_signals.slice(0, 4).map((m, i) => (
                <span
                  key={i}
                  className="font-mono text-[9px] px-1.5 py-px"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {m.value}
                </span>
              ))}
              {it.suggested_area_slugs[0] && (
                <span
                  className="font-mono text-[9px] px-1.5 py-px text-accent"
                  style={{ border: "1px solid var(--accent)" }}
                >
                  {it.suggested_area_slugs[0]}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">
          Import the accounts you follow on X
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          We found {data.totalSeen} accounts you follow on X.{" "}
          {data.suggested.length} of them look relevant to your cancer areas.
          {data.capped &&
            " (We checked the first 500 — re-import later for more.)"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or handle…"
            className="pl-7 h-8 text-[12px]"
          />
        </div>
        <Button size="sm" variant="outline" onClick={selectAllSuggested}>
          Select all suggested
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => selectAllAccounts(true)}
        >
          Select all follows
        </Button>
        <Button size="sm" variant="ghost" onClick={deselectAll}>
          Deselect all
        </Button>
      </div>

      <div className="space-y-3 max-h-[420px] overflow-auto">
        <div>
          <h3 className="font-mono text-xs uppercase tracking-wider text-text-secondary mb-2">
            Suggested for you · {suggested.length}
          </h3>
          <div className="space-y-1.5">
            {suggested.map((it) => (
              <Row key={it.x_user_id} it={it} showSignals />
            ))}
            {suggested.length === 0 && (
              <p className="text-xs text-text-muted italic">
                No suggested accounts match your filter.
              </p>
            )}
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowOther((v) => !v)}
            className="font-mono text-xs uppercase tracking-wider text-text-secondary hover:text-text-primary"
          >
            {showOther ? "▼" : "▶"} Other accounts you follow · {other.length}
          </button>
          {showOther && (
            <div className="space-y-1.5 mt-2">
              {other.map((it) => (
                <Row key={it.x_user_id} it={it} showSignals={false} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        {onSkip && (
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip for now
          </Button>
        )}
        <div className="ml-auto">
          <Button
            size="sm"
            disabled={selected.size === 0 || subscribeMut.isPending}
            onClick={() =>
              subscribeMut.mutate(Array.from(selected))
            }
          >
            {subscribeMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-1" />
            )}
            Subscribe to {selected.size} selected
          </Button>
        </div>
      </div>
    </div>
  );
}
