import * as React from "react";
import { useRouterState, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, ChevronRight, Menu, PenSquare, ChevronDown, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { feedService } from "@/services/feedService";
import { ComposeTweetDialog } from "@/components/x/ComposeTweetDialog";
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

  if (parts.length === 0) return ["UroFeed", "Dashboard"];
  return [
    "UroFeed",
    ...parts.map((p) => {
      if (p === congressIdInPath && congress) return congress.shortCode;
      if (p === sessionIdInPath && session) {
        return session.title.length > 40
          ? session.title.slice(0, 40) + "…"
          : session.title;
      }
      return ROUTE_LABELS[p] ?? p;
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
          // On mobile, only show the last (current) crumb to save space.
          if (onOpenMobileNav && !last) return null;
          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
              )}
              <span
                className={
                  "capitalize truncate " +
                  (last
                    ? "text-text-primary font-medium"
                    : "text-text-muted")
                }
              >
                {c}
              </span>
            </React.Fragment>
          );
        })}
      </nav>

      {/* Search — hidden on mobile to free up space */}
      <div className="hidden sm:flex flex-1 justify-center">
        <div className="relative w-full max-w-xl">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            placeholder="search sessions, abstracts, handles…"
            className="w-full h-8 pl-8 pr-3 bg-bg border border-border rounded-[3px] text-[12px] font-mono text-text-primary placeholder:text-text-muted/70 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center h-5 px-1.5 text-[10px] font-mono text-text-muted border border-border rounded-[2px] bg-panel">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Live status pill — hidden on small mobile */}
      <div className="hidden sm:flex items-center gap-2 h-7 px-2.5 border border-border rounded-[3px] bg-panel-elevated">
        <span
          className="w-1.5 h-1.5 rounded-full bg-success"
          style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
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
      <XHandleBadge />
      <ComposeButton />
      <button
        type="button"
        className="w-8 h-8 shrink-0 rounded-[3px] border border-border bg-panel-elevated flex items-center justify-center text-[11px] font-mono font-semibold text-accent hover:border-accent/60 transition-colors"
        aria-label="Account"
      >
        UR
      </button>
    </header>
  );
}

function ComposeButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Compose a tweet"
        aria-label="Compose tweet"
        className="h-8 px-2.5 shrink-0 inline-flex items-center gap-1.5 rounded-[3px] border border-border bg-panel-elevated text-[11px] font-mono text-text-primary hover:border-accent/60 hover:text-accent transition-colors"
      >
        <PenSquare className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Compose</span>
      </button>
      <ComposeTweetDialog open={open} onOpenChange={setOpen} />
    </>
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
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
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

export default TopBar;