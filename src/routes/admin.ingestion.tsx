import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { IngestionSettings } from "@/components/settings/IngestionSettings";
import { Panel } from "@/components/shell/Panel";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  provisionDemoAccount,
  resetDemoAccounts,
} from "@/serverFns/demo";

export const Route = createFileRoute("/admin/ingestion")({
  head: () => ({ meta: [{ title: "Ingestion — UroFeed admin" }] }),
  component: IngestionPage,
});

function IngestionPage() {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Panel title="Access denied">
          <p className="text-sm text-text-muted">
            This page is admin-only.{" "}
            <Link to="/dashboard" className="text-accent underline">
              Go to dashboard
            </Link>
            .
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="font-mono text-sm uppercase tracking-[0.18em] text-text-muted">
        Admin · Ingestion
      </h1>
      <IngestionSettings />
      <DemoAccountPanel />
    </div>
  );
}

function DemoAccountPanel() {
  const [busy, setBusy] = React.useState<null | "provision" | "reset">(null);

  const onProvision = async () => {
    setBusy("provision");
    try {
      const r = await provisionDemoAccount();
      toast.success(
        `Demo account ${r.created ? "created" : "repaired"} & seeded.`
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onReset = async () => {
    setBusy("reset");
    try {
      const r = await resetDemoAccounts();
      toast.success(`Reset ${r.users} demo account(s).`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="Demo account">
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-text-muted">
          Provision (or repair) the <code>demo@urofeed.app</code> account, then
          wipe + reseed the canonical state. The nightly cron does this
          automatically at 03:00 UTC; use the buttons below to trigger
          manually.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onProvision}
            disabled={busy !== null}
          >
            {busy === "provision" ? (
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 mr-2" />
            )}
            Provision / repair demo account
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onReset}
            disabled={busy !== null}
          >
            {busy === "reset" ? (
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            ) : null}
            Reset demo account now
          </Button>
        </div>
      </div>
    </Panel>
  );
}
