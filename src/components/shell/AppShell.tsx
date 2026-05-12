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
import { ComposeFAB } from "@/components/x/ComposeFAB";
import { BottomTabBar } from "./BottomTabBar";
import { DemoBanner } from "./DemoBanner";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useShouldShowComposeFab } from "@/hooks/useShouldShowComposeFab";
import { PostGraceBanner } from "@/components/x-wizard/PostGraceBanner";
import { PreGraceBanner } from "@/components/x-wizard/PreGraceBanner";
import { useWatchlistRealtime } from "@/hooks/useWatchlistRealtime";

export function AppShell() {
  const [collapsed, setCollapsed] = React.useState(false);
  const isMobile = useIsMobile();
  const { prefs, user } = useAuth();
  useWatchlistRealtime();
  const density = prefs?.theme_density ?? "comfortable";
  const gate = useOnboardingGate();
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [wizardLocked, setWizardLocked] = React.useState(false);
  const [wizardScope, setWizardScope] = React.useState<
    "Specialties" | "Congresses" | "Sources" | "Hashtags" | undefined
  >(undefined);
  const [bannerDismissed, setBannerDismissed] = React.useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  // <768px → phone. 768–1023 already shows the full sidebar (useIsMobile=false).
  const isPhone = isMobile;
  const showFab = useShouldShowComposeFab(pathname, { wizardOpen });

  const wizardLockKey = React.useMemo(() => {
    return user ? `urofeed:onboarding-closed:${user.id}` : null;
  }, [user]);

  // Mobile redirect: admin routes are desktop-only.
  React.useEffect(() => {
    if (isPhone && pathname.startsWith("/admin/")) {
      toast.message("Admin tools are desktop-only.", {
        description: "Open this URL on your computer.",
      });
      navigate({ to: "/me", replace: true });
    }
  }, [isPhone, pathname, navigate]);

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

  // Once the wizard finishes (or we observe a completed state) in this
  // session, never auto-open it again — even if a stale gate refetch
  // momentarily flips shouldOpenWizard back to true.
  const completedOnceRef = React.useRef(false);
  React.useEffect(() => {
    if (!wizardLockKey || typeof window === "undefined") return;
    const locked = window.localStorage.getItem(wizardLockKey) === "1";
    completedOnceRef.current = locked;
    setWizardLocked(locked);
  }, [wizardLockKey]);

  React.useEffect(() => {
    if (wizardLocked) return;
    if (!gate.shouldOpenWizard) {
      // The persisted onboarding state says the user finished/skipped it — lock it.
      if (!gate.loading && gate.finished) {
        completedOnceRef.current = true;
        setWizardLocked(true);
        if (wizardLockKey && typeof window !== "undefined") {
          window.localStorage.setItem(wizardLockKey, "1");
        }
      }
      return;
    }
    if (completedOnceRef.current) return;
    if (!wizardOpen) setWizardOpen(true);
  }, [gate.shouldOpenWizard, gate.loading, gate.finished, wizardOpen, wizardLocked, wizardLockKey]);

  // Reflect density on <html> so global tokens / utilities can react.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.density = density;
  }, [density]);

  // Stable style object -- a fresh object literal here used to break
  // React's prop-equality fast path on the root wrapper every render.
  const rootStyle = React.useMemo(
    () => ({ fontSize: density === "compact" ? "13px" : "14px" }),
    [density],
  );
  const toggleCollapsed = React.useCallback(
    () => setCollapsed((c) => !c),
    [],
  );

  return (
    <div
      className="h-[100dvh] w-screen flex flex-col bg-bg text-text-primary overflow-hidden safe-pl safe-pr"
      data-density={density}
      style={rootStyle}
    >
      <div className="flex-1 flex min-h-0">
        {/* Desktop sidebar */}
        {!isMobile && (
          <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
        )}

        {/* Phones use BottomTabBar — no hamburger drawer. */}

        <div className="flex-1 flex flex-col min-w-0">
          <div className="safe-pt">
            <TopBar onOpenMobileNav={undefined} />
          </div>
          <DemoBanner />
          <PostGraceBanner />
          <PreGraceBanner />
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
      {isPhone && showFab && <ComposeFAB />}
      {isPhone && <BottomTabBar />}
      {wizardOpen && (
        <OnboardingWizard
          initialStep={gate.currentStep}
          scopeStep={wizardScope}
          onClose={(reason) => {
            if (reason === "completed" || reason === "skipped") {
              completedOnceRef.current = true;
              setWizardLocked(true);
              if (wizardLockKey && typeof window !== "undefined") {
                window.localStorage.setItem(wizardLockKey, "1");
              }
            }
            setWizardOpen(false);
            setWizardScope(undefined);
          }}
        />
      )}
    </div>
  );
}

export default AppShell;