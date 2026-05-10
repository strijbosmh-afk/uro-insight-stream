import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

interface MobileSubPageProps {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  children: React.ReactNode;
}

export function MobileSubPage({
  title,
  onBack,
  rightAction,
  children,
}: MobileSubPageProps) {
  const router = useRouter();
  const handleBack =
    onBack ??
    (() => {
      if (window.history.length > 1) router.history.back();
      else router.navigate({ to: "/me" });
    });
  return (
    <div className="flex flex-col min-h-[calc(100dvh-60px)]">
      <header className="sticky top-0 z-30 bg-panel border-b border-border h-11 flex items-center px-2 gap-1">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back"
          className="h-11 w-11 -ml-2 flex items-center justify-center text-accent active:opacity-60"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="flex-1 text-center text-[16px] font-semibold text-text-primary truncate px-1">
          {title}
        </h1>
        <div className="min-w-[44px] h-11 flex items-center justify-end pr-1">
          {rightAction}
        </div>
      </header>
      <main className="flex-1 px-3 py-3 pb-6">{children}</main>
    </div>
  );
}

export default MobileSubPage;
