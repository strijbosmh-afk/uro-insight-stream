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
  LifeBuoy,
  BookOpen,
  AtSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthProvider";
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

const BASE_SECTIONS: NavSection[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
      { label: "Congresses", to: "/congresses", icon: CalendarRange },
      { label: "Live Feed", to: "/feed", icon: Radio },
      { label: "Summaries", to: "/summaries", icon: FileText },
      { label: "Digests", to: "/digests", icon: Mail },
      { label: "Discover", to: "/discover", icon: Compass },
      { label: "Discover Groups", to: "/discover/groups", icon: Compass },
    ],
  },
  {
    label: "Configuration",
    items: [
      { label: "Sources", to: "/sources", icon: Database },
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
];

const ADMIN_SECTION: NavSection = {
  label: "Admin",
  items: [
    { label: "Users", to: "/admin/users", icon: UsersIcon },
    { label: "Groups", to: "/admin/groups", icon: Users2 },
    { label: "Recommendations", to: "/admin/recommendations", icon: Sparkles },
    { label: "Ingestion", to: "/admin/ingestion", icon: RadioTower },
  ],
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin } = useAuth();
  const sections = React.useMemo(
    () => (isAdmin ? [...BASE_SECTIONS, ADMIN_SECTION] : BASE_SECTIONS),
    [isAdmin],
  );
  const [contactOpen, setContactOpen] = React.useState(false);

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
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={cn(
                        "relative flex items-center gap-3 h-8 text-[13px] transition-colors",
                        collapsed ? "justify-center mx-2 rounded-[3px]" : "px-4",
                        active
                          ? "text-text-primary bg-panel-elevated"
                          : "text-text-muted hover:text-text-primary hover:bg-panel-elevated/60",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent" />
                      )}
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Help section */}
        <div className="mb-4">
          {!collapsed && (
            <div className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              Help
            </div>
          )}
          <ul>
            <li>
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className={cn(
                  "relative w-full flex items-center gap-3 h-8 text-[13px] text-text-muted hover:text-text-primary hover:bg-panel-elevated/60 transition-colors text-left",
                  collapsed ? "justify-center mx-2 rounded-[3px]" : "px-4",
                )}
              >
                <AtSign className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">Contact</span>}
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "h-8 flex items-center gap-2 border-t border-border text-[11px] font-mono uppercase tracking-wider text-text-muted hover:text-text-primary hover:bg-panel-elevated transition-colors",
          collapsed ? "justify-center" : "px-4",
        )}
      >
        {collapsed ? (
          <ChevronsRight className="w-3.5 h-3.5" />
        ) : (
          <>
            <ChevronsLeft className="w-3.5 h-3.5" />
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