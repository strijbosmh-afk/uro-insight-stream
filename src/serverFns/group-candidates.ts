import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "@/server/admin-middleware.server";
import {
  nominateForGroupsByRules,
  type NominateResult,
} from "@/server/group-rules.server";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CandidateRow = {
  id: string;
  group_id: string;
  group_name: string;
  group_slug: string;
  source_id: string;
  source_handle: string;
  source_display_name: string | null;
  source_avatar_url: string | null;
  source_verified: boolean;
  source_bio: string | null;
  score: number;
  evidence: {
    bio_matches?: Array<{ value: string; weight: number }>;
    hashtag_matches?: Array<{ tag: string; count: number; weight: number }>;
    breakdown?: { bio_score: number; hashtag_score: number; total: number };
  };
  status: "pending" | "approved" | "rejected";
  nominated_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isAdminUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

/**
 * Allow admins or the group's creator (created_by = auth.uid()).
 * Throws 403 otherwise.
 */
async function assertCanManageGroup(
  supabase: SupabaseClient,
  userId: string,
  groupId: string,
): Promise<void> {
  if (await isAdminUser(supabase, userId)) return;
  const { data, error } = await supabaseAdmin
    .from("source_groups")
    .select("created_by")
    .eq("id", groupId)
    .maybeSingle();
  if (error) throw new Response(error.message, { status: 500 });
  if (!data) throw new Response("Group not found", { status: 404 });
  if (data.created_by !== userId) {
    throw new Response("Forbidden: not group owner or admin", { status: 403 });
  }
}

type AuditMetadata = {
  group_id: string;
  group_name: string;
  source_ids: string[];
  source_handles: string[];
  evidence_summary?: unknown;
};

async function logMembershipAction(args: {
  actorUserId: string;
  action: string;
  metadata: AuditMetadata;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("admin_audit_log").insert({
    actor_user_id: args.actorUserId,
    action: args.action,
    target_user_id: null,
    target_email: null,
    metadata: args.metadata as never,
  });
  if (error) console.error("[audit] failed", args.action, error);
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ListSchema = z
  .object({
    groupId: z.string().uuid().optional(),
    cancerAreaId: z.string().uuid().optional(),
    minScore: z.number().min(0).optional(),
    status: z.enum(["pending", "approved", "rejected"]).default("pending"),
    limit: z.number().int().min(1).max(200).default(50),
    cursor: z.string().nullable().optional(),
  })
  .default({});

const IdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  notes: z.string().max(1000).optional(),
});

const ManualAddSchema = z.object({
  groupId: z.string().uuid(),
  sourceIds: z.array(z.string().min(1)).min(1).max(500),
  evidence: z.record(z.string(), z.unknown()).optional(),
});

const RemoveSchema = z.object({
  groupId: z.string().uuid(),
  sourceId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// listCandidates
// ---------------------------------------------------------------------------

export const listCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListSchema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<CandidateRow[]> => {
    const { userId, supabase } = context;
    const admin = await isAdminUser(supabase, userId);

    // Determine accessible group IDs: admins see everything; others only see
    // groups they created.
    let groupFilter: string[] | null = null;
    if (!admin) {
      const { data: ownGroups } = await supabaseAdmin
        .from("source_groups")
        .select("id")
        .eq("created_by", userId);
      groupFilter = ((ownGroups ?? []) as Array<{ id: string }>).map((g) => g.id);
      if (groupFilter.length === 0) return [];
    }

    if (data.cancerAreaId) {
      const { data: junc } = await supabaseAdmin
        .from("source_group_cancer_areas")
        .select("group_id")
        .eq("cancer_area_id", data.cancerAreaId);
      const ids = ((junc ?? []) as Array<{ group_id: string }>).map((r) => r.group_id);
      groupFilter = groupFilter ? groupFilter.filter((g) => ids.includes(g)) : ids;
      if (groupFilter.length === 0) return [];
    }

    if (data.groupId) {
      groupFilter = groupFilter
        ? groupFilter.filter((g) => g === data.groupId)
        : [data.groupId];
      if (groupFilter.length === 0) return [];
    }

    let q = supabaseAdmin
      .from("source_group_member_candidates")
      .select(
        "id, group_id, source_id, score, evidence, status, nominated_at, reviewed_by, reviewed_at, review_notes, source_groups:group_id(name, slug), sources:source_id(handle, display_name, avatar_url, verified)",
      )
      .eq("status", data.status)
      .order("score", { ascending: false })
      .order("nominated_at", { ascending: true })
      .limit(data.limit);
    if (groupFilter) q = q.in("group_id", groupFilter);
    if (typeof data.minScore === "number") q = q.gte("score", data.minScore);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      group_id: string;
      source_id: string;
      score: number;
      evidence: CandidateRow["evidence"];
      status: CandidateRow["status"];
      nominated_at: string;
      reviewed_by: string | null;
      reviewed_at: string | null;
      review_notes: string | null;
      source_groups:
        | { name: string; slug: string }
        | Array<{ name: string; slug: string }>
        | null;
      sources:
        | {
            handle: string;
            display_name: string | null;
            avatar_url: string | null;
            verified: boolean;
          }
        | Array<{
            handle: string;
            display_name: string | null;
            avatar_url: string | null;
            verified: boolean;
          }>
        | null;
    };

    // Pull bios from source_candidates (sources table has no bio).
    const handles = ((rows ?? []) as Row[])
      .map((r) => (Array.isArray(r.sources) ? r.sources[0]?.handle : r.sources?.handle))
      .filter((h): h is string => !!h)
      .map((h) => h.toLowerCase());
    const bios = new Map<string, string>();
    if (handles.length > 0) {
      const { data: bioRows } = await supabaseAdmin
        .from("source_candidates")
        .select("handle, bio")
        .in("handle", Array.from(new Set(handles)));
      for (const b of (bioRows ?? []) as Array<{ handle: string; bio: string | null }>) {
        if (b.bio) bios.set(b.handle.toLowerCase(), b.bio);
      }
    }

    return ((rows ?? []) as Row[]).map((r) => {
      const g = Array.isArray(r.source_groups) ? r.source_groups[0] : r.source_groups;
      const s = Array.isArray(r.sources) ? r.sources[0] : r.sources;
      return {
        id: r.id,
        group_id: r.group_id,
        group_name: g?.name ?? "",
        group_slug: g?.slug ?? "",
        source_id: r.source_id,
        source_handle: s?.handle ?? "",
        source_display_name: s?.display_name ?? null,
        source_avatar_url: s?.avatar_url ?? null,
        source_verified: !!s?.verified,
        source_bio: s ? bios.get(s.handle.toLowerCase()) ?? null : null,
        score: Number(r.score),
        evidence: r.evidence ?? {},
        status: r.status,
        nominated_at: r.nominated_at,
        reviewed_by: r.reviewed_by,
        reviewed_at: r.reviewed_at,
        review_notes: r.review_notes,
      };
    });
  });

// ---------------------------------------------------------------------------
// approveCandidates
// ---------------------------------------------------------------------------

export const approveCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IdsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    const { data: rows, error } = await supabaseAdmin
      .from("source_group_member_candidates")
      .select(
        "id, group_id, source_id, evidence, source_groups:group_id(name), sources:source_id(handle)",
      )
      .in("id", data.ids)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return { approved: 0 };

    type Row = {
      id: string;
      group_id: string;
      source_id: string;
      evidence: Record<string, unknown> | null;
      source_groups: { name: string } | Array<{ name: string }> | null;
      sources: { handle: string } | Array<{ handle: string }> | null;
    };
    const typed = rows as Row[];

    // Permission check per distinct group.
    const groupIds = Array.from(new Set(typed.map((r) => r.group_id)));
    for (const gid of groupIds) {
      await assertCanManageGroup(supabase, userId, gid);
    }

    // Insert memberships.
    const memberRows = typed.map((r) => ({
      group_id: r.group_id,
      source_id: r.source_id,
      added_by: userId,
      added_via: "rule",
      added_evidence: (r.evidence ?? {}) as never,
    }));
    const { error: insErr } = await supabaseAdmin
      .from("source_group_members")
      .upsert(memberRows, { onConflict: "group_id,source_id" });
    if (insErr) throw new Error(insErr.message);

    const { error: updErr } = await supabaseAdmin
      .from("source_group_member_candidates")
      .update({
        status: "approved",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_notes: data.notes ?? null,
      })
      .in("id", typed.map((r) => r.id));
    if (updErr) throw new Error(updErr.message);

    // Audit per-group bundle.
    for (const gid of groupIds) {
      const subset = typed.filter((r) => r.group_id === gid);
      const gName = (() => {
        const g = Array.isArray(subset[0].source_groups)
          ? subset[0].source_groups[0]
          : subset[0].source_groups;
        return g?.name ?? "";
      })();
      await logMembershipAction({
        actorUserId: userId,
        action: "group_membership.approve",
        metadata: {
          group_id: gid,
          group_name: gName,
          source_ids: subset.map((r) => r.source_id),
          source_handles: subset.map((r) => {
            const s = Array.isArray(r.sources) ? r.sources[0] : r.sources;
            return s?.handle ?? "";
          }),
          evidence_summary: { count: subset.length, notes: data.notes ?? null },
        },
      });
    }

    return { approved: typed.length };
  });

