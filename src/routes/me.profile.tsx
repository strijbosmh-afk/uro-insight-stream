import { createFileRoute } from "@tanstack/react-router";
import { MobileSubPage } from "@/components/shell/MobileSubPage";
import { ProfileSettings } from "@/components/settings/ProfileSettings";

export const Route = createFileRoute("/me/profile")({
  head: () => ({ meta: [{ title: "Profile — UroFeed" }] }),
  component: MeProfilePage,
});

function MeProfilePage() {
  return (
    <MobileSubPage title="Profile">
      <ProfileSettings />
    </MobileSubPage>
  );
}
