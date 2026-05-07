import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type Emoji, type Reaction } from "./types";

export function ReactionsBar({
  reactions,
  currentUserId,
  isOwn,
  onReact,
}: {
  reactions: Reaction[];
  currentUserId: string;
  isOwn: boolean;
  onReact: (e: Emoji) => void;
}) {
  const reactionEntries = React.useMemo(() => {
    const grouped = new Map<Emoji, string[]>();
    for (const r of reactions) {
      const arr = grouped.get(r.emoji) ?? [];
      arr.push(r.user_id);
      grouped.set(r.emoji, arr);
    }
    return Array.from(grouped.entries());
  }, [reactions]);

  if (reactionEntries.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1 mt-1", isOwn ? "justify-end" : "")}>
      {reactionEntries.map(([emoji, ids]) => {
        const mine = ids.includes(currentUserId);
        return (
          <Tooltip key={emoji}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onReact(emoji as Emoji)}
                className={cn(
                  "text-[11px] px-1.5 py-0.5 rounded-full border flex items-center gap-1 transition-colors",
                  mine
                    ? "border-accent/60 bg-accent/15 text-text-primary"
                    : "border-border bg-panel-elevated/60 text-text-muted hover:text-text-primary",
                )}
              >
                <span>{emoji}</span>
                <span>{ids.length}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">{ids.length} reactor(s)</div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}