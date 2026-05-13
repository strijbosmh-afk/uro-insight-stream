import * as React from "react";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { getXConnectionStatus, listMyPosts } from "@/serverFns/x-credentials";
import { useBookmarks } from "@/hooks/useBookmarks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/me")({
  head: () => ({ meta: [{ title: "Me — UroFeed" }] }),
  component: MeHub,
});

function MeHub() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [contactOpen, setContactOpen] = React.useState(false);

  const { data: xStatus } = useQuery({
    queryKey: ["x-connection-status"],
    queryFn: () => getXConnectionStatus(),
  });

  const { data: followingIds } = useQuery({
    queryKey: ["user-subscribed-source-ids", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("user_subscribed_sources")
        .select("source_id")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.source_id as string);
    },
    enabled: !!user,
  });

  const { data: myPosts } = useQuery({
    queryKey: ["my-x-posts", user?.id],
    queryFn: () => listMyPosts({ data: { limit: 100 } }),
    enabled: !!user,
  });

  const followingCount = followingIds?.length ?? 0;
  const postsCount = myPosts?.length ?? 0;
  const { data: bookmarks } = useBookmarks();
  const bookmarkCount = bookmarks?.length ?? 0;

  const xConnected = xStatus && !xStatus.revoked_at && !!xStatus.x_username;
  const displayName = profile?.display_name || user?.email || "Account";
  const initials = (displayName || "?")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const copyDesktopUrl = async () => {
    try {
      const url = window.location.origin + pathname;
      await navigator.clipboard.writeText(url);
      toast.success("Open this URL on your computer to access admin tools.");
    } catch {
      toast.error("Could not copy URL — please copy from address bar.");
    }
  };

  return (
    <div className="max-w-xl mx-auto pb-6">
      {/* User card — whole card tappable, navigates to /me/profile */}
      <Link
        to="/me/profile"
        className="block bg-panel border border-border rounded-[3px] p-4 flex items-center gap-3 active:bg-panel-elevated/60 hover:bg-panel-elevated/40 transition-colors"
      >
        <div className="w-16 h-16 rounded-full bg-panel-elevated border border-border flex items-center justify-center overflow-hidden shrink-0">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-[18px] font-semibold text-accent">
              {initials}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[18px] font-semibold text-text-primary truncate">
            {displayName}
          </div>
          <div className="text-[12px] font-mono text-text-muted truncate">
            {xConnected ? (
              <>
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full bg-success mr-1.5 align-middle"
                  role="img"
                  aria-label="X account connected"
                  title="X account connected"
                />
                @{xStatus!.x_username}
              </>
            ) : (
              <span className="text-warning">X account not connected</span>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
      </Link>

      <Section label="Content">
        <Row to="/me/following" label={`People I follow (${followingCount})`} />
        <Row to="/me/posts" label={`My posts (${postsCount})`} />
        <Row to="/me/saved" label={`Saved (${bookmarkCount})`} />
      </Section>

      <Section label="Configuration">
        <Row to="/me/profile" label="Profile" />
        <Row to="/me/preferences" label="Display preferences" />
        <Row to="/me/notifications" label="Notifications" />
        <Row to="/me/ai" label="AI settings" />
        <Row to="/me/x-account" label="X account" />
      </Section>

      <Section label="Help">
        <Row to="/help/instructions" label="Read the guide" />
        <button
          type="button"
          onClick={() => setContactOpen(true)}
          className="w-full h-14 px-4 flex items-center justify-between border-b border-border text-left text-[14px] text-text-primary hover:bg-panel-elevated/60 transition-colors"
        >
          <span>Contact support</span>
          <ChevronRight className="w-4 h-4 text-text-muted" />
        </button>
      </Section>

      {isAdmin && (
        <Section label="Admin">
          <button
            type="button"
            onClick={copyDesktopUrl}
            className="w-full h-14 px-4 flex items-center justify-between border-b border-border text-left text-[14px] text-text-primary hover:bg-panel-elevated/60 transition-colors"
          >
            <span>Open desktop for admin tools</span>
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>
        </Section>
      )}

      <div className="mt-6 border-t border-border">
        <button
          type="button"
          onClick={() => {
            void signOut();
          }}
          className="w-full h-14 px-4 flex items-center justify-center gap-2 text-[14px] text-text-muted hover:text-text-primary transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Contact</DialogTitle>
            <DialogDescription>This app was created by:</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="text-lg font-semibold text-text-primary">
                Michiel Strijbos
              </div>
              <div className="text-sm text-text-muted">Creator &amp; Developer</div>
            </div>
            <div className="text-sm text-text-primary">
              Email:{" "}
              <a
                href="mailto:strijbosmh@gmail.com"
                className="text-accent hover:underline"
              >
                strijbosmh@gmail.com
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <div className="px-1 mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        {label}
      </div>
      <div className="bg-panel border border-border rounded-[3px] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function Row({
  to,
  label,
}: {
  to: string;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="w-full h-14 px-4 flex items-center justify-between border-b border-border last:border-b-0 text-[14px] text-text-primary hover:bg-panel-elevated/60 transition-colors"
    >
      <span>{label}</span>
      <ChevronRight className="w-4 h-4 text-text-muted" />
    </Link>
  );
}