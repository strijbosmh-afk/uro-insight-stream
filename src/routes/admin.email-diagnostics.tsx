import { createFileRoute } from "@tanstack/react-router";
import { EmailDiagnosticsView } from "@/components/admin/EmailDiagnosticsView";

export const Route = createFileRoute("/admin/email-diagnostics")({
  head: () => ({ meta: [{ title: "Email diagnostics — UroFeed" }] }),
  component: EmailDiagnosticsView,
});
