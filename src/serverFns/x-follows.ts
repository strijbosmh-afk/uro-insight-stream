import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  importMyXFollowsFlow,
  getCachedFollows,
  SUGGESTED_SCORE_THRESHOLD,
  type ScoredFollowItem,
} from "@/server/x-follows.server";
import {
  isEligibleForFollowsImportNudge,
  isEligibleForLegacyFollowsImportPrompt,
  isEligibleForLowSourceCountNudge,
  isEligibleForDiffNudge,
  getPreviousHandles,
} from "@/server/x-follows.server";

const GetSchema = z.object({
  refresh: z.boolean().optional(),
  mode: z.enum(["full", "diff"]).optional(),
});

export const getScoredFollows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GetSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const result = await importMyXFollowsFlow({
      userId: context.userId,
      refresh: !!data.refresh,
    });
    if (!result.ok) return result;

    // Diff mode: keep only handles that didn't exist in the previously-cached
    // snapshot (newcomers since last import / last cron refresh).
    let scopedItems = result.items;
    if (data.mode === "diff") {
      const prev = await getPreviousHandles(context.userId);
      scopedItems = result.items.filter(
        (it) => !prev.has(it.handle.toLowerCase()),
      );
    }

    // Partition + sort.
    const suggested = scopedItems
      .filter((it) => it.score >= SUGGESTED_SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score);
    const other = scopedItems
      .filter((it) => it.score < SUGGESTED_SCORE_THRESHOLD)
      .sort((a, b) => a.handle.localeCompare(b.handle));

    // Mark which handles are already subscribed.
    const handles = scopedItems.map((it) => it.handle.toLowerCase());
    const { data: subs } = await supabaseAdmin
      .from("user_subscribed_sources")
      .select("source_id")
      .eq("user_id", context.userId)
      .in("source_id", handles);
    const subscribedSet = new Set(
      ((subs ?? []) as Array<{ source_id: string }>).map((r) => r.source_id),
    );

    return {
      ok: true as const,
      suggested,
      other,
      totalSeen: data.mode === "diff" ? scopedItems.length : result.totalSeen,
      capped: result.capped,
      cached: result.cached,
      fetched_at: result.fetched_at,
      already_subscribed: Array.from(subscribedSet),
      mode: data.mode ?? "full",
    };
  });

const BulkSchema = z.object({
  handles: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(50)
        .regex(/^@?[A-Za-z0-9_]{1,15}$/),
    )
    .min(1)
    .max(500),
});

export const bulkSubscribeFromFollows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => BulkSchema.parse(data))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const handles = Array.from(
      new Set(
        data.handles.map((h) => h.replace(/^@/, "").toLowerCase()),
      ),
    );

    const cached = (await getCachedFollows(userId)) ?? [];
    const profileByHandle = new Map(
      cached.map((p) => [p.handle.toLowerCase(), p]),
    );

    // Find existing source rows.
    const { data: existing } = await supabaseAdmin
      .from("sources")
      .select("id, handle")
      .in("id", handles);
    const existingIds = new Set(
      ((existing ?? []) as Array<{ id: string }>).map((r) => r.id),
    );

    // Insert missing source rows using cached X profile data.
    const nowISO = new Date().toISOString();
    const toInsert = handles
      .filter((h) => !existingIds.has(h))
      .map((h) => {
        const p = profileByHandle.get(h);
        return {
          id: h,
          handle: h,
          display_name: p?.display_name ?? `@${h}`,
          avatar_url: p?.avatar_url ?? "",
          bio: p?.bio ?? null,
          verified: p?.verified ?? false,
          followers_count: p?.followers_count ?? null,
          enriched_at: p ? nowISO : null,
          last_enrichment_attempt_at: p ? nowISO : null,
          role: "other",
          active: true,
        };
      });

    // Per-handle status so the caller can show what actually happened
    // instead of opaque "X failed" numbers.
    type Status = "subscribed" | "already" | "source_failed" | "subscribe_failed";
    const status = new Map<string, Status>();

    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin
        .from("sources")
        .upsert(toInsert, { onConflict: "id" });
      if (error) {
        // Fail-fast: if we can't materialize the source rows, the
        // user_subscribed_sources insert below would FK-violate. Mark
        // these handles as failed and skip them rather than silently
        // recording phantom subscriptions.
        console.error("[bulkSubscribeFromFollows] sources upsert failed", error);
        for (const row of toInsert) status.set(row.id, "source_failed");
      }
    }

    // Subscribe (idempotent).
    const { data: existingSubs } = await supabaseAdmin
      .from("user_subscribed_sources")
      .select("source_id")
      .eq("user_id", userId)
      .in("source_id", handles);
    const alreadySubbed = new Set(
      ((existingSubs ?? []) as Array<{ source_id: string }>).map(
        (r) => r.source_id,
      ),
    );
    for (const h of alreadySubbed) status.set(h, "already");
    const skipped_existing = alreadySubbed.size;

    const subRows = handles
      .filter((h) => !alreadySubbed.has(h) && status.get(h) !== "source_failed")
      .map((h) => ({ user_id: userId, source_id: h }));

    let subscribed = 0;
    if (subRows.length > 0) {
      const { error } = await supabaseAdmin
        .from("user_subscribed_sources")
        .upsert(subRows, { onConflict: "user_id,source_id" });
      if (error) {
        console.error("[bulkSubscribeFromFollows] subscribe failed", error);
        for (const row of subRows) status.set(row.source_id, "subscribe_failed");
      } else {
        for (const row of subRows) status.set(row.source_id, "subscribed");
        subscribed = subRows.length;
      }
    }
    const failed = Array.from(status.values()).filter(
      (s) => s === "source_failed" || s === "subscribe_failed",
    ).length;

    // Stamp follows_imported_at + count.
    await supabaseAdmin
      .from("user_x_credentials")
      .update({
        follows_imported_at: nowISO,
        follows_count_at_import: cached.length || null,
        follows_new_since_last_import: 0,
        follows_diff_dismissed_at: nowISO,
      })
      .eq("user_id", userId)
      .eq("is_active", true);

    return {
      subscribed,
      skipped_existing,
      failed,
      results: Array.from(status.entries()).map(([handle, s]) => ({
        handle,
        status: s,
      })),
    };
  });

