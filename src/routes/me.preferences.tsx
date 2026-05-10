import { createFileRoute } from "@tanstack/react-router";
import { MobileSubPage } from "@/components/shell/MobileSubPage";
import { PreferencesSettings } from "@/components/settings/PreferencesSettings";

export const Route = createFileRoute("/me/preferences")({
  head: () => ({ meta: [{ title: "Preferences — UroFeed" }] }),
  component: MePreferencesPage,
});

function MePreferencesPage() {
  return (
    <MobileSubPage title="Preferences">
      <PreferencesSettings />
    </MobileSubPage>
  );
}
