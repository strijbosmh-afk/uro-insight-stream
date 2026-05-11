import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Info, AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";
import { getXConnectionStatus } from "@/serverFns/x-credentials";
import { getXSetupProgress } from "@/serverFns/x-setup-progress";
import { XConnectWizard } from "./XConnectWizard";

type Tier = "info" | "warning" | "urgent";

function differenceInDays(a: number, b: number): number {
  return Math.floor((a - b) / (24 * 60 * 60 * 1000));
}

/**
 * Pre-grace escalation banner shown when an unconnected user is still inside
 * their 14-day grace window. Three tiers crescendo from informative to urgent.
 * Dismissible per-session (sessionStorage) so it returns next session.
 */
export function PreGraceBanner() {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [dismissedTier, setDismissedTier] = React.useState<Tier | null>(() => {
    if (typeof window === "undefined") return null;
    return (sessionStorage.getItem("urofeed:pre-grace-dismissed") as Tier | null) ?? null;
  });
  const { data: status } = useQuery({
    queryKey: ["x-connection-status"],
    queryFn: () => getXConnectionStatus(),
  });
  const { data: progress } = useQuery({
    queryKey: ["x-setup-progress"],
    queryFn: () => getXSetupProgress(),
  });

  const isConnected = !!(status && !status.revoked_at && status.x_username);
  const graceUntil = progress?.grace_until ? new Date(progress.grace_until).getTime() : null;
  const isPastGrace = graceUntil != null && graceUntil < Date.now();
  if (!user || isConnected || isPastGrace) return null;

  const createdAt = user.created_at ? new Date(user.created_at).getTime() : Date.now();
  const days = differenceInDays(Date.now(), createdAt);

  let tier: Tier;
  if (days <= 3) tier = "info";
  else if (days <= 7) tier = "warning";
  else tier = "urgent"; // 8–13

  if (dismissedTier === tier) return null;

  const dismiss = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("urofeed:pre-grace-dismissed", tier);
    }
    setDismissedTier(tier);
  };

  const graceDate =
    graceUntil != null ? new Date(graceUntil).toLocaleDateString() : "soon";

  const styles =
    tier === "info"
      ? "border-accent/40 bg-accent/5"
      : tier === "warning"
        ? "border-warning/40 bg-warning/10"
        : "border-warning/60 bg-warning/15";
  const iconColor =
    tier === "info" ? "text-accent" : "text-warning";

  const message =
    tier === "info"
      ? "Connect your X account to see live tweets from the people you follow. We'll guide you through it."
      : tier === "warning"
        ? "Your feed is using sample data — connect X to switch to live ingestion from your sources."
        : `Live ingestion will pause on ${graceDate}. Connect X now to keep your dashboard fresh.`;

  return (
    <>
      <div
        className={`flex items-center gap-3 px-3 py-2 border-b text-sm ${styles}`}
      >
        {tier === "info" ? (
          <Info className={`w-4 h-4 shrink-0 ${iconColor}`} />
        ) : (
          <AlertTriangle className={`w-4 h-4 shrink-0 ${iconColor}`} />
        )}
        <span className="flex-1 min-w-0 text-text-primary">{message}</span>
        <Button size="sm" onClick={() => setOpen(true)}>
          Connect X
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-text-muted hover:text-text-primary p-1 rounded-[2px]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <XConnectWizard open={open} onOpenChange={setOpen} />
    </>
  );
}

export default PreGraceBanner;