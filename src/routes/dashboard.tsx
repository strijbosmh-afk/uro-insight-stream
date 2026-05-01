import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — UroFeed" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  return <Dashboard />;
}