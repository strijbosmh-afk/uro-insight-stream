import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type AdminUser } from "./types";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-wider font-mono text-text-muted">
      {children}
    </div>
  );
}

function MemberRow({
  user,
  online,
  isMe,
}: {
  user: AdminUser;
  online: boolean;
  isMe: boolean;
}) {
  const name = user.display_name ?? user.email ?? "Unknown";
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-1.5 text-sm",
        online ? "text-text-primary" : "text-text-muted",
      )}
    >
      <div className="relative">
        <div
          className={cn(
            "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold border",
            online
              ? "bg-accent/15 border-accent/40 text-text-primary"
              : "bg-panel-elevated border-border text-text-muted",
          )}
        >
          {initials || "?"}
        </div>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-panel",
            online ? "bg-success" : "bg-text-muted/40",
          )}
        />
      </div>
      <div className="min-w-0 flex-1 truncate">
        {name}
        {isMe && <span className="ml-1 text-[10px] text-text-muted">(you)</span>}
      </div>
    </div>
  );
}

export function PresenceList({
  admins,
  onlineIds,
  currentUserId,
  className,
}: {
  admins: AdminUser[];
  onlineIds: Set<string>;
  currentUserId: string;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "hidden md:flex flex-col w-60 shrink-0 border-l border-border bg-panel min-h-0",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border shrink-0">
        <Users className="w-4 h-4 text-text-muted" />
        <h2 className="text-sm font-semibold text-text-primary">Members</h2>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {admins.length}
        </Badge>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {admins.length === 0 ? (
          <div className="px-4 py-3 text-xs text-text-muted">No members</div>
        ) : (
          <>
            {admins.some((a) => onlineIds.has(a.id)) && (
              <SectionLabel>Online</SectionLabel>
            )}
            {admins
              .filter((a) => onlineIds.has(a.id))
              .map((a) => (
                <MemberRow
                  key={a.id}
                  user={a}
                  online
                  isMe={a.id === currentUserId}
                />
              ))}
            {admins.some((a) => !onlineIds.has(a.id)) && (
              <SectionLabel>Offline</SectionLabel>
            )}
            {admins
              .filter((a) => !onlineIds.has(a.id))
              .map((a) => (
                <MemberRow
                  key={a.id}
                  user={a}
                  online={false}
                  isMe={a.id === currentUserId}
                />
              ))}
          </>
        )}
      </div>
    </aside>
  );
}