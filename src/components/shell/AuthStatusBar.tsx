import * as React from "react";

/**
 * Slim status bar for the /auth page. Same visual language as the main
 * StatusBar — same height, mono caps, pipe separators — but populated
 * with auth-relevant fields so the page feels coherent with the rest of
 * the app.
 */
export function AuthStatusBar({
  state = "ready",
}: {
  state?: "ready" | "signing-in" | "sending-link" | "completing-invite" | "resetting";
}) {
  const [time, setTime] = React.useState<string>("--:--:--");
  React.useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const stateTone =
    state === "ready" ? "text-success" : "text-warning";

  return (
    <footer className="h-6 shrink-0 flex items-center gap-3 px-3 border-t border-border bg-panel text-[10px] font-mono uppercase tracking-wider">
      <span className="flex items-center gap-1.5">
        <span className="text-text-muted">auth:</span>
        <span className={stateTone}>{state.replace("-", " ")}</span>
      </span>
      <span className="text-border">│</span>
      <span className="flex items-center gap-1.5">
        <span className="text-text-muted">session:</span>
        <span className="text-text-primary">none</span>
      </span>
      <span className="text-border">│</span>
      <span className="flex items-center gap-1.5">
        <span className="text-text-muted">build:</span>
        <span className="text-text-primary">v0.1</span>
      </span>
      <div className="flex-1" />
      <span className="flex items-center gap-1.5">
        <span className="text-text-muted">⏱</span>
        <span className="text-text-primary" suppressHydrationWarning>
          {time}
        </span>
      </span>
    </footer>
  );
}

export default AuthStatusBar;