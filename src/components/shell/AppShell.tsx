import * as React from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";
import { useAuth } from "@/auth/AuthProvider";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";
import { OnboardingWizard } from "@/components/wizard/OnboardingWizard";
import { ResumeBanner } from "@/components/wizard/ResumeBanner";
import { useIsMobile } from "@/hooks/use-mobile";
import { BrainstormUnreadDialog } from "@/components/brainstorm/BrainstormUnreadDialog";
import { MobileComposeFab } from "./MobileComposeFab";
import { BottomTabBar } from "./BottomTabBar";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

export function AppShell() {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const isMobile = useIsMobile();
  const { prefs } = useAuth();
  const density = prefs?.theme_density ?? "comfortable";
  const gate = useOnboardingGate();
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [wizardScope, setWizardScope] = React.useState<
    "Specialties" | "Congresses" | "Sources" | "Hashtags" | undefined
  >(undefined);
  const [bannerDismissed, setBannerDismissed] = React.useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  // Phones (<768px) get a tab bar; tablets keep the drawer trigger.
  const isPhone = isMobile;
  const isTablet =
    typeof window !== "undefined" &&
    window.matchMedia("(min-width: 768px) and (max-width: 1023px)").matches;

  // Mobile redirect: admin routes are desktop-only.
  React.useEffect(() => {
    if (isPhone && pathname.startsWith("/admin/")) {
      toast.message("Admin tools are desktop-only.", {
        description: "Open this URL on your computer.",
      });
      navigate({ to: "/me", replace: true });
    }
  }, [isPhone, pathname, navigate]);

  // Close the mobile drawer on route change.
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    const handler = (
      e: CustomEvent<{ step: "Specialties" | "Congresses" | "Sources" | "Hashtags" }>,
    ) => {
      setWizardScope(e.detail.step);
      setWizardOpen(true);
    };
    window.addEventListener("urofeed:open-wizard-step", handler as EventListener);
    return () => window.removeEventListener("urofeed:open-wizard-step", handler as EventListener);
  }, []);

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
      className="h-[100dvh] w-screen flex flex-col bg-bg text-text-primary overflow-hidden safe-pl safe-pr"
      data-density={density}
      style={{ fontSize: density === "compact" ? "13px" : "14px" }}
    >
      <div className="flex-1 flex min-h-0">
        {/* Desktop sidebar */}
        {!isMobile && (
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        )}

        {/* Tablet drawer (phones use BottomTabBar instead) */}
        {isMobile && !isPhone && mobileNavOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
              aria-hidden
            />
            <div className="fixed inset-y-0 left-0 z-50 safe-pt safe-pb flex">
              <Sidebar collapsed={false} onToggle={() => setMobileNavOpen(false)} />
            </div>
          </>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <div className="safe-pt">
            <TopBar
              onOpenMobileNav={
                isMobile && !isPhone ? () => setMobileNavOpen(true) : undefined
              }
            />
          </div>
          {!wizardOpen &&
            gate.needsResumeBanner &&
            !bannerDismissed &&
            pathname === "/dashboard" && (
              <ResumeBanner
                onResume={() => setWizardOpen(true)}
                onDismiss={() => setBannerDismissed(true)}
              />
            )}
          <main
            className={
              "flex-1 min-h-0 overflow-auto ios-scroll p-3 sm:p-3 " +
              (isPhone ? "pb-24" : "")
            }
          >
            <Outlet />
          </main>
        </div>
      </div>
      {!isMobile && <StatusBar />}
      <BrainstormUnreadDialog />
      {isMobile && <MobileComposeFab />}
      {isPhone && <BottomTabBar />}
      {/* keep helper to avoid unused-var */}
      <span className="hidden">{isTablet ? "t" : ""}</span>
      {wizardOpen && (
        <OnboardingWizard
          initialStep={gate.currentStep}
          scopeStep={wizardScope}
          onClose={() => {
            setWizardOpen(false);
            setWizardScope(undefined);
          }}
        />
      )}
    </div>
  );
}

export default AppShell;