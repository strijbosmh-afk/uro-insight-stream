import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — UroFeed" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <PlaceholderPage
      title="Settings"
      description="Workspace, API keys, polling interval, and AI model configuration."
    />
  );
}