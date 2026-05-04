import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Types returned to the client
// ---------------------------------------------------------------------------

export type GroupVisibility = "official" | "public" | "private";

export type GroupSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: GroupVisibility;
  is_archived: boolean;
  is_system: boolean;
  member_count: number;
  subscriber_count: number;
  created_by: string | null;
  created_at: string;
  cancer_areas: Array<{ id: string; slug: string; name: string }>;
  is_subscribed: boolean;
};

export type GroupDetail = GroupSummary & {
  can_edit: boolean;
  members: Array<{
    source_id: string;
    handle: string;
    display_name: string | null;
    avatar_url: string | null;
    verified: boolean;
  }>;
};

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ListGroupsSchema = z
  .object({
    search: z.string().max(200).optional(),
    cancerAreaId: z.string().uuid().optional(),
    visibility: z.enum(["official", "public", "private", "any"]).optional(),
    sort: z.enum(["popular", "recent", "alphabetical"]).default("popular"),
    includeArchived: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(60),
  })
  .default({});

const IdSchema = z.object({ id: z.string().uuid() });
const IdOrSlugSchema = z.object({ idOrSlug: z.string().min(1).max(120) });

// ---------------------------------------------------------------------------
// Helpers (server-only)
// ---------------------------------------------------------------------------

type AreaRow = { id: string; slug: string; name: string };

async function fetchAreasForGroups(
  groupIds: string[],
): Promise<Map<string, AreaRow[]>> {
  const out = new Map<string, AreaRow[]>();
  if (groupIds.length === 0) return out;
  const { data, error } = await supabaseAdmin
    .from("source_group_cancer_areas")
    .select("group_id, cancer_areas:cancer_area_id ( id, slug, name )")
    .in("group_id", groupIds);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{
    group_id: string;
    cancer_areas: AreaRow | AreaRow[] | null;
  }>) {
    const area = Array.isArray(row.cancer_areas)
      ? row.cancer_areas[0]
      : row.cancer_areas;
    if (!area) continue;
    const arr = out.get(row.group_id) ?? [];
    arr.push(area);
    out.set(row.group_id, arr);
  }
  return out;
}

async function fetchSubscribedGroupIds(userId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("user_subscribed_groups")
    .select("group_id")
    .eq("user_id", userId);
  return new Set(
    ((data ?? []) as Array<{ group_id: string }>).map((r) => r.group_id),
  );
}

// ---------------------------------------------------------------------------
// listGroups — filter, search, sort, with subscription status for current user.
// ---------------------------------------------------------------------------

export const listGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListGroupsSchema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<GroupSummary[]> => {
    const { userId } = context;

    // Pre-filter by cancer area via the junction
    let groupIdFilter: string[] | null = null;
    if (data.cancerAreaId) {
      const { data: junc } = await supabaseAdmin
        .from("source_group_cancer_areas")
        .select("group_id")
        .eq("cancer_area_id", data.cancerAreaId);
      groupIdFilter = ((junc ?? []) as Array<{ group_id: string }>).map(
        (r) => r.group_id,
      );
      if (groupIdFilter.length === 0) return [];
    }

    let q = supabaseAdmin
      .from("source_groups")
      .select(
        "id, slug, name, description, visibility, is_archived, is_system, member_count, subscriber_count, created_by, created_at",
      )
      .limit(data.limit);

    if (!data.includeArchived) q = q.eq("is_archived", false);
    if (groupIdFilter) q = q.in("id", groupIdFilter);
    if (data.visibility && data.visibility !== "any") {
      q = q.eq("visibility", data.visibility);
    } else {
      // Default visibility scope: official + public + own private
      q = q.or(`visibility.in.(official,public),created_by.eq.${userId}`);
    }
    if (data.search) {
      const term = data.search.replace(/%/g, "");
      q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
    }
    if (data.sort === "popular") {
      q = q.order("subscriber_count", { ascending: false }).order("name");
    } else if (data.sort === "recent") {
      q = q.order("created_at", { ascending: false });
    } else {
      q = q.order("name");
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const groups = (rows ?? []) as Array<Omit<GroupSummary, "cancer_areas" | "is_subscribed">>;
    const ids = groups.map((g) => g.id);
    const [areasByGroup, subscribed] = await Promise.all([
      fetchAreasForGroups(ids),
      fetchSubscribedGroupIds(userId),
    ]);

    return groups.map((g) => ({
      ...g,
      cancer_areas: areasByGroup.get(g.id) ?? [],
      is_subscribed: subscribed.has(g.id),
    }));
  });

// ---------------------------------------------------------------------------
// getGroup — full detail with members + can_edit
// ---------------------------------------------------------------------------

