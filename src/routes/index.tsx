import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — UroFeed" }] }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <PlaceholderPage
      title="Dashboard"
      description="Operational overview of monitored congresses, source health, and AI summarization throughput. Widgets land here in the next step."
    />
  );
}