// ---------------------------------------------------------------------------
// rejectCandidates
// ---------------------------------------------------------------------------

export const rejectCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IdsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    const { data: rows, error } = await supabaseAdmin
      .from("source_group_member_candidates")
      .select(
        "id, group_id, source_id, source_groups:group_id(name), sources:source_id(handle)",
      )
      .in("id", data.ids)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return { rejected: 0 };

    type Row = {
      id: string;
      group_id: string;
      source_id: string;
      source_groups: { name: string } | Array<{ name: string }> | null;
      sources: { handle: string } | Array<{ handle: string }> | null;
    };
    const typed = rows as Row[];

    const groupIds = Array.from(new Set(typed.map((r) => r.group_id)));
    for (const gid of groupIds) {
      await assertCanManageGroup(supabase, userId, gid);
    }

    const { error: updErr } = await supabaseAdmin
      .from("source_group_member_candidates")
      .update({
        status: "rejected",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_notes: data.notes ?? null,
      })
      .in("id", typed.map((r) => r.id));
    if (updErr) throw new Error(updErr.message);

    for (const gid of groupIds) {
      const subset = typed.filter((r) => r.group_id === gid);
      const gName = (() => {
        const g = Array.isArray(subset[0].source_groups)
          ? subset[0].source_groups[0]
          : subset[0].source_groups;
        return g?.name ?? "";
      })();
      await logMembershipAction({
        actorUserId: userId,
        action: "group_membership.reject",
        metadata: {
          group_id: gid,
          group_name: gName,
          source_ids: subset.map((r) => r.source_id),
          source_handles: subset.map((r) => {
            const s = Array.isArray(r.sources) ? r.sources[0] : r.sources;
            return s?.handle ?? "";
          }),
          evidence_summary: { count: subset.length, notes: data.notes ?? null },
        },
      });
    }

    return { rejected: typed.length };
  });