export const getGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IdOrSlugSchema.parse(data))
  .handler(async ({ data, context }): Promise<GroupDetail> => {
    const { userId, supabase } = context;
    const isUuid = /^[0-9a-f-]{36}$/i.test(data.idOrSlug);

    let q = supabaseAdmin.from("source_groups").select("*").limit(1);
    q = isUuid ? q.eq("id", data.idOrSlug) : q.eq("slug", data.idOrSlug);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const g = (rows ?? [])[0] as
      | (GroupSummary & { is_archived: boolean; is_system: boolean })
      | undefined;
    if (!g) throw new Error("Group not found");

    // Visibility check (mirror RLS) — service-role bypasses RLS so do it here.
    if (g.visibility === "private") {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin");
      const isAdmin = (roleRows ?? []).length > 0;
      if (g.created_by !== userId && !isAdmin) {
        throw new Error("Group not found");
      }
    }

    const [areasByGroup, subscribed, membersRes, adminCheck] = await Promise.all([
      fetchAreasForGroups([g.id]),
      fetchSubscribedGroupIds(userId),
      supabaseAdmin
        .from("source_group_members")
        .select(
          "source_id, sources:source_id ( handle, display_name, avatar_url, verified )",
        )
        .eq("group_id", g.id)
        .order("added_at", { ascending: false })
        .limit(500),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin"),
    ]);

    const isAdmin = (adminCheck.data ?? []).length > 0;
    const members = ((membersRes.data ?? []) as Array<{
      source_id: string;
      sources:
        | { handle: string; display_name: string | null; avatar_url: string | null; verified: boolean }
        | Array<{ handle: string; display_name: string | null; avatar_url: string | null; verified: boolean }>
        | null;
    }>).map((row) => {
      const s = Array.isArray(row.sources) ? row.sources[0] : row.sources;
      return {
        source_id: row.source_id,
        handle: s?.handle ?? "",
        display_name: s?.display_name ?? null,
        avatar_url: s?.avatar_url ?? null,
        verified: !!s?.verified,
      };
    });

    return {
      ...g,
      cancer_areas: areasByGroup.get(g.id) ?? [],
      is_subscribed: subscribed.has(g.id),
      can_edit: g.created_by === userId || isAdmin,
      members,
    };
  });

// ---------------------------------------------------------------------------
// subscribe / unsubscribe
// ---------------------------------------------------------------------------

export const subscribeToGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Use the user-context client so RLS enforces visibility/archived rules.
    const { error } = await context.supabase
      .from("user_subscribed_groups")
      .insert({ user_id: userId, group_id: data.id });
    if (error && !/duplicate key/i.test(error.message)) {
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const unsubscribeFromGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => IdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await context.supabase
      .from("user_subscribed_groups")
      .delete()
      .eq("user_id", userId)
      .eq("group_id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// getRecommendedGroups — official groups in the caller's cancer areas they
// don't yet follow, ordered by popularity.
// ---------------------------------------------------------------------------

export const getRecommendedGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GroupSummary[]> => {
    const { userId } = context;

    const { data: areaRows } = await supabaseAdmin
      .from("user_cancer_areas")
      .select("cancer_area_id")
      .eq("user_id", userId);
    const areaIds = ((areaRows ?? []) as Array<{ cancer_area_id: string }>).map(
      (r) => r.cancer_area_id,
    );
    if (areaIds.length === 0) return [];

    const { data: junc } = await supabaseAdmin
      .from("source_group_cancer_areas")
      .select("group_id")
      .in("cancer_area_id", areaIds);
    const groupIds = Array.from(
      new Set(((junc ?? []) as Array<{ group_id: string }>).map((r) => r.group_id)),
    );
    if (groupIds.length === 0) return [];

    const subscribed = await fetchSubscribedGroupIds(userId);
    const candidateIds = groupIds.filter((id) => !subscribed.has(id));
    if (candidateIds.length === 0) return [];

    const { data: rows, error } = await supabaseAdmin
      .from("source_groups")
      .select(
        "id, slug, name, description, visibility, is_archived, is_system, member_count, subscriber_count, created_by, created_at",
      )
      .in("id", candidateIds)
      .eq("visibility", "official")
      .eq("is_archived", false)
      .order("subscriber_count", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    const groups = (rows ?? []) as Array<Omit<GroupSummary, "cancer_areas" | "is_subscribed">>;
    const areasByGroup = await fetchAreasForGroups(groups.map((g) => g.id));
    return groups.map((g) => ({
      ...g,
      cancer_areas: areasByGroup.get(g.id) ?? [],
      is_subscribed: false,
    }));
  });

// ---------------------------------------------------------------------------
// listCancerAreas — used by the Discover header chips
// ---------------------------------------------------------------------------

export const listCancerAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<Array<{ id: string; slug: string; name: string; short_description: string | null }>> => {
    const { data, error } = await supabaseAdmin
      .from("cancer_areas")
      .select("id, slug, name, short_description, display_order")
      .order("display_order", { ascending: true })
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { id: string; slug: string; name: string; short_description: string | null }) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      short_description: r.short_description,
    }));
  });