import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Radio, Compass, Mail, User } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

const TABS: Tab[] = [
  { label: "Feed", to: "/feed", icon: Radio },
  { label: "Discover", to: "/discover", icon: Compass },
  { label: "Digests", to: "/digests", icon: Mail },
  { label: "Me", to: "/me", icon: User },
];

export function BottomTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-panel border-t border-border safe-pb"
      aria-label="Primary"
    >
      <ul className="flex">
        {TABS.map((t) => {
          const active = pathname === t.to || pathname.startsWith(t.to + "/");
          const Icon = t.icon;
          return (
            <li key={t.to} className="flex-1">
              <Link
                to={t.to}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 h-[60px] transition-colors",
                  active
                    ? "text-accent"
                    : "text-text-muted hover:text-text-primary",
                )}
              >
                {active && (
                  <span className="absolute top-0 left-0 right-0 h-[2px] bg-accent" />
                )}
                <Icon className="w-6 h-6" />
                <span className="text-[10px] font-mono uppercase tracking-wider">
                  {t.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default BottomTabBar;