// ---------------------------------------------------------------------------
// manualAddMembers
// ---------------------------------------------------------------------------

export const manualAddMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ManualAddSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    await assertCanManageGroup(supabase, userId, data.groupId);

    const rows = data.sourceIds.map((sourceId) => ({
      group_id: data.groupId,
      source_id: sourceId,
      added_by: userId,
      added_via: "admin",
      added_evidence: (data.evidence ?? null) as never,
    }));
    const { error } = await supabaseAdmin
      .from("source_group_members")
      .upsert(rows, { onConflict: "group_id,source_id" });
    if (error) throw new Error(error.message);

    const { data: g } = await supabaseAdmin
      .from("source_groups")
      .select("name")
      .eq("id", data.groupId)
      .maybeSingle();
    const { data: srcs } = await supabaseAdmin
      .from("sources")
      .select("handle")
      .in("id", data.sourceIds);

    await logMembershipAction({
      actorUserId: userId,
      action: "group_membership.manual_add",
      metadata: {
        group_id: data.groupId,
        group_name: (g as { name: string } | null)?.name ?? "",
        source_ids: data.sourceIds,
        source_handles: ((srcs ?? []) as Array<{ handle: string }>).map((s) => s.handle),
      },
    });

    return { added: data.sourceIds.length };
  });

