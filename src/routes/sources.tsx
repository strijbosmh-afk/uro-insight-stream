import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";

export const Route = createFileRoute("/sources")({
  head: () => ({ meta: [{ title: "Sources — UroFeed" }] }),
  component: SourcesPage,
});

function SourcesPage() {
  return (
    <PlaceholderPage
      title="Sources"
      description="Manage monitored X/Twitter accounts and hashtags. Fully editable — no hardcoded handles."
    />
  );
}