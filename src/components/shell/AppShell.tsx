import * as React from "react";
import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";
import { useAuth } from "@/auth/AuthProvider";

export function AppShell() {
  const [collapsed, setCollapsed] = React.useState(false);
  const { prefs } = useAuth();
  const density = prefs?.theme_density ?? "comfortable";

  // Reflect density on <html> so global tokens / utilities can react.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.density = density;
  }, [density]);

  return (
    <div
      className="h-screen w-screen flex flex-col bg-bg text-text-primary overflow-hidden"
      data-density={density}
      style={{ fontSize: density === "compact" ? "13px" : "14px" }}
    >
      <div className="flex-1 flex min-h-0">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 min-h-0 overflow-auto p-3">
            <Outlet />
          </main>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}

export default AppShell;