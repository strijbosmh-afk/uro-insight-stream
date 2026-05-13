import * as React from "react";
import { useRouterState, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Menu, ChevronDown, Check, Plus, Link2 } from "lucide-react";
import { XConnectWizard } from "@/components/x-wizard/XConnectWizard";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { feedService } from "@/services/feedService";
import { ShareToXButton } from "@/components/x/ShareToXButton";
import { NotificationsBell } from "@/components/watchlists/NotificationsBell";
import {
  getXConnectionStatus,
  listXAccounts,
  switchActiveXAccount,
} from "@/serverFns/x-credentials";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROUTE_LABELS: Record<string, string> = {
  "": "Dashboard",
  dashboard: "Dashboard",
  congresses: "Congresses",
  sessions: "Sessions",
  feed: "Live Feed",
  summaries: "Summaries",
  digests: "Digests",
  sources: "Sources",
  settings: "Settings",
  admin: "Admin",
  users: "Users",
  discover: "Discover",
  groups: "Groups",
  recommendations: "Recommendations",
  ingestion: "Ingestion",
};

function useBreadcrumb() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parts = pathname.split("/").filter(Boolean);

  // Resolve a congress id segment (e.g. /congresses/cong_eau26) to its shortCode.
  const congressIdInPath =
    parts[0] === "congresses" && parts[1]?.startsWith("cong_") ? parts[1] : null;
  const { data: congress } = useQuery({
    queryKey: ["congress", congressIdInPath],
    queryFn: () => feedService.getCongress(congressIdInPath as string),
    enabled: Boolean(congressIdInPath),
  });

  const sessionIdInPath =
    parts[0] === "sessions" && parts[1]?.startsWith("sess_") ? parts[1] : null;
  const { data: session } = useQuery({
    queryKey: ["session", sessionIdInPath],
    queryFn: () => feedService.getSession(sessionIdInPath as string),
    enabled: Boolean(sessionIdInPath),
  });

  const root = { label: "UroFeed", to: "/" };
  if (parts.length === 0) return [root, { label: "Dashboard", to: "/" }];
  return [
    root,
    ...parts.map((p, idx) => {
      let label: string;
      if (p === congressIdInPath && congress) label = congress.shortCode;
      else if (p === sessionIdInPath && session) {
        label =
          session.title.length > 40
            ? session.title.slice(0, 40) + "…"
            : session.title;
      } else label = ROUTE_LABELS[p] ?? p;
      const to = "/" + parts.slice(0, idx + 1).join("/");
      return { label, to };
    }),
  ];
}

