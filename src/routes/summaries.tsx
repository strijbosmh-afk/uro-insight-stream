import { createFileRoute } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/summaries")({
  head: () => ({ meta: [{ title: "Summaries — UroFeed" }] }),
  component: SummariesLayout,
});

function SummariesLayout() {
  return <Outlet />;
}