import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { getUnreadMatchCount } from "@/serverFns/watchlists";
import { useAuth } from "@/auth/AuthProvider";

export function NotificationsBell() {
  const { user } = useAuth();
  const fn = useServerFn(getUnreadMatchCount);
  const { data } = useQuery({
    queryKey: ["watchlist-unread"],
    queryFn: () => fn(),
    enabled: Boolean(user),
    staleTime: 30_000,
  });
  if (!user) return null;
  const count = data?.count ?? 0;
  return (
    <Link
      to="/alerts"
      title="Watchlist alerts"
      aria-label={count > 0 ? `${count} new alerts` : "Watchlist alerts"}
      className="relative hidden sm:inline-flex w-8 h-8 shrink-0 items-center justify-center rounded-[3px] border border-border bg-panel-elevated text-text-muted hover:text-accent hover:border-accent/60 transition-colors"
    >
      <Bell className="w-3.5 h-3.5" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full bg-accent text-[9px] font-mono font-semibold text-bg leading-none">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}