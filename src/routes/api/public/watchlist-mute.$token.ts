import { createFileRoute } from "@tanstack/react-router";
import { consumeMuteToken } from "@/server/watchlist-delivery.server";

function htmlPage(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>body{font:16px ui-sans-serif,system-ui;margin:0;padding:48px 24px;background:#f9fafb;color:#111;}
.card{max-width:480px;margin:0 auto;background:#fff;padding:32px;border-radius:12px;border:1px solid #e5e7eb;}
a{color:#2563eb;}h1{font-size:18px;margin:0 0 12px;}p{margin:8px 0;color:#374151;}</style></head>
<body><div class="card">${body}</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/watchlist-mute/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token ?? "").trim();
        if (!token || token.length < 16 || token.length > 128) {
          return htmlPage(
            "Invalid link",
            `<h1>Invalid link</h1><p>This mute link is malformed.</p>`,
            400,
          );
        }
        try {
          const result = await consumeMuteToken(token);
          if (!result.ok) {
            return htmlPage(
              "Link expired",
              `<h1>Link expired</h1><p>This mute link has already been used or is no longer valid.</p><p><a href="/alerts">Manage your watchlists</a></p>`,
              410,
            );
          }
          return htmlPage(
            "Muted for 24h",
            `<h1>Muted for 24 hours</h1><p>"${result.watchlistName}" will not send email alerts for the next 24 hours. In-app notifications still appear.</p><p><a href="/alerts">Manage your watchlists</a></p>`,
          );
        } catch (err) {
          console.error("[watchlist-mute] failed", err);
          return htmlPage(
            "Something went wrong",
            `<h1>Something went wrong</h1><p>We couldn't process this mute link. Please try again later or visit your <a href="/alerts">watchlists</a>.</p>`,
            500,
          );
        }
      },
    },
  },
});