import * as React from "react";
import { useLiveKpis } from "@/hooks/useLiveKpis";
import { feedBackend } from "@/services/feedService";
import { cn } from "@/lib/utils";

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

function BackendChip() {
  // mock = warning, api = success
  const { color, label } = {
    mock: { color: "text-warning border-warning/40", label: "mock" },
    api: { color: "text-success border-success/40", label: "api" },
  }[feedBackend];
  return (
    <span
      className={cn(
        "px-1.5 py-[1px] border rounded-[2px] font-mono text-[9px] uppercase tracking-wider",
        color,
      )}
      title={`Feed backend: ${label}`}
    >
      {label}
    </span>
  );
}

export function StatusBar() {
  const now = useClock();
  const { data: kpis } = useLiveKpis(30_000);
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
        <K>sources:</K>
        <V>{kpis?.activeSources ?? "—"}</V>
      </Cell>
      <span className="text-border">│</span>
      <Cell>
        <K>tags:</K>
        <V>{kpis?.activeHashtags ?? "—"}</V>
      </Cell>
      <span className="text-border">│</span>
      <Cell>
        <K>tweets/min:</K>
        <V tone={kpis && kpis.tweetsPerMin > 0 ? "success" : "primary"}>
          {kpis ? kpis.tweetsPerMin.toFixed(1) : "—"}
        </V>
      </Cell>
      <span className="text-border">│</span>
      <Cell>
        <K>24h:</K>
        <V>{kpis?.tweetsLast24h ?? "—"}</V>
      </Cell>
      <span className="text-border">│</span>
      <Cell>
        <K>backend:</K>
        <BackendChip />
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