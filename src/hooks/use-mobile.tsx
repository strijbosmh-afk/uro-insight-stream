import * as React from "react";

const MOBILE_BREAKPOINT = 768;

// Initialise from window synchronously so consumers don't paint once
// with `undefined` (treated as false) and then flip on the next tick
// — that double-render produced a visible layout shift on mobile when
// AppShell decided whether to render the desktop sidebar vs the bottom
// tab bar, and forced any subtree depending on isMobile to reconcile.
function readIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(readIsMobile);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    // Sync once in case the viewport changed between SSR and hydration.
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
