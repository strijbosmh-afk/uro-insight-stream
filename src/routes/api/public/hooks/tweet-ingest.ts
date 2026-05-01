import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadConfig, runIngestionForTarget } from "@/server/ingestion.server";

// Cron-triggered tweet ingestion. Iterates over active sources + hashtags
// using the configured adapter and the configured lookback window.
export const Route = createFileRoute("/api/public/hooks/tweet-ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Authenticate the caller (pg_cron passes a shared secret in the
          // Authorization header). Public route, but not world-callable.
          const expected = process.env.X_JOB_SECRET;
          const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
          if (!expected || got !== expected) {
            return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
          const cfg = await loadConfig();
          if (!cfg.enabled) {
            return Response.json({ ok: true, skipped: "ingestion_disabled" });
          }
          const sinceISO = new Date(
            Date.now() - cfg.default_lookback_minutes * 60_000,
          ).toISOString();

          // For day 1, sources/hashtags live in mock memory only — server-side ingestion
          // reads from any rows we may have synced into Supabase later. To stay useful
          // immediately, we read from a `sources` and `hashtags` table if present; else
          // we no-op gracefully.
          const handles: string[] = [];
          const tags: string[] = [];

          // Try optional tables. Ignore "table not found" style errors.
          const sourcesRes = await supabaseAdmin
            .from("sources" as never)
            .select("handle, active")
            .limit(500);
          if (!sourcesRes.error && Array.isArray(sourcesRes.data)) {
            for (const row of sourcesRes.data as Array<{ handle: string; active: boolean }>) {
              if (row.active && row.handle) handles.push(row.handle);
            }
          }
          const tagsRes = await supabaseAdmin
            .from("hashtags" as never)
            .select("tag, active")
            .limit(500);
          if (!tagsRes.error && Array.isArray(tagsRes.data)) {
            for (const row of tagsRes.data as Array<{ tag: string; active: boolean }>) {
              if (row.active && row.tag) tags.push(row.tag);
            }
          }

          const results = [];
          for (const h of handles) {
            results.push(await runIngestionForTarget("handle", h, sinceISO));
          }
          for (const t of tags) {
            results.push(await runIngestionForTarget("hashtag", t, sinceISO));
          }
          return Response.json({
            ok: true,
            adapter: cfg.adapter,
            counts: { handles: handles.length, tags: tags.length },
            results,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[tweet-ingest] failed:", message);
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
