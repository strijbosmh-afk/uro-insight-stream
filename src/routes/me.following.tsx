import * as React from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { MobileSubPage } from "@/components/shell/MobileSubPage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUnfollowSource } from "@/hooks/useHandleActions";

function FollowingErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <MobileSubPage title="Following">
      <div className="bg-panel border border-border rounded-[3px] p-6 text-center">
        <div className="text-[14px] text-text-primary mb-1">Couldn't load your follows</div>
        <div className="text-[12px] text-text-muted mb-4">
          {error.message || "Network error. Please try again."}
        </div>
        <Button
          size="sm"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Try again
        </Button>
      </div>
    </MobileSubPage>
  );
}

export const Route = createFileRoute("/me/following")({
  head: () => ({ meta: [{ title: "People I follow — UroFeed" }] }),
  component: MeFollowingPage,
  errorComponent: FollowingErrorComponent,
});

type Source = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean | null;
  role: string | null;
};

function MeFollowingPage() {
  const { user } = useAuth();
  const [query, setQuery] = React.useState("");
  const [confirm, setConfirm] = React.useState<Source | null>(null);
  const unfollowMut = useUnfollowSource();

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["me-following-sources", user?.id],
    enabled: !!user,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_subscribed_sources")
        .select(
          "source_id, sources(id, handle, display_name, avatar_url, verified, role)",
        )
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => r.sources as Source)
        .filter(Boolean);
    },
  });

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter(
      (s) =>
        s.handle.toLowerCase().includes(q) ||
        (s.display_name ?? "").toLowerCase().includes(q),
    );
  }, [sources, query]);

  return (
    <MobileSubPage title={`Following (${sources.length})`}>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <Input
          placeholder="Search by handle or name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      {isLoading && (
        <div className="text-[12px] font-mono text-text-muted">Loading…</div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="bg-panel border border-border rounded-[3px] p-6 text-center">
          <div className="text-[14px] text-text-primary mb-1">
            {sources.length === 0 ? "Not following anyone yet" : "No matches"}
          </div>
          <div className="text-[12px] text-text-muted">
            {sources.length === 0
              ? "Add sources from the Discover tab."
              : "Try a different search."}
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {filtered.map((s) => (
          <li
            key={s.id}
            className="bg-panel border border-border rounded-[3px] p-3 flex items-center gap-3"
          >
            <div className="w-12 h-12 rounded-full bg-panel-elevated border border-border overflow-hidden shrink-0">
              {s.avatar_url ? (
                <img
                  src={s.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold text-text-primary truncate">
                {s.display_name || s.handle}
                {s.verified ? (
                  <span className="ml-1 text-accent" aria-label="verified">
                    ✓
                  </span>
                ) : null}
              </div>
              <div className="text-[12px] font-mono text-text-muted truncate">
                @{s.handle}
                {s.role ? ` · ${s.role}` : ""}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-11 min-w-[90px]"
              disabled={unfollowMut.isPending}
              onClick={() => setConfirm(s)}
            >
              Following
            </Button>
          </li>
        ))}
      </ul>

      <AlertDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Unfollow @{confirm?.handle}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You will no longer see their tweets in your feed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirm) {
                  unfollowMut.mutate({ handle: confirm.handle });
                }
                setConfirm(null);
              }}
            >
              Unfollow
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileSubPage>
  );
}
