import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/email-diagnostics")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/users" });
  },
});
