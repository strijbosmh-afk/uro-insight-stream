import * as React from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";
import { useAuth } from "@/auth/AuthProvider";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";
import { OnboardingWizard } from "@/components/wizard/OnboardingWizard";
import { ResumeBanner } from "@/components/wizard/ResumeBanner";

export function AppShell() {
  const [collapsed, setCollapsed] = React.useState(false);
  const { prefs } = useAuth();
  const density = prefs?.theme_density ?? "comfortable";
  const gate = useOnboardingGate();
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [bannerDismissed, setBannerDismissed] = React.useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  React.useEffect(() => {
    if (gate.shouldOpenWizard && !wizardOpen) setWizardOpen(true);
  }, [gate.shouldOpenWizard, wizardOpen]);

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
          {!wizardOpen &&
            gate.needsResumeBanner &&
            !bannerDismissed &&
            pathname === "/dashboard" && (
              <ResumeBanner
                onResume={() => setWizardOpen(true)}
                onDismiss={() => setBannerDismissed(true)}
              />
            )}
          <main className="flex-1 min-h-0 overflow-auto p-3">
            <Outlet />
          </main>
        </div>
      </div>
      <StatusBar />
      {wizardOpen && (
        <OnboardingWizard
          initialStep={gate.currentStep}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
}

export default AppShell;