import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { IngestionSettings } from "@/components/settings/IngestionSettings";
import { Panel } from "@/components/shell/Panel";
import { useAuth } from "@/auth/AuthProvider";

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
    </div>
  );
}
