import { createFileRoute } from "@tanstack/react-router";
import { recentSearch } from "@/adapters/twitter/xApiV2";
import { requireCronAuth } from "@/server/cron-auth.server";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export const Route = createFileRoute("/api/public/hooks/test-hierarchy-parse")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireCronAuth(request);
        if (auth) return auth;
        const token = process.env.X_BEARER_TOKEN;
        if (!token) {
          return jsonResponse({ ok: false, error: "missing_x_bearer_token" }, { status: 500 });
        }

        const url = new URL(request.url);
        const handle = (url.searchParams.get("handle") ?? "drspratticus").replace(/^@/, "");
        const days = Number(url.searchParams.get("days") ?? "7");
        const sinceISO = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        try {
          const tweets = await recentSearch(`from:${handle} -is:retweet`, sinceISO, token);
          const sample = tweets.slice(0, 5).map((t) => ({
            id: t.id,
            authorHandle: t.authorHandle,
            tweetType: t.tweetType,
            parentTweetExternalId: t.parentTweetExternalId ?? null,
            parentHandle: t.parentHandle ?? null,
            parentText: t.parentText ?? null,
            text: t.text.length > 200 ? t.text.slice(0, 200) + "…" : t.text,
          }));
          const counts = tweets.reduce(
            (acc, t) => {
              acc[t.tweetType] = (acc[t.tweetType] ?? 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          );
          return jsonResponse({
            ok: true,
            handle,
            since: sinceISO,
            total_returned: tweets.length,
            counts_by_type: counts,
            sample,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return jsonResponse({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});