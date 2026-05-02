import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiSettings } from "@/components/settings/AiSettings";
import { TeamSettings } from "@/components/settings/TeamSettings";
import { PreferencesSettings } from "@/components/settings/PreferencesSettings";
import { IngestionSettings } from "@/components/settings/IngestionSettings";
import { InterestsSettings } from "@/components/settings/InterestsSettings";
import { useAuth } from "@/auth/AuthProvider";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — UroFeed" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { isAdmin } = useAuth();
  return (
    <div className="p-6">
      <Tabs defaultValue="preferences">
        <TabsList>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="interests">Interests</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          {isAdmin && <TabsTrigger value="ingestion">Ingestion</TabsTrigger>}
        </TabsList>
        <TabsContent value="preferences" className="mt-6">
          <PreferencesSettings />
        </TabsContent>
        <TabsContent value="interests" className="mt-6">
          <InterestsSettings />
        </TabsContent>
        <TabsContent value="ai" className="mt-6">
          <AiSettings />
        </TabsContent>
        <TabsContent value="team" className="mt-6">
          <TeamSettings />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="ingestion" className="mt-6">
            <IngestionSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}