import { createFileRoute } from "@tanstack/react-router";
import { MobileSubPage } from "@/components/shell/MobileSubPage";
import { AiSettings } from "@/components/settings/AiSettings";

export const Route = createFileRoute("/me/ai")({
  head: () => ({ meta: [{ title: "AI settings — UroFeed" }] }),
  component: MeAiPage,
});

function MeAiPage() {
  return (
    <MobileSubPage title="AI settings">
      <AiSettings />
    </MobileSubPage>
  );
}
