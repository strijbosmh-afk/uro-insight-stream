// Server-only rules engine that nominates sources for cancer-area KOL groups
// based on a per-area dictionary (bio_keyword + hashtag signals).
//
// Wires into a nightly cron (see /api/public/hooks/nominate-group-members).
// Schema is designed so additional providers — `added_via='llm'` and
// `added_via='co_subscription'` — can be plugged in later without changing
// the candidates table.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Tunable threshold — minimum score for a source to be nominated to a group.
const SCORE_THRESHOLD = 1.5;
const MAX_BIO_MATCHES_COUNTED = 5;
const HASHTAG_LOOKBACK_DAYS = 30;

export type NominateResult = {
  scanned: number;
  nominated: number;
  updated: number;
  skippedDenylist: number;
};

type Signal = { id: string; value: string; weight: number };
type AreaDict = {
  cancer_area_id: string;
  bio: Signal[];
  hashtags: Signal[];
};

type SourceRow = {
  id: string;
  handle: string;
  bio: string | null;
  updated_at: string;
};

type Evidence = {
  bio_matches: Array<{ value: string; weight: number }>;
  hashtag_matches: Array<{ tag: string; count: number; weight: number }>;
  breakdown: { bio_score: number; hashtag_score: number; total: number };
};

export async function nominateForGroupsByRules(
  opts: { since?: string | null; limitPerArea?: number } = {},
): Promise<NominateResult> {
  const { since: sinceArg, limitPerArea = 50 } = opts;
  const since =
    sinceArg === null
      ? null
      : (sinceArg ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  // ---- 1. Load active signals, grouped by cancer area --------------------
  const { data: signalRows, error: signalErr } = await supabaseAdmin
    .from("cancer_area_signals")
    .select("id, cancer_area_id, signal_type, value, weight, is_active")
    .eq("is_active", true);
  if (signalErr) throw new Error(`signals: ${signalErr.message}`);

  const dictByArea = new Map<string, AreaDict>();
  for (const s of (signalRows ?? []) as Array<{
    id: string;
    cancer_area_id: string;
    signal_type: "bio_keyword" | "hashtag";
    value: string;
    weight: number;
  }>) {
    let d = dictByArea.get(s.cancer_area_id);
    if (!d) {
      d = { cancer_area_id: s.cancer_area_id, bio: [], hashtags: [] };
      dictByArea.set(s.cancer_area_id, d);
    }
    const sig: Signal = { id: s.id, value: s.value, weight: Number(s.weight) };
    if (s.signal_type === "bio_keyword") d.bio.push(sig);
    else d.hashtags.push({ ...sig, value: s.value.replace(/^#/, "").toLowerCase() });
  }

  if (dictByArea.size === 0) {
    return { scanned: 0, nominated: 0, updated: 0, skippedDenylist: 0 };
  }

  // ---- 2. Map cancer_area_id -> list of official non-archived groups -----
  const { data: junc, error: juncErr } = await supabaseAdmin
    .from("source_group_cancer_areas")
    .select("cancer_area_id, group_id, source_groups:group_id(id, visibility, is_archived)");
  if (juncErr) throw new Error(`area_groups: ${juncErr.message}`);

  const groupsByArea = new Map<string, string[]>();
  for (const row of (junc ?? []) as Array<{
    cancer_area_id: string;
    group_id: string;
    source_groups:
      | { id: string; visibility: string; is_archived: boolean }
      | Array<{ id: string; visibility: string; is_archived: boolean }>
      | null;
  }>) {
    const g = Array.isArray(row.source_groups) ? row.source_groups[0] : row.source_groups;
    if (!g || g.is_archived || g.visibility !== "official") continue;
    const arr = groupsByArea.get(row.cancer_area_id) ?? [];
    arr.push(row.group_id);
    groupsByArea.set(row.cancer_area_id, arr);
  }

  // ---- 3. Load enriched sources (with a bio) updated since cutoff --------
  const sources: SourceRow[] = [];
  const PAGE = 1000;
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    let q = supabaseAdmin
      .from("sources")
      .select("id, handle, updated_at")
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (since) q = q.gte("updated_at", since);
    const { data, error } = await q;
    if (error) throw new Error(`sources: ${error.message}`);
    if (!data || data.length === 0) break;
    // Merge bios from candidates (sources table has no bio column) — best-effort.
    sources.push(
      ...data.map((r: { id: string; handle: string; updated_at: string }) => ({
        id: r.id,
        handle: r.handle,
        updated_at: r.updated_at,
        bio: null,
      })),
    );
    if (data.length < PAGE) break;
    offset += data.length;
  }

  // Pull bios from source_candidates (where enrichment lives) keyed by handle.
  if (sources.length > 0) {
    const handles = sources.map((s) => s.handle);
    const bios = new Map<string, string>();
    for (let i = 0; i < handles.length; i += 500) {
      const chunk = handles.slice(i, i + 500);
      const { data } = await supabaseAdmin
        .from("source_candidates")
        .select("handle, bio")
        .in("handle", chunk);
      for (const r of (data ?? []) as Array<{ handle: string; bio: string | null }>) {
        if (r.bio) bios.set(r.handle.toLowerCase(), r.bio);
      }
    }
    for (const s of sources) {
      const b = bios.get(s.handle.toLowerCase());
      if (b) s.bio = b;
    }
  }

  if (sources.length === 0) {
    return { scanned: 0, nominated: 0, updated: 0, skippedDenylist: 0 };
  }

  // ---- 4. Hashtag counts per source over last 30d -------------------------
  const hashtagCutoff = new Date(
    Date.now() - HASHTAG_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const tagCounts = new Map<string, Map<string, number>>(); // source_id -> tag -> count
  const sourceIds = sources.map((s) => s.id);
  for (let i = 0; i < sourceIds.length; i += 200) {
    const chunk = sourceIds.slice(i, i + 200);
    let tOffset = 0;
    for (let p = 0; p < 20; p++) {
      const { data, error } = await supabaseAdmin
        .from("tweets")
        .select("source_id, hashtags")
        .in("source_id", chunk)
        .gte("created_at", hashtagCutoff)
        .range(tOffset, tOffset + PAGE - 1);
      if (error) throw new Error(`tweets: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const t of data as Array<{ source_id: string; hashtags: string[] | null }>) {
        const tags = t.hashtags ?? [];
        if (tags.length === 0) continue;
        let m = tagCounts.get(t.source_id);
        if (!m) {
          m = new Map();
          tagCounts.set(t.source_id, m);
        }
        for (const raw of tags) {
          const tag = String(raw).replace(/^#/, "").toLowerCase();
          if (!tag) continue;
          m.set(tag, (m.get(tag) ?? 0) + 1);
        }
      }
      if (data.length < PAGE) break;
      tOffset += data.length;
    }
  }

  // ---- 5. Existing memberships and rejected denylist ---------------------
  const memberSet = new Set<string>(); // `${group_id}:${source_id}`
  const rejectedSet = new Set<string>(); // `${group_id}:${source_id}`
  {
    const { data } = await supabaseAdmin
      .from("source_group_members")
      .select("group_id, source_id")
      .in("source_id", sourceIds);
    for (const r of (data ?? []) as Array<{ group_id: string; source_id: string }>) {
      memberSet.add(`${r.group_id}:${r.source_id}`);
    }
  }
  {
    const { data } = await supabaseAdmin
      .from("source_group_member_candidates")
      .select("group_id, source_id, status")
      .in("source_id", sourceIds)
      .eq("status", "rejected");
    for (const r of (data ?? []) as Array<{ group_id: string; source_id: string }>) {
      rejectedSet.add(`${r.group_id}:${r.source_id}`);
    }
  }

  // ---- 6. Score sources per area, rank, upsert candidates -----------------
  type Nomination = {
    group_id: string;
    source_id: string;
    score: number;
    evidence: Evidence;
  };
  const nominationsByArea = new Map<string, Nomination[]>();

  for (const src of sources) {
    const lowerBio = (src.bio ?? "").toLowerCase();
    const tags = tagCounts.get(src.id) ?? new Map<string, number>();

    for (const [areaId, dict] of dictByArea) {
      const groups = groupsByArea.get(areaId);
      if (!groups || groups.length === 0) continue;

      // bio score (cap unique matches at 5)
      const bioMatches: Evidence["bio_matches"] = [];
      if (lowerBio) {
        for (const sig of dict.bio) {
          if (bioMatches.length >= MAX_BIO_MATCHES_COUNTED) break;
          if (lowerBio.includes(sig.value.toLowerCase())) {
            bioMatches.push({ value: sig.value, weight: sig.weight });
          }
        }
      }
      const bio_score = bioMatches.reduce((acc, m) => acc + m.weight, 0);

      // hashtag score
      const hashtagMatches: Evidence["hashtag_matches"] = [];
      let hashtag_score = 0;
      for (const sig of dict.hashtags) {
        const count = tags.get(sig.value) ?? 0;
        if (count > 0) {
          const contribution = sig.weight * Math.log1p(count);
          hashtag_score += contribution;
          hashtagMatches.push({ tag: sig.value, count, weight: sig.weight });
        }
      }

      const total = bio_score + hashtag_score;
      if (total < SCORE_THRESHOLD) continue;

      const evidence: Evidence = {
        bio_matches: bioMatches,
        hashtag_matches: hashtagMatches.sort((a, b) => b.count - a.count),
        breakdown: { bio_score, hashtag_score, total },
      };

      const list = nominationsByArea.get(areaId) ?? [];
      for (const groupId of groups) {
        const key = `${groupId}:${src.id}`;
        if (memberSet.has(key)) continue;
        list.push({ group_id: groupId, source_id: src.id, score: total, evidence });
      }
      nominationsByArea.set(areaId, list);
    }
  }

  // Cap per-area then merge.
  let nominated = 0;
  let updated = 0;
  let skippedDenylist = 0;
  const toUpsert: Nomination[] = [];
  for (const [, list] of nominationsByArea) {
    list.sort((a, b) => b.score - a.score);
    for (const n of list.slice(0, limitPerArea)) {
      const key = `${n.group_id}:${n.source_id}`;
      if (rejectedSet.has(key)) {
        skippedDenylist++;
        continue;
      }
      toUpsert.push(n);
    }
  }

  // Look up which target rows already exist as 'pending' (we only update those;
  // approved/rejected rows must be left untouched per spec).
  if (toUpsert.length > 0) {
    const groupIds = Array.from(new Set(toUpsert.map((n) => n.group_id)));
    const sIds = Array.from(new Set(toUpsert.map((n) => n.source_id)));
    const { data: existing } = await supabaseAdmin
      .from("source_group_member_candidates")
      .select("group_id, source_id, status")
      .in("group_id", groupIds)
      .in("source_id", sIds);
    const statusByKey = new Map<string, string>();
    for (const r of (existing ?? []) as Array<{
      group_id: string;
      source_id: string;
      status: string;
    }>) {
      statusByKey.set(`${r.group_id}:${r.source_id}`, r.status);
    }

    const inserts: Array<{
      group_id: string;
      source_id: string;
      score: number;
      evidence: Evidence;
    }> = [];
    const updates: Nomination[] = [];
    for (const n of toUpsert) {
      const k = `${n.group_id}:${n.source_id}`;
      const status = statusByKey.get(k);
      if (!status) inserts.push(n);
      else if (status === "pending") updates.push(n);
      // approved/rejected: skip silently (no-op per spec).
    }

    for (let i = 0; i < inserts.length; i += 500) {
      const chunk = inserts.slice(i, i + 500);
      const { error } = await supabaseAdmin
        .from("source_group_member_candidates")
        .insert(
          chunk.map((n) => ({
            group_id: n.group_id,
            source_id: n.source_id,
            score: n.score,
            evidence: n.evidence as never,
            status: "pending",
          })),
        );
      if (error) throw new Error(`candidates_insert: ${error.message}`);
      nominated += chunk.length;
    }

    for (const u of updates) {
      const { error } = await supabaseAdmin
        .from("source_group_member_candidates")
        .update({
          score: u.score,
          evidence: u.evidence as never,
          nominated_at: new Date().toISOString(),
        })
        .eq("group_id", u.group_id)
        .eq("source_id", u.source_id)
        .eq("status", "pending");
      if (error) throw new Error(`candidates_update: ${error.message}`);
      updated++;
    }
  }

  return {
    scanned: sources.length,
    nominated,
    updated,
    skippedDenylist,
  };
}