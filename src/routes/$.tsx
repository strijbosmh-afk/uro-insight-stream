import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Panel } from "@/components/shell/Panel";

export const Route = createFileRoute("/$")({
  head: () => ({ meta: [{ title: "Not found — UroFeed" }] }),
  component: NotFoundCatchAll,
});

function NotFoundCatchAll() {
  const navigate = useNavigate();
  const [seconds, setSeconds] = React.useState(3);

  React.useEffect(() => {
    if (seconds <= 0) {
      navigate({ to: "/dashboard" });
      return;
    }
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds, navigate]);

  return (
    <div className="grid grid-cols-12 gap-3 h-full">
      <Panel
        title="Not found"
        className="col-span-12"
        actions={
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted px-2">
            view · default
          </span>
        }
      >
        <div className="flex flex-col items-start gap-2">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-warning">
            error · route not registered
          </div>
          <div className="text-sm text-text-primary">
            route does not exist · returning to dashboard in{" "}
            <span className="font-mono text-accent">{seconds}s</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}