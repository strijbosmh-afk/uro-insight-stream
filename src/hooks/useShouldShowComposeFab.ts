import * as React from "react";

/**
 * Allow-listed routes where the mobile compose FAB should appear.
 * Anything else (auth, settings, admin, help, configuration, unsubscribe,
 * /me/*, etc.) hides the FAB.
 */
const ALLOW_EXACT = new Set<string>([
  "/",
  "/feed",
  "/discover",
  "/digests",
  "/dashboard",
  "/summaries",
  "/congresses",
  "/sources",
]);
const ALLOW_PREFIXES = [
  "/feed/",
  "/discover/",
  "/digests/",
  "/congresses/",
  "/sessions/",
];

function isAllowedRoute(pathname: string): boolean {
  if (ALLOW_EXACT.has(pathname)) return true;
  return ALLOW_PREFIXES.some((p) => pathname.startsWith(p));
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

export function useShouldShowComposeFab(
  pathname: string,
  opts?: { wizardOpen?: boolean },
): boolean {
  const keyboardVisible = useKeyboardVisible();
  const dialogOpen = useDialogOpen();
  if (!isAllowedRoute(pathname)) return false;
  if (opts?.wizardOpen) return false;
  if (keyboardVisible) return false;
  if (dialogOpen) return false;
  return true;
}