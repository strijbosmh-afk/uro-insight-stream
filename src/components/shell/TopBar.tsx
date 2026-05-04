import * as React from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronRight } from "lucide-react";
import { feedService } from "@/services/feedService";

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

export function TopBar() {
  const crumbs = useBreadcrumb();
  const now = useClock();

  return (
    <header className="h-12 shrink-0 flex items-center gap-4 px-4 border-b border-border bg-panel">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12px] min-w-0">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
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

      {/* Search */}
      <div className="flex-1 flex justify-center">
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

      {/* Live status pill */}
      <div className="flex items-center gap-2 h-7 px-2.5 border border-border rounded-[3px] bg-panel-elevated">
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
      <button
        type="button"
        className="w-8 h-8 rounded-[3px] border border-border bg-panel-elevated flex items-center justify-center text-[11px] font-mono font-semibold text-accent hover:border-accent/60 transition-colors"
        aria-label="Account"
      >
        UR
      </button>
    </header>
  );
}

export default TopBar;