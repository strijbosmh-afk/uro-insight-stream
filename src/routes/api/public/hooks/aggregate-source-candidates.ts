import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

const NORMALIZE = (h: string) => h.replace(/^@/, "").trim().toLowerCase();
const VALID = (h: string) => /^[a-z0-9_]{1,15}$/.test(h);

/**
 * Aggregates handle activity from tweets into `source_candidates`, then
 * enriches a small batch via X v2 users/by. Idempotent — safe to run on a cron.
 *
 * Query params:
 *   days     — lookback window for activity scan (default 30, max 30)
 *   enrich   — max number of pending candidates to enrich this run (default 50, max 100)
 */
export const Route = createFileRoute("/api/public/hooks/aggregate-source-candidates")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.X_JOB_SECRET;
        const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!expected || got !== expected) {
          return jsonResponse({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const url = new URL(request.url);
        const days = Math.min(Number(url.searchParams.get("days") ?? "30") || 30, 30);
        const enrichLimit = Math.min(Number(url.searchParams.get("enrich") ?? "50") || 50, 100);
        const sinceISO = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        // 1) Existing source IDs (so we never suggest something already followable).
        const { data: existingSources } = await supabaseAdmin
          .from("sources")
          .select("id");
        const existing = new Set((existingSources ?? []).map((r) => r.id));

        // 2) Scan tweets for parent_handle and entities.mentions.
        // Cap at 5000 rows per run (Supabase default is 1000; we paginate).
        const replyCounts = new Map<string, number>();
        const mentionCounts = new Map<string, number>();
        const lastSeen = new Map<string, string>();

        const PAGE = 1000;
        const MAX_PAGES = 5;
        let offset = 0;
        for (let page = 0; page < MAX_PAGES; page++) {
          const { data: tweets, error } = await supabaseAdmin
            .from("tweets")
            .select("created_at, parent_handle, raw")
            .gte("created_at", sinceISO)
            .order("created_at", { ascending: false })
            .range(offset, offset + PAGE - 1);
          if (error) {
            return jsonResponse({ ok: false, error: `tweet_scan: ${error.message}` }, { status: 500 });
          }
          if (!tweets || tweets.length === 0) break;
          for (const t of tweets) {
            const ts = t.created_at as unknown as string;
            if (t.parent_handle) {
              const h = NORMALIZE(String(t.parent_handle));
              if (VALID(h) && !existing.has(h)) {
                replyCounts.set(h, (replyCounts.get(h) ?? 0) + 1);
                if (!lastSeen.has(h) || lastSeen.get(h)! < ts) lastSeen.set(h, ts);
              }
            }
            const mentionsRaw = (t.raw as { entities?: { mentions?: Array<{ username?: string }> } } | null)
              ?.entities?.mentions;
            if (Array.isArray(mentionsRaw)) {
              for (const m of mentionsRaw) {
                const uname = m?.username;
                if (typeof uname !== "string") continue;
                const h = NORMALIZE(uname);
                if (!VALID(h) || existing.has(h)) continue;
                mentionCounts.set(h, (mentionCounts.get(h) ?? 0) + 1);
                if (!lastSeen.has(h) || lastSeen.get(h)! < ts) lastSeen.set(h, ts);
              }
            }
          }
          offset += tweets.length;
          if (tweets.length < PAGE) break;
        }

        const allHandles = new Set<string>([...replyCounts.keys(), ...mentionCounts.keys()]);

        // 3) Upsert candidates with refreshed signal counts.
        let upserts = 0;
        if (allHandles.size > 0) {
          const rows = Array.from(allHandles).map((h) => {
            const reply = replyCounts.get(h) ?? 0;
            const mention = mentionCounts.get(h) ?? 0;
            // Replies are stronger signal than mentions: weight 3 vs 1.
            const total = reply * 3 + mention;
            return {
              handle: h,
              reply_count: reply,
              mention_count: mention,
              total_signal: total,
              last_seen_at: lastSeen.get(h) ?? null,
              updated_at: new Date().toISOString(),
            };
          });
          // Chunk to avoid huge payloads.
          for (let i = 0; i < rows.length; i += 500) {
            const chunk = rows.slice(i, i + 500);
            const { error } = await supabaseAdmin
              .from("source_candidates")
              .upsert(chunk, { onConflict: "handle" });
            if (error) {
              return jsonResponse({ ok: false, error: `upsert: ${error.message}` }, { status: 500 });
            }
            upserts += chunk.length;
          }
        }

        // 4) Drop stale candidates that have been promoted to sources or are now empty.
        if (existing.size > 0) {
          await supabaseAdmin
            .from("source_candidates")
            .delete()
            .in("handle", Array.from(existing));
        }

        // 5) Enrich a small batch of pending candidates via X API.
        const { data: pending } = await supabaseAdmin
          .from("source_candidates")
          .select("handle")
          .eq("enrichment_status", "pending")
          .order("total_signal", { ascending: false })
          .limit(enrichLimit);

        let enriched = 0;
        let enrichFailed = 0;
        const xToken = process.env.X_BEARER_TOKEN;
        if (xToken && pending && pending.length > 0) {
          // X allows up to 100 usernames per call.
          const handles = pending.map((p) => p.handle);
          for (let i = 0; i < handles.length; i += 100) {
            const chunk = handles.slice(i, i + 100);
            const apiUrl = new URL("https://api.twitter.com/2/users/by");
            apiUrl.searchParams.set("usernames", chunk.join(","));
            apiUrl.searchParams.set(
              "user.fields",
              "name,username,verified,profile_image_url,description,public_metrics",
            );
            try {
              const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${xToken}` } });
              if (res.status === 429) {
                // Stop early on rate limit; remaining handles stay pending.
                break;
              }
              if (!res.ok) {
                // Mark this whole chunk as failed for this attempt.
                await supabaseAdmin
                  .from("source_candidates")
                  .update({
                    enrichment_status: "failed",
                    enrichment_attempted_at: new Date().toISOString(),
                    enrichment_error: `x_api_${res.status}`,
                  })
                  .in("handle", chunk);
                enrichFailed += chunk.length;
                continue;
              }
              const json = (await res.json()) as {
                data?: Array<{
                  id: string;
                  username: string;
                  name?: string;
                  verified?: boolean;
                  profile_image_url?: string;
                  description?: string;
                  public_metrics?: { followers_count?: number };
                }>;
              };
              const found = new Set<string>();
              for (const u of json.data ?? []) {
                const h = NORMALIZE(u.username);
                found.add(h);
                await supabaseAdmin
                  .from("source_candidates")
                  .update({
                    display_name: u.name ?? u.username,
                    avatar_url: u.profile_image_url ?? null,
                    verified: !!u.verified,
                    bio: u.description ?? null,
                    external_user_id: u.id,
                    followers_count: u.public_metrics?.followers_count ?? null,
                    enrichment_status: "enriched",
                    enrichment_attempted_at: new Date().toISOString(),
                    enrichment_error: null,
                  })
                  .eq("handle", h);
                enriched++;
              }
              // Anything in chunk not returned by X is "not_found".
              const notFound = chunk.filter((h) => !found.has(h));
              if (notFound.length > 0) {
                await supabaseAdmin
                  .from("source_candidates")
                  .update({
                    enrichment_status: "not_found",
                    enrichment_attempted_at: new Date().toISOString(),
                  })
                  .in("handle", notFound);
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              await supabaseAdmin
                .from("source_candidates")
                .update({
                  enrichment_status: "failed",
                  enrichment_attempted_at: new Date().toISOString(),
                  enrichment_error: msg.slice(0, 200),
                })
                .in("handle", chunk);
              enrichFailed += chunk.length;
            }
          }
        }

        return jsonResponse({
          ok: true,
          since: sinceISO,
          unique_handles: allHandles.size,
          upserts,
          enriched,
          enrich_failed: enrichFailed,
          x_token_present: !!xToken,
        });
      },
    },
  },
});