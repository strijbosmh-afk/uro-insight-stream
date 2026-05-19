import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarRange,
  Radio,
  FileText,
  Database,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Activity,
  Sparkles,
  RadioTower,
  Compass,
  Mail,
  Users as UsersIcon,
  Users2,
  BookOpen,
  AtSign,
  Lightbulb,
  ShieldAlert,
  Bell,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
import { useBrainstormUnread } from "@/hooks/useBrainstormUnread";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

// Sidebar sections, grouped by mental model:
//   Today        → what's happening right now (overview + live tweets)
//   Insights     → what's been produced (AI summaries, congress library)
//   Sources      → manage who I follow
//   Notifications→ delivered to me on a cadence (real-time + scheduled)
//   Team         → admin-team-internal collaboration (admin only)
//   Admin        → manage the system itself (admin only)

const TODAY_SECTION: NavSection = {
  label: "Today",
  items: [
    { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
    { label: "Live Feed", to: "/feed", icon: Radio },
  ],
};

const INSIGHTS_SECTION: NavSection = {
  label: "Insights",
  items: [
    { label: "Summaries", to: "/summaries", icon: FileText },
    { label: "Congresses", to: "/congresses", icon: CalendarRange },
  ],
};

const SOURCES_SECTION: NavSection = {
  label: "Sources",
  items: [
    { label: "Discover", to: "/discover", icon: Compass },
    { label: "Following", to: "/sources", icon: Database },
  ],
};

const NOTIFICATIONS_SECTION: NavSection = {
  label: "Notifications",
  items: [
    { label: "Alerts", to: "/alerts", icon: Bell },
    { label: "Digests", to: "/digests", icon: Mail },
  ],
};

const BRAINSTORM_ITEM: NavItem = {
  label: "Brainstorm",
  to: "/configuration/brainstorm",
  icon: Lightbulb,
};

const TEAM_SECTION: NavSection = {
  label: "Team",
  items: [BRAINSTORM_ITEM],
};

const ADMIN_SECTION: NavSection = {
  label: "Admin",
  items: [
    { label: "Users", to: "/admin/users", icon: UsersIcon },
    { label: "Groups", to: "/admin/groups", icon: Users2 },
    { label: "Recommendations", to: "/admin/recommendations", icon: Sparkles },
    { label: "Ingestion", to: "/admin/ingestion", icon: RadioTower },
    { label: "Email diagnostics", to: "/admin/email-diagnostics", icon: ShieldAlert },
  ],
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin, signOut } = useAuth();
  const { unread, markRead } = useBrainstormUnread();
  const sections = React.useMemo(() => {
    const baseSections: NavSection[] = [
      TODAY_SECTION,
      INSIGHTS_SECTION,
      SOURCES_SECTION,
      NOTIFICATIONS_SECTION,
    ];
    if (!isAdmin) return baseSections;
    return [...baseSections, TEAM_SECTION, ADMIN_SECTION];
  }, [isAdmin]);
  const [contactOpen, setContactOpen] = React.useState(false);

  React.useEffect(() => {
    // Only mark as read once per visit when there's actually something
    // unread; otherwise this no-ops (was firing on every render via the
    // unstable `markRead` identity in earlier revisions).
    if (pathname === BRAINSTORM_ITEM.to && unread > 0) markRead();
  }, [pathname, unread, markRead]);

  return (
    <aside
      className={cn(
        "flex flex-col bg-panel border-r border-border transition-[width] duration-150 shrink-0",
        collapsed ? "w-14" : "w-60",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "h-12 flex items-center border-b border-border shrink-0",
          collapsed ? "justify-center" : "px-4",
        )}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-[3px] bg-accent/10 border border-accent/40 flex items-center justify-center">
            <Activity className="w-3.5 h-3.5 text-accent" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight text-text-primary">
                UroFeed
              </span>
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-muted mt-0.5">
                clinical · v0.1
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {sections.map((section) => (
          <div key={section.label} className="mb-4">
            {!collapsed && (
              <div className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                {section.label}
              </div>
            )}
            <ul>
              {section.items.map((item) => {
                const hasMoreSpecificSibling = section.items.some(
                  (other) =>
                    other.to !== item.to &&
                    other.to.startsWith(item.to + "/") &&
                    (pathname === other.to ||
                      pathname.startsWith(other.to + "/")),
                );
                const active =
                  !hasMoreSpecificSibling &&
                  (pathname === item.to ||
                    pathname.startsWith(item.to + "/"));
                const Icon = item.icon;
                const isBrainstorm = item.to === BRAINSTORM_ITEM.to;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      aria-label={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "relative flex items-center gap-3 h-8 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                        collapsed ? "justify-center mx-2 rounded-[3px]" : "px-4",
                        active
                          ? "text-text-primary bg-panel-elevated"
                          : "text-text-muted hover:text-text-primary hover:bg-panel-elevated/60",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />
                      )}
                      <Icon aria-hidden="true" className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                      {isBrainstorm && unread > 0 && (
                        <span
                          aria-label={`${unread} unread`}
                          className={cn(
                            "min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-[10px] font-semibold text-accent-foreground flex items-center justify-center",
                            collapsed && "absolute top-1 right-1 min-w-[14px] h-[14px] text-[9px]",
                          )}
                        >
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom utility nav (above collapse toggle) */}
      <div className="border-t border-border py-2">
        <ul>
          <li>
            <Link
              to="/help/instructions"
              aria-label={collapsed ? "Help" : undefined}
              title={collapsed ? "Help" : undefined}
              className={cn(
                "relative flex items-center gap-3 h-8 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                collapsed ? "justify-center mx-2 rounded-[3px]" : "px-4",
                pathname === "/help/instructions"
                  ? "text-text-primary bg-panel-elevated"
                  : "text-text-muted hover:text-text-primary hover:bg-panel-elevated/60",
              )}
            >
              {pathname === "/help/instructions" && (
                <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />
              )}
              <BookOpen aria-hidden="true" className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Help</span>}
            </Link>
          </li>
          <li>
            <Link
              to="/settings"
              search={{ tab: undefined }}
              aria-label={collapsed ? "Settings" : undefined}
              title={collapsed ? "Settings" : undefined}
              className={cn(
                "relative flex items-center gap-3 h-8 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                collapsed ? "justify-center mx-2 rounded-[3px]" : "px-4",
                pathname === "/settings" || pathname.startsWith("/settings/")
                  ? "text-text-primary bg-panel-elevated"
                  : "text-text-muted hover:text-text-primary hover:bg-panel-elevated/60",
              )}
            >
              {(pathname === "/settings" || pathname.startsWith("/settings/")) && (
                <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />
              )}
              <Settings aria-hidden="true" className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Settings</span>}
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setContactOpen(true)}
              aria-label={collapsed ? "Contact" : undefined}
              title={collapsed ? "Contact" : undefined}
              className={cn(
                "relative w-full flex items-center gap-3 h-8 text-[13px] text-text-muted hover:text-text-primary hover:bg-panel-elevated/60 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                collapsed ? "justify-center mx-2 rounded-[3px]" : "px-4",
              )}
            >
              <AtSign aria-hidden="true" className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Contact</span>}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                void signOut();
              }}
              aria-label={collapsed ? "Sign out" : undefined}
              title={collapsed ? "Sign out" : undefined}
              className={cn(
                "relative w-full flex items-center gap-3 h-8 text-[13px] text-text-muted hover:text-text-primary hover:bg-panel-elevated/60 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                collapsed ? "justify-center mx-2 rounded-[3px]" : "px-4",
              )}
            >
              <LogOut aria-hidden="true" className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">Sign out</span>}
            </button>
          </li>
        </ul>
      </div>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(
          "h-8 flex items-center gap-2 border-t border-border text-[11px] font-mono uppercase tracking-wider text-text-muted hover:text-text-primary hover:bg-panel-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
          collapsed ? "justify-center" : "px-4",
        )}
      >
        {collapsed ? (
          <ChevronsRight aria-hidden="true" className="w-3.5 h-3.5" />
        ) : (
          <>
            <ChevronsLeft aria-hidden="true" className="w-3.5 h-3.5" />
            <span>collapse</span>
          </>
        )}
      </button>

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
            <p className="text-xs text-text-muted">
              Feedback, bug reports, and feature requests welcome.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

export default Sidebar;