import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";

export const Route = createFileRoute("/congresses")({
  head: () => ({ meta: [{ title: "Congresses — UroFeed" }] }),
  component: CongressesPage,
});

function CongressesPage() {
  return (
    <PlaceholderPage
      title="Congresses"
      description="Curated registry of EAU, AUA, SIU, ESMO-GU and more. Each congress holds its own sessions, abstracts, and source bindings."
    />
  );
}