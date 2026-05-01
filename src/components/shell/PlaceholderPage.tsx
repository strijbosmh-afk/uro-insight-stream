import * as React from "react";
import { Panel } from "./Panel";

interface PlaceholderPageProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function PlaceholderPage({
  title,
  description,
  children,
}: PlaceholderPageProps) {
  return (
    <div className="grid grid-cols-12 gap-3 h-full">
      <Panel
        title={title}
        className="col-span-12"
        actions={
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted px-2">
            view · default
          </span>
        }
      >
        <div className="flex flex-col items-start gap-2 text-text-muted">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-accent">
            module ready · awaiting data layer
          </div>
          <div className="text-sm text-text-primary">{title}</div>
          {description && (
            <p className="text-[13px] max-w-prose leading-relaxed">
              {description}
            </p>
          )}
          {children}
        </div>
      </Panel>
    </div>
  );
}

export default PlaceholderPage;