// ---------------------------------------------------------------------------
// removeMember
// ---------------------------------------------------------------------------

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RemoveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    await assertCanManageGroup(supabase, userId, data.groupId);

    const { error } = await supabaseAdmin
      .from("source_group_members")
      .delete()
      .eq("group_id", data.groupId)
      .eq("source_id", data.sourceId);
    if (error) throw new Error(error.message);

    const { data: g } = await supabaseAdmin
      .from("source_groups")
      .select("name")
      .eq("id", data.groupId)
      .maybeSingle();
    const { data: src } = await supabaseAdmin
      .from("sources")
      .select("handle")
      .eq("id", data.sourceId)
      .maybeSingle();

    await logMembershipAction({
      actorUserId: userId,
      action: "group_membership.remove",
      metadata: {
        group_id: data.groupId,
        group_name: (g as { name: string } | null)?.name ?? "",
        source_ids: [data.sourceId],
        source_handles: [(src as { handle: string } | null)?.handle ?? ""],
      },
    });

    return { ok: true };
  });

// ---------------------------------------------------------------------------
// triggerNominationRun (admin debug)
// ---------------------------------------------------------------------------

const TriggerSchema = z
  .object({
    since: z.string().nullable().optional(),
    limitPerArea: z.number().int().min(1).max(500).optional(),
  })
  .default({});

export const triggerNominationRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => TriggerSchema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<NominateResult & { runtime_ms: number }> => {
    const { userId, supabase } = context;
    await assertAdmin(supabase, userId);
    const startedAt = Date.now();
    const result = await nominateForGroupsByRules({
      since: data.since ?? undefined,
      limitPerArea: data.limitPerArea ?? 50,
    });
    return { ...result, runtime_ms: Date.now() - startedAt };
  });

// ---------------------------------------------------------------------------
// listSignals / upsertSignal / deleteSignal — for the Signals admin tab
// ---------------------------------------------------------------------------

export type SignalRow = {
  id: string;
  cancer_area_id: string;
  cancer_area_name: string;
  cancer_area_slug: string;
  signal_type: "bio_keyword" | "hashtag";
  value: string;
  weight: number;
  is_active: boolean;
  notes: string | null;
};

export const listSignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SignalRow[]> => {
    const { data, error } = await supabaseAdmin
      .from("cancer_area_signals")
      .select(
        "id, cancer_area_id, signal_type, value, weight, is_active, notes, cancer_areas:cancer_area_id(name, slug, display_order)",
      )
      .order("value");
    if (error) throw new Error(error.message);
    type Row = {
      id: string;
      cancer_area_id: string;
      signal_type: "bio_keyword" | "hashtag";
      value: string;
      weight: number;
      is_active: boolean;
      notes: string | null;
      cancer_areas:
        | { name: string; slug: string; display_order: number }
        | Array<{ name: string; slug: string; display_order: number }>
        | null;
    };
    const rows = (data ?? []) as Row[];
    return rows
      .map((r) => {
        const a = Array.isArray(r.cancer_areas) ? r.cancer_areas[0] : r.cancer_areas;
        return {
          id: r.id,
          cancer_area_id: r.cancer_area_id,
          cancer_area_name: a?.name ?? "",
          cancer_area_slug: a?.slug ?? "",
          signal_type: r.signal_type,
          value: r.value,
          weight: Number(r.weight),
          is_active: r.is_active,
          notes: r.notes,
        };
      })
      .sort((a, b) =>
        a.cancer_area_name.localeCompare(b.cancer_area_name) ||
        a.signal_type.localeCompare(b.signal_type) ||
        a.value.localeCompare(b.value),
      );
  });

