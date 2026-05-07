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

const SESSION_KEY = "brainstorm:unreadDialogShown";

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
  const evaluatedRef = React.useRef(false);

  React.useEffect(() => {
    if (loading || !isAdmin || !user) return;
    if (evaluatedRef.current) return;
    if (pathname.startsWith("/configuration/brainstorm")) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
    if (unread <= 0) return;
    evaluatedRef.current = true;
    sessionStorage.setItem(SESSION_KEY, "1");
    setOpen(true);
  }, [loading, isAdmin, user, unread, pathname]);

  const goToBrainstorm = () => {
    setOpen(false);
    void navigate({ to: "/configuration/brainstorm" });
  };

  const dismiss = () => {
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