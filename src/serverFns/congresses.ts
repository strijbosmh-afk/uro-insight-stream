import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  lookupCongress,
  type CongressLookupResult,
} from "@/server/congress-lookup.server";

async function assertEditor(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
  if (!roles.includes("admin") && !roles.includes("editor")) {
    throw new Response("Forbidden", { status: 403 });
  }
}

function genId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
}

function cleanHashtag(t: string): string {
  return t.replace(/^#+/, "").trim().toLowerCase();
}

function cleanHandle(h: string): string {
  return h.replace(/^@+/, "").trim();
}

// ---------------- LOOKUP ----------------

const LookupSchema = z.object({
  query: z.string().min(3).max(200),
});

export const lookupCongressFromQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => LookupSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertEditor(supabase, userId);
    try {
      const r = await lookupCongress(data.query);
      if (!r) return { ok: false as const, error: "lookup_failed" };
      return { ok: true as const, ...r.result, cached: r.cached };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "lookup_failed";
      return { ok: false as const, error: msg };
    }
  });

// ---------------- LIST + READ ----------------

const ListSchema = z.object({
  cancerAreaId: z.string().uuid().optional(),
  status: z.enum(["upcoming", "live", "archived", "all"]).optional(),
  search: z.string().max(200).optional(),
  sort: z.enum(["soonest", "newest"]).optional(),
});

export type CongressListItem = {
  id: string;
  name: string;
  short_code: string;
  city: string | null;
  country: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  primary_hashtags: string[];
  community_hashtags: string[];
  website: string | null;
  description: string | null;
  cancer_areas: Array<{ id: string; slug: string; name: string; is_primary: boolean }>;
  featured_count: number;
};

export const listCongressesRich = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<CongressListItem[]> => {
    let q = supabaseAdmin
      .from("congresses")
      .select(
        "id,name,short_code,city,country,start_date,end_date,status,primary_hashtags,community_hashtags,website,description",
      );
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.search) {
      const s = data.search.trim();
      if (s) q = q.or(`name.ilike.%${s}%,short_code.ilike.%${s}%,city.ilike.%${s}%`);
    }
    if (data.sort === "newest") {
      q = q.order("start_date", { ascending: false, nullsFirst: false });
    } else {
      q = q.order("start_date", { ascending: true, nullsFirst: false });
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const congresses = (rows ?? []) as Array<CongressListItem>;
    if (congresses.length === 0) return [];

    const ids = congresses.map((c) => c.id);

    const [areasRes, featuredRes, areaInfoRes] = await Promise.all([
      supabaseAdmin
        .from("congress_cancer_areas")
        .select("congress_id, cancer_area_id, is_primary")
        .in("congress_id", ids),
      supabaseAdmin
        .from("congress_featured_sources")
        .select("congress_id")
        .in("congress_id", ids),
      supabaseAdmin.from("cancer_areas").select("id, slug, name"),
    ]);
    const areaInfo = new Map(
      ((areaInfoRes.data ?? []) as Array<{ id: string; slug: string; name: string }>).map(
        (a) => [a.id, a],
      ),
    );
    const areasByCongress = new Map<string, CongressListItem["cancer_areas"]>();
    for (const r of (areasRes.data ?? []) as Array<{
      congress_id: string; cancer_area_id: string; is_primary: boolean;
    }>) {
      const info = areaInfo.get(r.cancer_area_id);
      if (!info) continue;
      const arr = areasByCongress.get(r.congress_id) ?? [];
      arr.push({ id: info.id, slug: info.slug, name: info.name, is_primary: r.is_primary });
      areasByCongress.set(r.congress_id, arr);
    }
    const featuredCount = new Map<string, number>();
    for (const r of (featuredRes.data ?? []) as Array<{ congress_id: string }>) {
      featuredCount.set(r.congress_id, (featuredCount.get(r.congress_id) ?? 0) + 1);
    }

    let result = congresses.map((c) => ({
      ...c,
      cancer_areas: areasByCongress.get(c.id) ?? [],
      featured_count: featuredCount.get(c.id) ?? 0,
    }));

    if (data.cancerAreaId) {
      result = result.filter((c) => c.cancer_areas.some((a) => a.id === data.cancerAreaId));
    }
    return result;
  });