export type ScoredFollow = ScoredFollowItem;

// ---------- Discoverability nudge bridges ----------

export const getFollowsImportNudgeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    // Priority: legacy_one_time > diff_dashboard > first_time_dashboard.
    if (await isEligibleForLegacyFollowsImportPrompt(userId)) {
      return {
        eligible: true as const,
        kind: "legacy_one_time" as const,
        new_count: 0,
      };
    }
    const diff = await isEligibleForDiffNudge(userId);
    if (diff.eligible) {
      return {
        eligible: true as const,
        kind: "diff_dashboard" as const,
        new_count: diff.new_count,
      };
    }
    if (await isEligibleForFollowsImportNudge(userId)) {
      return {
        eligible: true as const,
        kind: "first_time_dashboard" as const,
        new_count: 0,
      };
    }
    return { eligible: false as const, kind: null, new_count: 0 };
  });

export const getLowSourceCountNudgeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return {
      eligible: await isEligibleForLowSourceCountNudge(context.userId),
    };
  });

const DismissSchema = z.object({
  kind: z.enum([
    "first_time_dashboard",
    "legacy_one_time",
    "low_source_count",
    "diff_dashboard",
  ]),
});

export const dismissFollowsImportNudge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DismissSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const nowISO = new Date().toISOString();
    if (data.kind === "legacy_one_time") {
      await supabaseAdmin
        .from("profiles")
        .update({ legacy_user_import_prompt_seen_at: nowISO })
        .eq("id", userId);
      return { ok: true as const };
    }
    if (data.kind === "low_source_count") {
      await supabaseAdmin
        .from("profiles")
        .update({ low_source_count_nudge_dismissed_at: nowISO })
        .eq("id", userId);
      return { ok: true as const };
    }
    if (data.kind === "diff_dashboard") {
      await supabaseAdmin
        .from("user_x_credentials")
        .update({ follows_diff_dismissed_at: nowISO })
        .eq("user_id", userId)
        .eq("is_active", true);
      return { ok: true as const };
    }
    // first_time_dashboard: increment + stamp
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("follows_import_nudge_dismissed_count")
      .eq("id", userId)
      .maybeSingle();
    const current =
      ((p as { follows_import_nudge_dismissed_count?: number } | null)
        ?.follows_import_nudge_dismissed_count) ?? 0;
    await supabaseAdmin
      .from("profiles")
      .update({
        follows_import_nudge_dismissed_count: current + 1,
        follows_import_nudge_last_dismissed_at: nowISO,
      })
      .eq("id", userId);
    return { ok: true as const };
  });
