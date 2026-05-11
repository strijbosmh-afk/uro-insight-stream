import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImportFollowsPanel } from "./ImportFollowsPanel";

export function ImportFollowsCard() {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);

  const { data } = useQuery({
    queryKey: ["x-import-status", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_x_credentials")
        .select("x_username, follows_imported_at, follows_count_at_import")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .is("revoked_at", null)
        .maybeSingle();
      return data;
    },
  });

  if (!data?.x_username) return null;

  const importedAt = data.follows_imported_at
    ? new Date(data.follows_imported_at).toLocaleDateString()
    : null;

  return (
    <>
      <div
        className="flex items-center justify-between p-3"
        style={{ background: "var(--panel-elevated)", border: "1px solid var(--border)" }}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary">
            {importedAt
              ? `X follows imported on ${importedAt}`
              : "Import the accounts you follow on X"}
          </div>
          <div className="text-xs text-text-secondary">
            {importedAt
              ? "Re-import to find new follows since last import."
              : "Pull in oncology-relevant accounts you already follow."}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Download className="h-3.5 w-3.5 mr-1" />
          {importedAt ? "Re-import" : "Browse my X follows"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import X follows</DialogTitle>
          </DialogHeader>
          <ImportFollowsPanel onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
