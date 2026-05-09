import * as React from "react";
import { PenSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { ComposeTweetDialog } from "./ComposeTweetDialog";

/**
 * Inline "what's on your mind" composer rendered above the live feed.
 * Click anywhere opens the full compose dialog.
 */
export function InlineComposer() {
  const [open, setOpen] = React.useState(false);
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile-min", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      return data as { display_name: string | null; avatar_url: string | null } | null;
    },
    staleTime: 5 * 60_000,
  });

  const initials = (profile?.display_name ?? user?.email ?? "U")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="
          w-full flex items-center gap-3 px-3 py-2.5 rounded-[4px]
          border border-border bg-panel hover:border-accent/60 hover:bg-panel-elevated/40
          transition-colors text-left
        "
        aria-label="Share to X"
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="w-9 h-9 rounded-full bg-panel-elevated shrink-0"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-panel-elevated border border-border flex items-center justify-center text-[11px] font-mono font-semibold text-accent shrink-0">
            {initials}
          </div>
        )}
        <span className="flex-1 text-[13px] text-text-muted">
          Share something with the urology community…
        </span>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-accent">
          <PenSquare className="w-3.5 h-3.5" />
          Share to X
        </span>
      </button>
      <ComposeTweetDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default InlineComposer;