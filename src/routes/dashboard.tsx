import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — UroFeed" }] }),
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