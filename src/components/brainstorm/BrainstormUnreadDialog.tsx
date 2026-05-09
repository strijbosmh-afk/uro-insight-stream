import * as React from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Lightbulb } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useBrainstormUnread } from "@/hooks/useBrainstormUnread";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const SESSION_KEY_PREFIX = "brainstorm:unreadDialogShown:";
const DISABLE_KEY = "brainstorm:disableUnreadDialog";

/**
 * Shows a one-time popup per browser session to admins who have unread
 * Brainstorm messages waiting for them after they log in.
 */
export function BrainstormUnreadDialog() {
  const { isAdmin, user, loading } = useAuth();
  const { unread, markRead } = useBrainstormUnread();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = React.useState(false);
  const [dontShow, setDontShow] = React.useState(false);
  const evaluatedRef = React.useRef(false);

  React.useEffect(() => {
    if (loading || !isAdmin || !user) return;
    if (evaluatedRef.current) return;
    if (pathname.startsWith("/configuration/brainstorm")) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISABLE_KEY) === "1") return;
    // Skip entirely if we don't have a user id — better than showing the
    // dialog under a shared/static key to potentially the wrong account.
    const userId = user.id;
    if (!userId) return;
    const key = `${SESSION_KEY_PREFIX}${userId}`;
    if (sessionStorage.getItem(key) === "1") return;
    if (unread <= 0) return;
    evaluatedRef.current = true;
    sessionStorage.setItem(key, "1");
    setOpen(true);
  }, [loading, isAdmin, user, unread, pathname]);

  const goToBrainstorm = () => {
    if (dontShow && typeof window !== "undefined") {
      localStorage.setItem(DISABLE_KEY, "1");
    }
    setOpen(false);
    void navigate({ to: "/configuration/brainstorm" });
  };

  const dismiss = () => {
    if (dontShow && typeof window !== "undefined") {
      localStorage.setItem(DISABLE_KEY, "1");
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-accent/10 border border-accent/40 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-accent" />
            </div>
            <div>
              <DialogTitle>New Brainstorm activity</DialogTitle>
              <DialogDescription>
                {unread === 1
                  ? "You have 1 unread message in the team brainstorm."
                  : `You have ${unread} unread messages in the team brainstorm.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <label className="flex items-center gap-2 text-[13px] text-text-muted cursor-pointer select-none">
          <Checkbox
            checked={dontShow}
            onCheckedChange={(v) => setDontShow(v === true)}
          />
          Don't show this popup again
        </label>
        <DialogFooter className="sm:justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              markRead();
              dismiss();
            }}
          >
            Mark as read
          </Button>
          <Button onClick={goToBrainstorm}>Open Brainstorm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}