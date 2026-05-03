import { createFileRoute, redirect } from "@tanstack/react-router";
import { IngestionSettings } from "@/components/settings/IngestionSettings";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/ingestion")({
  head: () => ({ meta: [{ title: "Ingestion — UroFeed admin" }] }),
  beforeLoad: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    if (!roles?.some((r) => r.role === "admin")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: IngestionPage,
});

function IngestionPage() {
  return (
    <div className="p-6">
      <h1 className="font-mono text-sm uppercase tracking-[0.18em] text-text-muted mb-4">
        Admin · Ingestion
      </h1>
      <IngestionSettings />
    </div>
  );
}
