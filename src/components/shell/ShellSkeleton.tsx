import * as React from "react";
import { Sidebar } from "./Sidebar";
import { Panel } from "./Panel";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Full app shell rendered while the initial auth check is in flight.
 * Mirrors the real AppShell layout but every panel is in its `loading`
 * state, so the user sees the cyan progress border instead of a blank
 * white screen. Uses no data dependencies so it can render before any
 * provider has resolved.
 */
export function ShellSkeleton() {
  const isMobile = useIsMobile();
  return (
    <div className="h-[100dvh] w-screen flex flex-col bg-bg text-text-primary overflow-hidden safe-pl safe-pr">
      <div className="flex-1 flex min-h-0">
        {!isMobile && <Sidebar collapsed={false} onToggle={() => {}} />}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Static top bar shimmer */}
          <header className="h-10 shrink-0 border-b border-border bg-panel flex items-center px-3 gap-3 safe-pt">
            <div className="h-3 w-32 bg-border/40 rounded-sm" />
            <div className="flex-1" />
            <div className="h-3 w-20 bg-border/40 rounded-sm" />
          </header>
          <main className="flex-1 min-h-0 overflow-auto ios-scroll p-3">
            <div className="grid grid-cols-1 md:grid-cols-12 md:grid-rows-6 gap-3 h-full">
              <Panel
                title="Workspace"
                loading
                className="md:col-span-12 md:row-span-2 min-h-[120px]"
              >
                <div className="h-full" />
              </Panel>
              <Panel
                title="Live activity"
                loading
                className="md:col-span-7 md:row-span-4 min-h-[200px]"
              >
                <div className="h-full" />
              </Panel>
              <Panel
                title="Sources"
                loading
                className="md:col-span-5 md:row-span-4 min-h-[200px]"
              >
                <div className="h-full" />
              </Panel>
            </div>
          </main>
        </div>
      </div>
      {/* Static status bar matching real layout */}
      <footer className="h-6 shrink-0 hidden sm:flex items-center gap-3 px-3 border-t border-border bg-panel text-[10px] font-mono uppercase tracking-wider">
        <span className="text-text-muted">auth:</span>
        <span className="text-warning">checking…</span>
        <span className="text-border">│</span>
        <span className="text-text-muted">session:</span>
        <span>—</span>
        <div className="flex-1" />
        <span className="text-text-muted">status:</span>
        <span className="text-accent">restoring</span>
      </footer>
      <div className="sm:hidden safe-pb bg-panel" />
    </div>
  );
}

export default ShellSkeleton;