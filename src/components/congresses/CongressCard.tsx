import * as React from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Calendar, Users, FileText, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Congress } from "@/types";
import { StatusPill } from "./StatusPill";
import { deriveCongressStatus } from "@/lib/congress-status";

function fmtRange(a: string, b: string) {
  const start = new Date(a);
  const end = new Date(b);
  const sameMonth =
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear();
  const opt: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  const left = start.toLocaleDateString("en-GB", opt);
  const right = sameMonth
    ? `${end.getUTCDate()}, ${end.getUTCFullYear()}`
    : end.toLocaleDateString("en-GB", { ...opt, year: "numeric" });
  return `${left} – ${right}`;
}

export function CongressCard({
  congress,
  sourceCount,
  sessionCount,
  lastSyncIso,
}: {
  congress: Congress;
  sourceCount: number;
  sessionCount: number;
  lastSyncIso?: string;
}) {
  const lastSync = lastSyncIso
    ? new Date(lastSyncIso).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <Link
      to="/congresses/$congressId"
      params={{ congressId: congress.id }}
      className={cn(
        "group relative flex flex-col border border-border rounded-[4px] bg-panel",
        "hover:border-accent/60 hover:bg-panel-elevated/40 focus:outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent/60 transition-colors",
      )}
    >
      {/* accent rail */}
      <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent/0 group-hover:bg-accent transition-colors" />

      <div className="p-4 pl-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-muted">
            {congress.shortCode}
          </div>
          <h3
            className="mt-1 font-semibold text-text-primary leading-tight truncate"
            style={{ fontSize: "var(--text-size-title)" }}
          >
            {congress.name}
          </h3>
        </div>
        <StatusPill
          status={deriveCongressStatus(
            congress.startDate,
            congress.endDate,
            congress.status,
          )}
        />
      </div>

      <div className="px-4 pl-5 pb-3 space-y-1.5 text-[12px] text-text-muted">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3 h-3" />
          <span className="font-mono">{fmtRange(congress.startDate, congress.endDate)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3 h-3" />
          <span>
            {congress.city}, {congress.country}
          </span>
        </div>
      </div>

      <div className="px-4 pl-5 pb-3 flex flex-wrap gap-1">
        {congress.primaryHashtags.slice(0, 4).map((h) => (
          <span
            key={h}
            className="px-1.5 h-5 inline-flex items-center text-[10px] font-mono text-accent border border-accent/30 bg-accent/5 rounded-[2px]"
          >
            {h}
          </span>
        ))}
      </div>

      <div className="mt-auto border-t border-border px-4 pl-5 py-2 grid grid-cols-3 gap-2 text-[11px] font-mono text-text-muted">
        <div className="flex items-center gap-1.5">
          <Users className="w-3 h-3" />
          <span className="text-text-primary">{sourceCount}</span>
          <span>src</span>
        </div>
        <div className="flex items-center gap-1.5">
          <FileText className="w-3 h-3" />
          <span className="text-text-primary">{sessionCount}</span>
          <span>sess</span>
        </div>
        <div className="flex items-center gap-1.5 justify-end">
          <Clock className="w-3 h-3" />
          <span>{lastSync}</span>
        </div>
      </div>
    </Link>
  );
}

export default CongressCard;