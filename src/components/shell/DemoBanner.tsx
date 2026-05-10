import { Sparkles } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useIsMobile } from "@/hooks/use-mobile";

export function DemoBanner() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  if (!profile?.is_demo) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-accent/10 border-b border-accent/30 text-[12px]">
      <Sparkles className="w-3.5 h-3.5 shrink-0 text-accent" />
      {isMobile ? (
        <span className="font-mono uppercase tracking-wider text-accent">
          Demo · resets nightly
        </span>
      ) : (
        <span className="text-text-primary">
          This is the UroFeed demo account. All features work — your changes
          reset nightly at 03:00 UTC. Posts are simulated (don't actually hit X).
        </span>
      )}
    </div>
  );
}