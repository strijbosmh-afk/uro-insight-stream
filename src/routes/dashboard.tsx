import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { buildSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/dashboard")({
  head: () =>
    buildSeoHead({
      title: "Dashboard",
      description:
        "Your UroFeed command center: live activity, top urology sources, congress highlights and curated AI summaries at a glance.",
      path: "/dashboard",
    }),
  beforeLoad: () => {
    // Mobile viewports get the Live Feed instead of the Dashboard.
    // SSR has no window — the client effect below handles post-hydration.
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      throw redirect({ to: "/feed" });
    }
  },
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      if (window.innerWidth < 768) navigate({ to: "/feed", replace: true });
    };
    check();
  }, [navigate]);
  return <Dashboard />;
}