function useClock() {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function fmtTime(d: Date | null) {
  if (!d) return "--:--:--";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

interface TopBarProps {
  onOpenMobileNav?: () => void;
}

export function TopBar({ onOpenMobileNav }: TopBarProps = {}) {
  const crumbs = useBreadcrumb();
  const now = useClock();
  const isMobile = useIsMobile();

  return (
    <header className="h-12 shrink-0 flex items-center gap-2 sm:gap-4 px-2 sm:px-4 border-b border-border bg-panel">
      {onOpenMobileNav && (
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open menu"
          className="w-9 h-9 -ml-1 flex items-center justify-center rounded-[3px] text-text-muted hover:text-text-primary hover:bg-panel-elevated transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12px] min-w-0 flex-1 sm:flex-initial">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          if (onOpenMobileNav && !last) return null;
          const className =
            "capitalize truncate " +
            (last
              ? "text-text-primary font-medium"
              : "text-text-muted hover:text-text-primary transition-colors");
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
              )}
              {last ? (
                <span className={className}>{c.label}</span>
              ) : (
                <Link to={c.to} className={className}>
                  {c.label}
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Search slot reserved — hidden until global search is wired
          (H-U6: previously rendered a non-functional input). */}
      <div className="hidden sm:flex flex-1 justify-center" />

      {/* Live status pill — hidden on small mobile */}
      <div className="hidden sm:flex items-center gap-2 h-7 px-2.5 border border-border rounded-[3px] bg-panel-elevated">
        <span
          className="w-1.5 h-1.5 rounded-full bg-success"
          style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
          role="img"
          aria-label="Live — sync active"
          title="Live — sync active"
        />
        <span className="text-[10px] font-mono font-semibold tracking-wider text-success">
          LIVE
        </span>
        <span className="w-px h-3 bg-border" />
        <span className="text-[10px] font-mono text-text-muted">
          sync {fmtTime(now)}
        </span>
      </div>

      {/* Avatar */}
      {!isMobile && <XHandleBadge />}
      {!isMobile && <ConnectXHeaderLink />}
      {!isMobile && <ShareToXButton />}
      {/* H-U9: bell rendered on mobile too so phone users can see unread count. */}
      <NotificationsBell />
      {/* H-U6: removed dead "UR" account button — was a non-functional
          placeholder. Account / settings access lives in the sidebar
          (desktop) and BottomTabBar → Me (mobile). */}
    </header>
  );
}

function XHandleBadge() {
  const qc = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ["x-connection-status"],
    queryFn: () => getXConnectionStatus(),
  });
  const { data: accounts } = useQuery({
    queryKey: ["x-accounts"],
    queryFn: () => listXAccounts(),
  });
  const switchMut = useMutation({
    mutationFn: (accountId: string) =>
      switchActiveXAccount({ data: { accountId } }),
    onSuccess: (_r, accountId) => {
      const acc = accounts?.find((a) => a.id === accountId);
      toast.success(`Switched to @${acc?.x_username ?? "account"}`);
      qc.invalidateQueries({ queryKey: ["x-connection-status"] });
      qc.invalidateQueries({ queryKey: ["x-accounts"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!status || status.revoked_at || !status.x_username) return null;
  const list = accounts ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hidden sm:inline-flex h-8 px-2.5 shrink-0 items-center gap-1.5 rounded-[3px] border border-border bg-panel-elevated text-[11px] font-mono text-text-primary hover:border-accent/60 hover:text-accent transition-colors"
        title="Switch X account"
      >
        <span
          className="w-1.5 h-1.5 rounded-full bg-success"
          role="img"
          aria-label="Connected"
          title="Connected"
        />
        <span>@{status.x_username}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
          X accounts
        </DropdownMenuLabel>
        {list.map((a) => (
          <DropdownMenuItem
            key={a.id}
            onClick={() => {
              if (!a.is_active) switchMut.mutate(a.id);
            }}
            className="text-[12px] font-mono cursor-pointer"
          >
            <span className="flex-1">@{a.x_username}</span>
            {a.is_active && <Check className="w-3.5 h-3.5 text-success" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="text-[12px] cursor-pointer">
          <Link to="/settings">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add another account
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConnectXHeaderLink() {
  const [open, setOpen] = React.useState(false);
  const { user } = useAuth();
  const { data: status, isLoading } = useQuery({
    queryKey: ["x-connection-status"],
    queryFn: () => getXConnectionStatus(),
  });
  const { data: pendingFlag } = useQuery({
    queryKey: ["profile-pending-x", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("pending_x_connection")
        .eq("id", user!.id)
        .maybeSingle();
      return !!(data as { pending_x_connection?: boolean } | null)?.pending_x_connection;
    },
  });
  if (isLoading || (status && !status.revoked_at && status.x_username)) return null;
  const showDot = !!pendingFlag;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Connect your X (Twitter) account"
        className="relative hidden sm:inline-flex h-8 px-2.5 shrink-0 items-center gap-1.5 rounded-[3px] border border-accent/50 bg-accent/10 text-[11px] font-mono text-accent hover:bg-accent/20 transition-colors"
      >
        <span className="relative inline-flex">
          <Link2 className="w-3 h-3" />
          {showDot && (
            <span
              aria-label="You skipped this earlier"
              className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent ring-1 ring-bg"
            />
          )}
        </span>
        <span>Connect X</span>
      </button>
      <XConnectWizard open={open} onOpenChange={setOpen} />
    </>
  );
}

export default TopBar;