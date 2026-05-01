import { cn } from "@/lib/utils";
import type { Source } from "@/types";

const STYLES: Record<Source["role"], string> = {
  KOL: "bg-accent/10 text-accent border-accent/30",
  institution: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  journal: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  society: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  other: "bg-panel-elevated text-text-muted border-border",
};

const LABEL: Record<Source["role"], string> = {
  KOL: "KOL",
  institution: "INST",
  journal: "JRNL",
  society: "SOC",
  other: "OTHR",
};

export function RoleBadge({ role }: { role: Source["role"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 h-5 rounded-sm border font-mono text-[10px] uppercase tracking-wider",
        STYLES[role],
      )}
    >
      {LABEL[role]}
    </span>
  );
}