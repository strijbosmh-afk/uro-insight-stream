import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/server/cron-auth.server";
import { resetAllDemoUsers } from "@/server/demo-seed.server";

export const Route = createFileRoute(
  "/api/public/hooks/reset-demo-account"
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireCronAuth(request);
        if (auth) return auth;
        try {
          const result = await resetAllDemoUsers();
          return new Response(
            JSON.stringify({ ok: true, ...result }),
            { headers: { "Content-Type": "application/json" } }
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: (e as Error).message }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      },
    },
  },
});