// Cron-driven hook: flushes pending coalesced watchlist email deltas.
// Scheduled by pg_cron every minute; auth via the shared X_JOB_SECRET (vault).
import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/server/cron-auth.server";
import { flushPendingDeltas } from "@/server/watchlist-delivery.server";

export const Route = createFileRoute("/api/public/hooks/watchlist-flush")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireCronAuth(request);
        if (auth) return auth;
        try {
          const result = await flushPendingDeltas();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[watchlist-flush] failed", err);
          return new Response(
            JSON.stringify({ ok: false, error: (err as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});