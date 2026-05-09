import * as React from "react";

/**
 * Routes that should NEVER show the mobile compose FAB.
 * Compose makes no sense in auth flows, settings, admin tooling, help,
 * configuration, or unsubscribe surfaces.
 */
const DENY_PREFIXES = [
  "/auth",
  "/settings",
  "/admin",
  "/help",
  "/configuration",
  "/unsubscribe",
];

function isDeniedRoute(pathname: string): boolean {
  return DENY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Watches whether the on-screen keyboard is visible (visualViewport heuristic).
 * iOS Safari reports the keyboard via visualViewport.height < window.innerHeight.
 */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const diff = window.innerHeight - vv.height;
      setVisible(diff > 120);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return visible;
}

/**
 * Watches whether any modal/dialog is currently open on the page.
 * Radix dialogs add `data-state="open"` on `[role="dialog"]` elements.
 */
function useDialogOpen(): boolean {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const check = () => {
      const any = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      );
      setOpen(!!any);
    };
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
      childList: true,
    });
    return () => obs.disconnect();
  }, []);
  return open;
}

export function useShouldShowComposeFab(pathname: string): boolean {
  const keyboardVisible = useKeyboardVisible();
  const dialogOpen = useDialogOpen();
  if (isDeniedRoute(pathname)) return false;
  if (keyboardVisible) return false;
  if (dialogOpen) return false;
  return true;
}