const UpsertSignalSchema = z.object({
  id: z.string().uuid().optional(),
  cancer_area_id: z.string().uuid(),
  signal_type: z.enum(["bio_keyword", "hashtag"]),
  value: z.string().min(1).max(120),
  weight: z.number().min(0).max(100).default(1.0),
  is_active: z.boolean().default(true),
  notes: z.string().max(500).nullable().optional(),
});

export const upsertSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpsertSignalSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    await assertAdmin(supabase, userId);
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("cancer_area_signals")
        .update({
          weight: data.weight,
          is_active: data.is_active,
          notes: data.notes ?? null,
          value: data.value,
          signal_type: data.signal_type,
          cancer_area_id: data.cancer_area_id,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("cancer_area_signals")
      .insert({
        cancer_area_id: data.cancer_area_id,
        signal_type: data.signal_type,
        value: data.value,
        weight: data.weight,
        is_active: data.is_active,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

const DeleteSignalSchema = z.object({ id: z.string().uuid() });

export const deleteSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DeleteSignalSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabaseAdmin
      .from("cancer_area_signals")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// listCandidateStats — header counts for the Candidates tab
// ---------------------------------------------------------------------------

export const candidateStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{
      pending: number;
      approved_week: number;
      rejected_week: number;
    }> => {
      const { userId, supabase } = context;
      await assertAdmin(supabase, userId);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        supabaseAdmin
          .from("source_group_member_candidates")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabaseAdmin
          .from("source_group_member_candidates")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved")
          .gte("reviewed_at", weekAgo),
        supabaseAdmin
          .from("source_group_member_candidates")
          .select("id", { count: "exact", head: true })
          .eq("status", "rejected")
          .gte("reviewed_at", weekAgo),
      ]);
      return {
        pending: pendingRes.count ?? 0,
        approved_week: approvedRes.count ?? 0,
        rejected_week: rejectedRes.count ?? 0,
      };
    },
  );

// ---------------------------------------------------------------------------
// listGroupsAdmin — small lookup for filters and the Groups tab table
// ---------------------------------------------------------------------------

export type AdminGroupRow = {
  id: string;
  slug: string;
  name: string;
  visibility: string;
  is_archived: boolean;
  member_count: number;
  subscriber_count: number;
  created_by: string | null;
  cancer_areas: Array<{ id: string; slug: string; name: string }>;
};

export const listGroupsForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminGroupRow[]> => {
    const { userId, supabase } = context;
    await assertAdmin(supabase, userId);
    const { data: groups, error } = await supabaseAdmin
      .from("source_groups")
      .select(
        "id, slug, name, visibility, is_archived, member_count, subscriber_count, created_by",
      )
      .order("name");
    if (error) throw new Error(error.message);

    const ids = ((groups ?? []) as Array<{ id: string }>).map((g) => g.id);
    const areasByGroup = new Map<string, AdminGroupRow["cancer_areas"]>();
    if (ids.length > 0) {
      const { data: junc } = await supabaseAdmin
        .from("source_group_cancer_areas")
        .select("group_id, cancer_areas:cancer_area_id(id, slug, name)")
        .in("group_id", ids);
      for (const row of (junc ?? []) as Array<{
        group_id: string;
        cancer_areas:
          | { id: string; slug: string; name: string }
          | Array<{ id: string; slug: string; name: string }>
          | null;
      }>) {
        const a = Array.isArray(row.cancer_areas) ? row.cancer_areas[0] : row.cancer_areas;
        if (!a) continue;
        const arr = areasByGroup.get(row.group_id) ?? [];
        arr.push(a);
        areasByGroup.set(row.group_id, arr);
      }
    }

    return ((groups ?? []) as AdminGroupRow[]).map((g) => ({
      ...g,
      cancer_areas: areasByGroup.get(g.id) ?? [],
    }));
  });

export type CancerAreaLite = { id: string; slug: string; name: string };

export const listCancerAreasAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<CancerAreaLite[]> => {
    const { data, error } = await supabaseAdmin
      .from("cancer_areas")
      .select("id, slug, name, display_order")
      .order("display_order")
      .order("name");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<CancerAreaLite>).map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
    }));
  });