import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiSettings } from "@/components/settings/AiSettings";
import { PreferencesSettings } from "@/components/settings/PreferencesSettings";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { NotificationsSettings } from "@/components/settings/NotificationsSettings";
import { XSettings } from "@/components/settings/XSettings";
import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — UroFeed" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const isMobile = useIsMobile();
  const rootNav = useNavigate();
  const valid = ["profile", "preferences", "notifications", "ai", "x"] as const;
  const initial = (valid as readonly string[]).includes(search.tab ?? "")
    ? (search.tab as string)
    : "profile";
  const [tab, setTab] = React.useState<string>(initial);
  React.useEffect(() => {
    if (search.tab && search.tab !== tab) setTab(search.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.tab]);
  React.useEffect(() => {
    if (!isMobile) return;
    const map: Record<string, string> = {
      profile: "/me/profile",
      preferences: "/me/preferences",
      notifications: "/me/notifications",
      ai: "/me/ai",
      x: "/me/x-account",
    };
    const target = map[tab] ?? "/me";
    rootNav({ to: target, replace: true });
  }, [isMobile, tab, rootNav]);
  return (
    <div className="p-6">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          navigate({ search: { tab: v }, replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="x">X account</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          <ProfileSettings />
        </TabsContent>
        <TabsContent value="preferences" className="mt-6">
          <PreferencesSettings />
        </TabsContent>
        <TabsContent value="notifications" className="mt-6">
          <NotificationsSettings />
        </TabsContent>
        <TabsContent value="ai" className="mt-6">
          <AiSettings />
        </TabsContent>
        <TabsContent value="x" className="mt-6">
          <XSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}