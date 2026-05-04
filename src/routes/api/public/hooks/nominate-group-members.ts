import { createFileRoute } from "@tanstack/react-router";
import { requireCronAuth } from "@/server/cron-auth.server";
import { nominateForGroupsByRules } from "@/server/group-rules.server";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

/**
 * Nightly nomination engine — scores recently updated sources against the
 * cancer_area_signals dictionary and inserts ranked nominations into
 * source_group_member_candidates for admin review.
 *
 * Query params:
 *   since=null    — full scan (default: 7d window)
 *   limitPerArea  — cap nominations per cancer area (default 50)
 */
export const Route = createFileRoute("/api/public/hooks/nominate-group-members")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireCronAuth(request);
        if (auth) return auth;
        const url = new URL(request.url);
        const sinceParam = url.searchParams.get("since");
        const limitParam = url.searchParams.get("limitPerArea");
        const since = sinceParam === "null" ? null : sinceParam ?? undefined;
        const limitPerArea = limitParam ? Math.max(1, Math.min(500, Number(limitParam))) : 50;
        const startedAt = Date.now();
        try {
          const result = await nominateForGroupsByRules({ since, limitPerArea });
          return jsonResponse({
            ok: true,
            ...result,
            runtime_ms: Date.now() - startedAt,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return jsonResponse({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});