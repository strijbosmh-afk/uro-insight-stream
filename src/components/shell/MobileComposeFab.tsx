import * as React from "react";
import { Plus } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useShouldShowComposeFab } from "@/hooks/useShouldShowComposeFab";
import { ComposeTweetDialog } from "@/components/x/ComposeTweetDialog";

/**
 * Floating action button anchored to the bottom-right on mobile.
 * Visible on most app routes, hidden on auth/settings/admin/help/etc.,
 * any time a dialog is open, or while the on-screen keyboard is up.
 */
export function MobileComposeFab() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const shouldShow = useShouldShowComposeFab(pathname);
  const [open, setOpen] = React.useState(false);

  if (!shouldShow) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Share to X"
        title="Share to X"
        className="
          fixed z-30 bottom-6 right-4
          h-14 w-14 rounded-full
          bg-accent text-accent-foreground
          shadow-lg shadow-black/30
          flex items-center justify-center
          active:scale-95 transition-transform
          safe-pb-fab
        "
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        <Plus className="w-6 h-6" />
      </button>
      <ComposeTweetDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default MobileComposeFab;