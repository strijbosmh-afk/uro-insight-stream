import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getXConnectionStatus } from "@/serverFns/x-credentials";
import { getXSetupProgress } from "@/serverFns/x-setup-progress";
import { XConnectWizard } from "./XConnectWizard";

/**
 * Hard banner shown when the user is past their X grace window AND has no
 * connected X account. Pre-grace escalation (days 0–13) is a follow-up.
 */
export function PostGraceBanner() {
  const [open, setOpen] = React.useState(false);
  const { data: status } = useQuery({
    queryKey: ["x-connection-status"],
    queryFn: () => getXConnectionStatus(),
  });
  const { data: progress } = useQuery({
    queryKey: ["x-setup-progress"],
    queryFn: () => getXSetupProgress(),
  });
  const graceUntil = progress?.grace_until
    ? new Date(progress.grace_until).getTime()
    : null;
  const expired = graceUntil != null && graceUntil < Date.now();
  if (status || !expired) return null;
  return (
    <>
      <div className="flex items-center gap-3 px-3 py-2 border-b border-destructive/40 bg-destructive/10 text-sm">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
        <span className="flex-1 min-w-0 text-text-primary">
          Your 14-day grace window has ended. Ingestion is paused until you
          connect your X (Twitter) developer credentials.
        </span>
        <Button size="sm" onClick={() => setOpen(true)}>
          Connect X
        </Button>
      </div>
      <XConnectWizard open={open} onOpenChange={setOpen} />
    </>
  );
}

export default PostGraceBanner;