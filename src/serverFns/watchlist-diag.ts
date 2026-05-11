// Admin-only diagnostic surface for the watchlist alerts pipeline.
// Runs the classifier against a synthetic tweet + a real watchlist's topics
// and (optionally) reports what the delivery decision would be — without
// persisting matches or actually enqueueing emails. Useful for production
// support ("my watchlist isn't firing — why?") and as a smoke target after
// pipeline changes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "@/server/admin-middleware.server";

const Schema = z.object({
  watchlistId: z.string().uuid(),
  tweetText: z.string().min(1).max(2000),
  authorHandle: z.string().min(1).max(64).optional().default("diag_user"),
  deliveryDryRun: z.boolean().optional().default(true),
});

function isInQuietHoursUtc(start: number, end: number, now: Date = new Date()): boolean {
  const h = now.getUTCHours();
  if (start === end) return false;
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}

export const runWatchlistSmoke = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Schema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: wl } = await supabaseAdmin
      .from("user_watchlists")
      .select(
        "id, user_id, name, is_active, email_enabled, quiet_hours_start, quiet_hours_end, max_emails_per_day, muted_until",
      )
      .eq("id", data.watchlistId)
      .maybeSingle();
    if (!wl) return { ok: false, error: "watchlist_not_found" as const };

    const { data: topicRows } = await supabaseAdmin
      .from("user_watchlist_topics")
      .select("topic")
      .eq("watchlist_id", data.watchlistId);
    const topics = (topicRows ?? []).map((r) => r.topic as string);

    // Stage 1: keyword pass.
    const lower = data.tweetText.toLowerCase();
    const keywordHit = topics.find((t) => lower.includes(t.toLowerCase())) ?? null;

    // Delivery decision (dry-run): replicate gating in deliverWatchlistMatches.
    let deliveryDecision: {
      would_send_email: boolean;
      reason: string;
      coalescing: "first" | "appended_to_open_window" | "none";
    } = { would_send_email: false, reason: "no_match", coalescing: "none" };

    if (keywordHit) {
      const reasons: string[] = [];
      if (!wl.is_active) reasons.push("watchlist_inactive");
      if (!wl.email_enabled) reasons.push("email_disabled");
      if (wl.muted_until && new Date(wl.muted_until as string).getTime() > Date.now()) {
        reasons.push("muted");
      }
      if (
        isInQuietHoursUtc(
          wl.quiet_hours_start as number,
          wl.quiet_hours_end as number,
        )
      ) {
        reasons.push("quiet_hours_utc");
      }
      const startOfDayIso = new Date(
        new Date().toISOString().slice(0, 10) + "T00:00:00.000Z",
      ).toISOString();
      const { count: sentToday } = await supabaseAdmin
        .from("watchlist_email_sends")
        .select("id", { count: "exact", head: true })
        .eq("watchlist_id", data.watchlistId)
        .gte("sent_at", startOfDayIso);
      if ((sentToday ?? 0) >= (wl.max_emails_per_day as number)) {
        reasons.push("daily_cap_reached");
      }
      const { data: openRow } = await supabaseAdmin
        .from("watchlist_email_sends")
        .select("id")
        .eq("watchlist_id", data.watchlistId)
        .is("delta_sent_at", null)
        .gt("window_closes_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();
      const coalescing: typeof deliveryDecision.coalescing = openRow
        ? "appended_to_open_window"
        : "first";
      const wouldSend = reasons.length === 0 && coalescing === "first";
      deliveryDecision = {
        would_send_email: wouldSend,
        reason: reasons.length === 0
          ? coalescing === "first"
            ? "would_send_immediate"
            : "queued_for_delta_flush"
          : reasons.join(","),
        coalescing,
      };
    }

    return {
      ok: true as const,
      watchlist: { id: wl.id, name: wl.name, topics_count: topics.length },
      classifier: {
        keyword_hit: keywordHit,
        // LLM stage intentionally omitted from the dry-run to keep this
        // diagnostic free + deterministic. Use real ingestion to exercise it.
        llm_invoked: false,
      },
      delivery: data.deliveryDryRun ? deliveryDecision : null,
    };
  });