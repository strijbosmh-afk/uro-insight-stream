import * as React from "react";

function useClock() {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Cell({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center gap-1.5">{children}</span>;
}

function K({ children }: { children: React.ReactNode }) {
  return <span className="text-text-muted">{children}</span>;
}

function V({
  children,
  tone = "primary",
}: {
  children: React.ReactNode;
  tone?: "primary" | "accent" | "success" | "warning";
}) {
  const cls =
    tone === "accent"
      ? "text-accent"
      : tone === "success"
        ? "text-success"
        : tone === "warning"
          ? "text-warning"
          : "text-text-primary";
  return <span className={cls}>{children}</span>;
}

export function StatusBar() {
  const now = useClock();
  const time = now
    ? now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "--:--:--";

  return (
    <footer className="h-6 shrink-0 flex items-center gap-3 px-3 border-t border-border bg-panel text-[10px] font-mono uppercase tracking-wider">
      <Cell>
        <K>congress:</K>
        <V tone="accent">EAU26</V>
      </Cell>
      <span className="text-border">│</span>
      <Cell>
        <K>sources:</K>
        <V>47</V>
      </Cell>
      <span className="text-border">│</span>
      <Cell>
        <K>tweets/min:</K>
        <V tone="success">12.3</V>
      </Cell>
      <span className="text-border">│</span>
      <Cell>
        <K>ai:</K>
        <V>gpt-4o-mini</V>
      </Cell>
      <div className="flex-1" />
      <Cell>
        <K>poll:</K>
        <V>30s</V>
      </Cell>
      <span className="text-border">│</span>
      <Cell>
        <K>⏱</K>
        <V>{time} CET</V>
      </Cell>
    </footer>
  );
}

export default StatusBar;