import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";

export const Route = createFileRoute("/summaries")({
  head: () => ({ meta: [{ title: "Summaries — UroFeed" }] }),
  component: SummariesPage,
});

function SummariesPage() {
  return (
    <PlaceholderPage
      title="Summaries"
      description="AI-generated session and abstract summaries. Backed by aiService.summarize(tweets, context)."
    />
  );
}