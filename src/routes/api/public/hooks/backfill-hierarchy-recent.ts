import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recentSearch } from "@/adapters/twitter/xApiV2";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

export const Route = createFileRoute("/api/public/hooks/backfill-hierarchy-recent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.X_JOB_SECRET;
        const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!expected || got !== expected) {
          return jsonResponse({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        const token = process.env.X_BEARER_TOKEN;
        if (!token) {
          return jsonResponse({ ok: false, error: "missing_x_bearer_token" }, { status: 500 });
        }

        const url = new URL(request.url);
        // X recent-search API only allows up to 7 days back; cap accordingly.
        const requestedDays = Number(url.searchParams.get("days") ?? "7");
        const days = Math.min(Number.isFinite(requestedDays) ? requestedDays : 7, 7);
        // Pull back from 6.9 days to leave a safety margin against the 7-day cutoff.
        const sinceISO = new Date(Date.now() - days * 24 * 60 * 60 * 1000 + 60_000).toISOString();

        // 1. Sweep pure retweets that snuck in before the filter was added.
        const { data: rtRows, error: rtSelErr } = await supabaseAdmin
          .from("tweets")
          .select("id")
          .like("text", "RT @%");
        if (rtSelErr) {
          return jsonResponse({ ok: false, error: `rt_select: ${rtSelErr.message}` }, { status: 500 });
        }
        const rtIds = (rtRows ?? []).map((r) => r.id);
        let retweetsDeleted = 0;
        if (rtIds.length > 0) {
          const { error: rtDelErr, count } = await supabaseAdmin
            .from("tweets")
            .delete({ count: "exact" })
            .in("id", rtIds);
          if (rtDelErr) {
            return jsonResponse({ ok: false, error: `rt_delete: ${rtDelErr.message}` }, { status: 500 });
          }
          retweetsDeleted = count ?? rtIds.length;
        }

        // 2. Load active sources.
        const { data: sources, error: srcErr } = await supabaseAdmin
          .from("sources")
          .select("id, handle")
          .eq("active", true);
        if (srcErr) {
          return jsonResponse({ ok: false, error: `sources: ${srcErr.message}` }, { status: 500 });
        }

        const perSource: Array<{
          handle: string;
          fetched: number;
          updated: number;
          skipped_already_typed: number;
          not_in_db: number;
          error?: string;
        }> = [];
        let totalUpdated = 0;

        for (const src of sources ?? []) {
          const handle = src.handle.replace(/^@/, "");
          try {
            const tweets = await recentSearch(`from:${handle} -is:retweet`, sinceISO, token);
            if (tweets.length === 0) {
              perSource.push({ handle, fetched: 0, updated: 0, skipped_already_typed: 0, not_in_db: 0 });
              continue;
            }

            const ids = tweets.map((t) => t.id);
            const { data: existing, error: exErr } = await supabaseAdmin
              .from("tweets")
              .select("id, tweet_type")
              .in("id", ids);
            if (exErr) throw new Error(exErr.message);

            const existingMap = new Map<string, string>();
            for (const r of existing ?? []) existingMap.set(r.id, r.tweet_type ?? "original");

            // Resolve parent_in_db_id: which referenced parents are in our DB?
            const parentIds = Array.from(
              new Set(
                tweets
                  .map((t) => t.parentTweetExternalId)
                  .filter((p): p is string => !!p),
              ),
            );
            const localParents = new Set<string>();
            if (parentIds.length > 0) {
              const { data: parents } = await supabaseAdmin
                .from("tweets")
                .select("id")
                .in("id", parentIds);
              for (const p of parents ?? []) localParents.add(p.id);
            }

            let updated = 0;
            let skippedAlreadyTyped = 0;
            let notInDb = 0;

            for (const t of tweets) {
              const existingType = existingMap.get(t.id);
              if (existingType === undefined) {
                notInDb++;
                continue;
              }
              if (existingType !== "original") {
                skippedAlreadyTyped++;
                continue;
              }
              if (t.tweetType === "original") {
                // Nothing to backfill — already correctly 'original'.
                continue;
              }
              const { error: upErr } = await supabaseAdmin
                .from("tweets")
                .update({
                  tweet_type: t.tweetType,
                  parent_tweet_external_id: t.parentTweetExternalId ?? null,
                  parent_handle: t.parentHandle ?? null,
                  parent_text: t.parentText ?? null,
                  parent_in_db_id:
                    t.parentTweetExternalId && localParents.has(t.parentTweetExternalId)
                      ? t.parentTweetExternalId
                      : null,
                })
                .eq("id", t.id);
              if (upErr) throw new Error(upErr.message);
              updated++;
            }

            totalUpdated += updated;
            perSource.push({
              handle,
              fetched: tweets.length,
              updated,
              skipped_already_typed: skippedAlreadyTyped,
              not_in_db: notInDb,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            perSource.push({
              handle,
              fetched: 0,
              updated: 0,
              skipped_already_typed: 0,
              not_in_db: 0,
              error: message,
            });
          }
        }

        return jsonResponse({
          ok: true,
          since: sinceISO,
          retweets_deleted: retweetsDeleted,
          total_updated: totalUpdated,
          sources_processed: (sources ?? []).length,
          per_source: perSource,
        });
      },
    },
  },
});