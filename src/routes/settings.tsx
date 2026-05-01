import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiSettings } from "@/components/settings/AiSettings";
import { TeamSettings } from "@/components/settings/TeamSettings";
import { PreferencesSettings } from "@/components/settings/PreferencesSettings";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — UroFeed" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="p-6">
      <Tabs defaultValue="preferences">
        <TabsList>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>
        <TabsContent value="preferences" className="mt-6">
          <PreferencesSettings />
        </TabsContent>
        <TabsContent value="ai" className="mt-6">
          <AiSettings />
        </TabsContent>
        <TabsContent value="team" className="mt-6">
          <TeamSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}