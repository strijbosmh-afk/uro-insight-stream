import * as React from "react";
import { Sidebar } from "./Sidebar";
import { Panel } from "./Panel";

/**
 * Full app shell rendered while the initial auth check is in flight.
 * Mirrors the real AppShell layout but every panel is in its `loading`
 * state, so the user sees the cyan progress border instead of a blank
 * white screen. Uses no data dependencies so it can render before any
 * provider has resolved.
 */
export function ShellSkeleton() {
  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-text-primary overflow-hidden">
      <div className="flex-1 flex min-h-0">
        <Sidebar collapsed={false} onToggle={() => {}} />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Static top bar shimmer */}
          <header className="h-10 shrink-0 border-b border-border bg-panel flex items-center px-3 gap-3">
            <div className="h-3 w-32 bg-border/40 rounded-sm" />
            <div className="flex-1" />
            <div className="h-3 w-20 bg-border/40 rounded-sm" />
          </header>
          <main className="flex-1 min-h-0 overflow-auto p-3">
            <div className="grid grid-cols-12 grid-rows-6 gap-3 h-full">
              <Panel
                title="Workspace"
                loading
                className="col-span-12 row-span-2"
              >
                <div className="h-full" />
              </Panel>
              <Panel
                title="Live activity"
                loading
                className="col-span-7 row-span-4"
              >
                <div className="h-full" />
              </Panel>
              <Panel
                title="Sources"
                loading
                className="col-span-5 row-span-4"
              >
                <div className="h-full" />
              </Panel>
            </div>
          </main>
        </div>
      </div>
      {/* Static status bar matching real layout */}
      <footer className="h-6 shrink-0 flex items-center gap-3 px-3 border-t border-border bg-panel text-[10px] font-mono uppercase tracking-wider">
        <span className="text-text-muted">auth:</span>
        <span className="text-warning">checking…</span>
        <span className="text-border">│</span>
        <span className="text-text-muted">session:</span>
        <span>—</span>
        <div className="flex-1" />
        <span className="text-text-muted">status:</span>
        <span className="text-accent">restoring</span>
      </footer>
    </div>
  );
}

export default ShellSkeleton;