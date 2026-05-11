import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCronAuth } from "@/server/cron-auth.server";
import {
  enrichHandlesViaX,
  upsertSourceProfileByHandle,
  markSourceEnrichmentAttempt,
} from "@/server/x-enrichment.server";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

const NORMALIZE = (h: string) => h.replace(/^@/, "").trim().toLowerCase();
const VALID = (h: string) => /^[a-z0-9_]{1,15}$/.test(h);

// Scoring weights — see Discover spec.
const W_REPLY = 3;
const W_QUOTE = 3;
const W_MENTION = 1;
const RECENCY_MULT = 2;
const RECENCY_DAYS = 7;
const MENTIONS_PER_TWEET_CAP = 3;

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
        const auth = await requireCronAuth(request);
        if (auth) return auth;
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
        // Per-handle counters with recent (last 7d) breakdown.
        type Counters = {
          reply: number;
          reply_recent: number;
          quote: number;
          quote_recent: number;
          mention: number;
          mention_recent: number;
        };
        const counters = new Map<string, Counters>();
        const lastSeen = new Map<string, string>();
        const recentCutoff = Date.now() - RECENCY_DAYS * 24 * 60 * 60 * 1000;
        const ensure = (h: string): Counters => {
          let c = counters.get(h);
          if (!c) {
            c = { reply: 0, reply_recent: 0, quote: 0, quote_recent: 0, mention: 0, mention_recent: 0 };
            counters.set(h, c);
          }
          return c;
        };

        const PAGE = 1000;
        const MAX_PAGES = 5;
        let offset = 0;
        for (let page = 0; page < MAX_PAGES; page++) {
          const { data: tweets, error } = await supabaseAdmin
            .from("tweets")
            .select("created_at, parent_handle, tweet_type, raw")
            .gte("created_at", sinceISO)
            .order("created_at", { ascending: false })
            .range(offset, offset + PAGE - 1);
          if (error) {
            return jsonResponse({ ok: false, error: `tweet_scan: ${error.message}` }, { status: 500 });
          }
          if (!tweets || tweets.length === 0) break;
          for (const t of tweets) {
            const ts = t.created_at as unknown as string;
            const isRecent = new Date(ts).getTime() >= recentCutoff;
            const tt = (t.tweet_type as string | null) ?? "original";

            // Reply / Quote → parent_handle is the strong signal.
            if (t.parent_handle && (tt === "reply" || tt === "quote")) {
              const h = NORMALIZE(String(t.parent_handle));
              if (VALID(h) && !existing.has(h)) {
                const c = ensure(h);
                if (tt === "reply") {
                  c.reply++;
                  if (isRecent) c.reply_recent++;
                } else {
                  c.quote++;
                  if (isRecent) c.quote_recent++;
                }
                if (!lastSeen.has(h) || lastSeen.get(h)! < ts) lastSeen.set(h, ts);
              }
            }

            // Mentions — capped at 3 per tweet, dedup within tweet, exclude parent_handle so it
            // doesn't double-count an already-credited reply/quote target.
            const mentionsRaw = (t.raw as { entities?: { mentions?: Array<{ username?: string }> } } | null)
              ?.entities?.mentions;
            if (Array.isArray(mentionsRaw)) {
              const parentH = t.parent_handle ? NORMALIZE(String(t.parent_handle)) : null;
              const seen = new Set<string>();
              let credited = 0;
              for (const m of mentionsRaw) {
                if (credited >= MENTIONS_PER_TWEET_CAP) break;
                const uname = m?.username;
                if (typeof uname !== "string") continue;
                const h = NORMALIZE(uname);
                if (!VALID(h) || existing.has(h)) continue;
                if (seen.has(h)) continue;
                if (parentH && h === parentH) continue;
                seen.add(h);
                credited++;
                const c = ensure(h);
                c.mention++;
                if (isRecent) c.mention_recent++;
                if (!lastSeen.has(h) || lastSeen.get(h)! < ts) lastSeen.set(h, ts);
              }
            }
          }
          offset += tweets.length;
          if (tweets.length < PAGE) break;
        }

        const allHandles = new Set<string>(counters.keys());

        // 3) Upsert candidates with refreshed signal counts.
        let upserts = 0;
        if (allHandles.size > 0) {
          const rows = Array.from(allHandles).map((h) => {
            const c = counters.get(h)!;
            // Score = base*weight + recent*weight (extra so recent counts 2x total).
            const score =
              W_REPLY * c.reply +
              W_QUOTE * c.quote +
              W_MENTION * c.mention +
              (RECENCY_MULT - 1) *
                (W_REPLY * c.reply_recent + W_QUOTE * c.quote_recent + W_MENTION * c.mention_recent);
            return {
              handle: h,
              reply_count: c.reply,
              quote_count: c.quote,
              mention_count: c.mention,
              total_signal: score,
              signal_breakdown: {
                reply: c.reply,
                reply_recent: c.reply_recent,
                quote: c.quote,
                quote_recent: c.quote_recent,
                mention: c.mention,
                mention_recent: c.mention_recent,
              },
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
        let sourcesEnriched = 0;

        // 5a) Pull stale source rows that need (re)enrichment so we share the
        //     same X API budget as the candidate enrichment.
        const STALE_CUTOFF = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: staleSources } = await supabaseAdmin
          .from("sources")
          .select("handle")
          .eq("active", true)
          .or(`enriched_at.is.null,enriched_at.lt.${STALE_CUTOFF}`)
          .order("enriched_at", { ascending: true, nullsFirst: true })
          .limit(enrichLimit);
        const staleHandles = new Set(
          ((staleSources ?? []) as Array<{ handle: string }>).map((r) => NORMALIZE(r.handle)),
        );

        const candidateHandles = (pending ?? []).map((p) => p.handle);
        // Merge candidate + stale-source handles, dedup, cap at enrichLimit.
        const enrichSet = new Set<string>(candidateHandles.map(NORMALIZE));
        for (const h of staleHandles) enrichSet.add(h);
        const allEnrich = Array.from(enrichSet).slice(0, enrichLimit);

        if (allEnrich.length > 0) {
          // X allows up to 100 usernames per call.
          for (let i = 0; i < allEnrich.length; i += 100) {
            const chunk = allEnrich.slice(i, i + 100);
            const batch = await enrichHandlesViaX(chunk);
            if (batch.rateLimited) break;
            const nowISO = new Date().toISOString();

            if (batch.errorStatus || batch.errorMessage) {
              // Hard failure for the whole chunk: mark candidates failed,
              // and stamp attempt time on any matching source rows.
              const chunkCandidates = chunk.filter((h) => !staleHandles.has(h) || candidateHandles.includes(h));
              if (chunkCandidates.length > 0) {
                await supabaseAdmin
                  .from("source_candidates")
                  .update({
                    enrichment_status: "failed",
                    enrichment_attempted_at: nowISO,
                    enrichment_error: (batch.errorMessage ?? `x_api_${batch.errorStatus}`).slice(0, 200),
                  })
                  .in("handle", chunkCandidates);
                enrichFailed += chunkCandidates.length;
              }
              for (const h of chunk) {
                if (staleHandles.has(h)) await markSourceEnrichmentAttempt(h);
              }
              continue;
            }

            for (const [h, profile] of batch.found) {
              // Write 1: source_candidates (only if it was a candidate).
              if (candidateHandles.includes(h)) {
                await supabaseAdmin
                  .from("source_candidates")
                  .update({
                    display_name: profile.display_name,
                    avatar_url: profile.avatar_url ?? null,
                    verified: profile.verified,
                    bio: profile.bio,
                    external_user_id: profile.external_user_id,
                    followers_count: profile.followers_count,
                    enrichment_status: "enriched",
                    enrichment_attempted_at: nowISO,
                    enrichment_error: null,
                  })
                  .eq("handle", h);
                enriched++;
              }
              // Write 2: sources mirror (only if a sources row exists).
              if (staleHandles.has(h)) {
                await upsertSourceProfileByHandle(h, profile);
                sourcesEnriched++;
              }
            }

            // Anything in chunk not returned: candidates → not_found, sources
            // → bump last_enrichment_attempt_at (don't touch enriched_at).
            for (const h of batch.notFound) {
              if (candidateHandles.includes(h)) {
                await supabaseAdmin
                  .from("source_candidates")
                  .update({
                    enrichment_status: "not_found",
                    enrichment_attempted_at: nowISO,
                  })
                  .eq("handle", h);
              }
              if (staleHandles.has(h)) await markSourceEnrichmentAttempt(h);
            }
          }
        }

        return jsonResponse({
          ok: true,
          since: sinceISO,
          unique_handles: allHandles.size,
          upserts,
          sources_enriched: sourcesEnriched,
          enriched,
          enrich_failed: enrichFailed,
          x_token_present: !!xToken,
        });
      },
    },
  },
});