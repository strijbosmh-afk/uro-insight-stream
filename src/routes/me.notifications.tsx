import { createFileRoute } from "@tanstack/react-router";
import { MobileSubPage } from "@/components/shell/MobileSubPage";
import { NotificationsSettings } from "@/components/settings/NotificationsSettings";

export const Route = createFileRoute("/me/notifications")({
  head: () => ({ meta: [{ title: "Notifications — UroFeed" }] }),
  component: MeNotificationsPage,
});

function MeNotificationsPage() {
  return (
    <MobileSubPage title="Notifications">
      <NotificationsSettings />
    </MobileSubPage>
  );
}
