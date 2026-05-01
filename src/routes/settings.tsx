import { createFileRoute } from "@tanstack/react-router";
import { AiSettings } from "@/components/settings/AiSettings";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · AI — UroFeed" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="p-6">
      <AiSettings />
    </div>
  );
}