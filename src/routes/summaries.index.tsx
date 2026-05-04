import { createFileRoute } from "@tanstack/react-router";
import { SummariesIndex } from "@/components/summaries/SummariesIndex";

export const Route = createFileRoute("/summaries/")({
  head: () => ({ meta: [{ title: "Summaries — UroFeed" }] }),
  component: SummariesPage,
});

function SummariesPage() {
  return <SummariesIndex />;
}