// listCancerAreasWithCongressCount
export const listCongressCancerAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const [areasRes, juncRes] = await Promise.all([
      supabaseAdmin.from("cancer_areas").select("id, slug, name, display_order").order("display_order"),
      supabaseAdmin.from("congress_cancer_areas").select("cancer_area_id, congress_id"),
    ]);
    const counts = new Map<string, number>();
    const seen = new Set<string>(); // unique congress per area
    for (const r of (juncRes.data ?? []) as Array<{ cancer_area_id: string; congress_id: string }>) {
      const key = `${r.cancer_area_id}::${r.congress_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(r.cancer_area_id, (counts.get(r.cancer_area_id) ?? 0) + 1);
    }
    const areas = ((areasRes.data ?? []) as Array<{ id: string; slug: string; name: string; display_order: number }>)
      .map((a) => ({ ...a, count: counts.get(a.id) ?? 0 }));
    return areas;
  });

// Detail (with featured + areas)
const DetailSchema = z.object({ id: z.string().min(1) });

export type CongressDetailExtras = {
  cancer_areas: Array<{ id: string; slug: string; name: string; is_primary: boolean }>;
  community_hashtags: string[];
  website: string | null;
  description: string | null;
  featured_sources: Array<{
    source_id: string;
    handle: string;
    display_name: string;
    avatar_url: string;
    role: string | null;
    display_order: number;
    verified: boolean;
  }>;
};

export const getCongressDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DetailSchema.parse(data))
  .handler(async ({ data }): Promise<CongressDetailExtras> => {
    const [areasRes, areaInfoRes, featRes] = await Promise.all([
      supabaseAdmin
        .from("congress_cancer_areas")
        .select("cancer_area_id, is_primary")
        .eq("congress_id", data.id),
      supabaseAdmin.from("cancer_areas").select("id, slug, name"),
      supabaseAdmin
        .from("congress_featured_sources")
        .select("source_id, role, display_order, sources(handle, display_name, avatar_url, verified)")
        .eq("congress_id", data.id)
        .order("display_order", { ascending: true }),
    ]);
    const areaInfo = new Map(
      ((areaInfoRes.data ?? []) as Array<{ id: string; slug: string; name: string }>).map((a) => [a.id, a]),
    );
    const cancer_areas = ((areasRes.data ?? []) as Array<{ cancer_area_id: string; is_primary: boolean }>)
      .map((r) => {
        const info = areaInfo.get(r.cancer_area_id);
        return info ? { id: info.id, slug: info.slug, name: info.name, is_primary: r.is_primary } : null;
      })
      .filter(Boolean) as CongressDetailExtras["cancer_areas"];

    const congRes = await supabaseAdmin
      .from("congresses")
      .select("community_hashtags, website, description")
      .eq("id", data.id)
      .maybeSingle();
    const cong = (congRes.data ?? {}) as { community_hashtags?: string[]; website?: string | null; description?: string | null };

    type FeatRow = {
      source_id: string;
      role: string | null;
      display_order: number;
      sources: { handle: string; display_name: string; avatar_url: string; verified: boolean } | null;
    };
    const featured_sources = ((featRes.data ?? []) as FeatRow[])
      .filter((r) => r.sources)
      .map((r) => ({
        source_id: r.source_id,
        handle: r.sources!.handle,
        display_name: r.sources!.display_name,
        avatar_url: r.sources!.avatar_url,
        role: r.role,
        display_order: r.display_order,
        verified: r.sources!.verified,
      }));

    return {
      cancer_areas,
      community_hashtags: cong.community_hashtags ?? [],
      website: cong.website ?? null,
      description: cong.description ?? null,
      featured_sources,
    };
  });

// ---------------- CREATE / UPDATE ----------------

const KolSchema = z.object({
  handle: z.string().min(1).max(15),
  display_name: z.string().max(200).optional(),
  avatar_url: z.string().max(500).optional(),
  verified: z.boolean().optional(),
  role: z.string().max(80).nullable().optional(),
});

const WizardPayload = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(2).max(200),
  short_code: z.string().min(2).max(40),
  city: z.string().max(120).optional().default(""),
  country: z.string().max(120).optional().default(""),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["upcoming", "live", "archived"]),
  website: z.string().max(500).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  primary_hashtags: z.array(z.string().min(1).max(80)).max(10).default([]),
  community_hashtags: z.array(z.string().min(1).max(80)).max(20).default([]),
  cancer_area_ids: z.array(z.string().uuid()).min(1).max(11),
  primary_cancer_area_id: z.string().uuid(),
  kols: z.array(KolSchema).max(50).default([]),
});

async function upsertSourcesForKols(
  kols: z.infer<typeof KolSchema>[],
): Promise<Map<string, string>> {
  // returns Map<lowercase handle, source_id>
  const out = new Map<string, string>();
  if (kols.length === 0) return out;
  const handles = kols.map((k) => cleanHandle(k.handle).toLowerCase()).filter(Boolean);
  if (handles.length === 0) return out;

  const { data: existing } = await supabaseAdmin
    .from("sources")
    .select("id, handle")
    .in("handle", handles);
  for (const r of (existing ?? []) as Array<{ id: string; handle: string }>) {
    out.set(r.handle.toLowerCase(), r.id);
  }

  const toInsert = kols.filter((k) => !out.has(cleanHandle(k.handle).toLowerCase()));
  if (toInsert.length > 0) {
    const rows = toInsert.map((k) => {
      const handle = cleanHandle(k.handle);
      return {
        id: `src_${handle.toLowerCase()}`,
        handle: handle.toLowerCase(),
        display_name: k.display_name?.trim() || handle,
        avatar_url: k.avatar_url ?? "",
        role: "KOL",
        verified: !!k.verified,
        active: true,
      };
    });
    const { data: inserted } = await supabaseAdmin
      .from("sources")
      .upsert(rows, { onConflict: "handle" })
      .select("id, handle");
    for (const r of (inserted ?? []) as Array<{ id: string; handle: string }>) {
      out.set(r.handle.toLowerCase(), r.id);
    }
  }
  return out;
}

async function writeJunctions(
  congressId: string,
  payload: z.infer<typeof WizardPayload>,
  userId: string,
) {
  // cancer_areas: replace all
  await supabaseAdmin.from("congress_cancer_areas").delete().eq("congress_id", congressId);
  const areaRows = payload.cancer_area_ids.map((cancer_area_id) => ({
    congress_id: congressId,
    cancer_area_id,
    is_primary: cancer_area_id === payload.primary_cancer_area_id,
  }));
  if (areaRows.length > 0) {
    const { error } = await supabaseAdmin.from("congress_cancer_areas").insert(areaRows);
    if (error) throw new Error(`cancer_areas insert failed: ${error.message}`);
  }

  // featured sources: replace all
  await supabaseAdmin.from("congress_featured_sources").delete().eq("congress_id", congressId);
  if (payload.kols.length > 0) {
    const handleToSource = await upsertSourcesForKols(payload.kols);
    const featRows = payload.kols
      .map((k, idx) => {
        const sid = handleToSource.get(cleanHandle(k.handle).toLowerCase());
        if (!sid) return null;
        return {
          congress_id: congressId,
          source_id: sid,
          role: k.role ?? null,
          display_order: idx,
          added_by: userId,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (featRows.length > 0) {
      const { error } = await supabaseAdmin
        .from("congress_featured_sources")
        .insert(featRows);
      if (error) throw new Error(`featured_sources insert failed: ${error.message}`);
    }
  }
}

export const createCongressFromWizard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => WizardPayload.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertEditor(supabase, userId);

    if (!data.cancer_area_ids.includes(data.primary_cancer_area_id)) {
      throw new Error("primary_cancer_area_id must be in cancer_area_ids");
    }
    const id = genId();
    const insertRow = {
      id,
      name: data.name.trim(),
      short_code: data.short_code.trim().toUpperCase(),
      city: data.city ?? "",
      country: data.country ?? "",
      start_date: data.start_date ?? null,
      end_date: data.end_date ?? null,
      status: data.status,
      primary_hashtags: data.primary_hashtags.map(cleanHashtag).filter(Boolean),
      community_hashtags: data.community_hashtags.map(cleanHashtag).filter(Boolean),
      website: data.website ?? null,
      description: data.description ?? null,
      created_by: userId,
    };
    const { error } = await supabaseAdmin.from("congresses").insert(insertRow);
    if (error) throw new Error(error.message);

    await writeJunctions(id, data, userId);

    await supabaseAdmin.from("audit_log").insert({
      actor_id: userId,
      action: "congress.create",
      target_type: "congress",
      target_id: id,
      summary: `Created ${insertRow.short_code} — ${insertRow.name}`,
      after: { short_code: insertRow.short_code, status: insertRow.status },
    });

    return { id };
  });

export const updateCongressFromWizard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => WizardPayload.extend({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertEditor(supabase, userId);
    if (!data.cancer_area_ids.includes(data.primary_cancer_area_id)) {
      throw new Error("primary_cancer_area_id must be in cancer_area_ids");
    }
    const id = data.id;
    const updateRow = {
      name: data.name.trim(),
      short_code: data.short_code.trim().toUpperCase(),
      city: data.city ?? "",
      country: data.country ?? "",
      start_date: data.start_date ?? null,
      end_date: data.end_date ?? null,
      status: data.status,
      primary_hashtags: data.primary_hashtags.map(cleanHashtag).filter(Boolean),
      community_hashtags: data.community_hashtags.map(cleanHashtag).filter(Boolean),
      website: data.website ?? null,
      description: data.description ?? null,
    };
    const { error } = await supabaseAdmin.from("congresses").update(updateRow).eq("id", id);
    if (error) throw new Error(error.message);

    await writeJunctions(id, data, userId);

    await supabaseAdmin.from("audit_log").insert({
      actor_id: userId,
      action: "congress.update",
      target_type: "congress",
      target_id: id,
      summary: `Updated ${updateRow.short_code}`,
      after: { short_code: updateRow.short_code, status: updateRow.status },
    });

    return { id };
  });

// Allow loading wizard payload to edit
export const getCongressForWizard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DetailSchema.parse(data))
  .handler(async ({ data }) => {
    const congRes = await supabaseAdmin
      .from("congresses")
      .select(
        "id,name,short_code,city,country,start_date,end_date,status,primary_hashtags,community_hashtags,website,description",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (!congRes.data) throw new Error("Congress not found");
    const detail = await getCongressDetail({ data: { id: data.id } });
    return {
      congress: congRes.data,
      cancer_areas: detail.cancer_areas,
      featured_sources: detail.featured_sources,
    };
  });

export type LookupCongressResponse = CongressLookupResult & { ok: true; cached: boolean };

// Subscribe to a featured KOL
const SubscribeSchema = z.object({ source_id: z.string().min(1) });
export const subscribeToSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SubscribeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_subscribed_sources")
      .upsert({ user_id: userId, source_id: data.source_id }, { onConflict: "user_id,source_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });