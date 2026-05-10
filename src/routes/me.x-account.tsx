import { createFileRoute } from "@tanstack/react-router";
import { MobileSubPage } from "@/components/shell/MobileSubPage";
import { XSettings } from "@/components/settings/XSettings";

export const Route = createFileRoute("/me/x-account")({
  head: () => ({ meta: [{ title: "X account — UroFeed" }] }),
  component: MeXAccountPage,
});

function MeXAccountPage() {
  return (
    <MobileSubPage title="X account">
      <XSettings />
    </MobileSubPage>
  );
}
