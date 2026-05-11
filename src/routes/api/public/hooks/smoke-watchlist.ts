// TEMPORARY smoke-test harness for the watchlist data plane.
// DELETE THIS FILE after smoke testing is complete.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyNewTweets } from "@/server/watchlist-classifier.server";

const SMOKE_SECRET = "a195a37a2d8b36ddb8055cf6fc00c1d5";

export const Route = createFileRoute("/api/public/hooks/smoke-watchlist")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("x-smoke-secret") !== SMOKE_SECRET) {
          return new Response("nope", { status: 401 });
        }
        const body = (await request.json().catch(() => ({}))) as {
          action?: string;
          tweetIds?: string[];
          watchlistId?: string;
          patch?: Record<string, unknown>;
          quota?: number;
          userId?: string;
        };
        const action = body.action ?? "";
        try {
          if (action === "classify") {
            await classifyNewTweets(body.tweetIds ?? []);
            return Response.json({ ok: true });
          }
          if (action === "set-quota") {
            const today = new Date().toISOString().slice(0, 10);
            await supabaseAdmin
              .from("user_llm_quota")
              .upsert(
                { user_id: body.userId!, day: today, classifications: body.quota ?? 0 },
                { onConflict: "user_id,day" },
              );
            return Response.json({ ok: true });
          }
          if (action === "patch-watchlist") {
            await supabaseAdmin
              .from("user_watchlists")
              .update(body.patch as never)
              .eq("id", body.watchlistId!);
            return Response.json({ ok: true });
          }
          if (action === "inspect") {
            const userId = body.userId!;
            const [wl, matches, sends, cache, quota, mute] = await Promise.all([
              supabaseAdmin.from("user_watchlists").select("*").eq("user_id", userId),
              supabaseAdmin
                .from("user_watchlist_matches")
                .select("*, user_watchlists!inner(user_id)")
                .eq("user_watchlists.user_id", userId)
                .order("classified_at", { ascending: false })
                .limit(50),
              supabaseAdmin
                .from("watchlist_email_sends")
                .select("*")
                .eq("user_id", userId)
                .order("sent_at", { ascending: false })
                .limit(20),
              supabaseAdmin
                .from("watchlist_match_cache")
                .select("*")
                .order("classified_at", { ascending: false })
                .limit(20),
              supabaseAdmin
                .from("user_llm_quota")
                .select("*")
                .eq("user_id", userId)
                .order("day", { ascending: false })
                .limit(5),
              supabaseAdmin.from("watchlist_mute_tokens").select("*").limit(20),
            ]);
            return Response.json({
              watchlists: wl.data,
              matches: matches.data,
              sends: sends.data,
              cache: cache.data,
              quota: quota.data,
              mute_tokens: mute.data,
            });
          }
          if (action === "cleanup") {
            const userId = body.userId!;
            await supabaseAdmin.from("user_watchlists").delete().eq("user_id", userId);
            await supabaseAdmin.from("user_llm_quota").delete().eq("user_id", userId);
            await supabaseAdmin
              .from("tweets")
              .delete()
              .like("id", "smoke_%");
            await supabaseAdmin
              .from("watchlist_match_cache")
              .delete()
              .like("tweet_id", "smoke_%");
            return Response.json({ ok: true });
          }
          return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      },
    },
  },
});