// Server-only: AI-assisted online congress lookup with 24-hour cache.
// Uses the Lovable AI Gateway (gemini-2.5-pro) with a strict tool-call schema.

import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CongressLookupKol = { handle: string; reason: string };
export type CongressLookupCitation = { url: string; title: string };

export type CongressLookupResult = {
  name: string | null;
  short_code: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  description: string | null;
  primary_hashtags: string[];
  community_hashtags: string[];
  cancer_area_slugs: string[];
  suggested_kols: CongressLookupKol[];
  citations: CongressLookupCitation[];
  confidence: "high" | "medium" | "low";
  no_match: boolean;
};

const CACHE_TTL_HOURS = 24;

function normalize(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

function hashQuery(query: string): string {
  return createHash("sha256").update(normalize(query)).digest("hex");
}

function emptyResult(): CongressLookupResult {
  return {
    name: null,
    short_code: null,
    start_date: null,
    end_date: null,
    city: null,
    country: null,
    website: null,
    description: null,
    primary_hashtags: [],
    community_hashtags: [],
    cancer_area_slugs: [],
    suggested_kols: [],
    citations: [],
    confidence: "low",
    no_match: true,
  };
}

function cleanHashtag(t: string): string {
  return t.replace(/^#+/, "").trim().toLowerCase();
}

function cleanHandle(h: string): string {
  return h.replace(/^@+/, "").trim();
}

function buildSystemPrompt(slugs: string[]): string {
  return `You identify medical / oncology congresses for a research database.

Return data ONLY for real, well-known scientific congresses (e.g. ASCO GU, ESMO, EAU, ASH, SABCS).
Do not fabricate names, dates, hashtags, URLs, or X/Twitter handles. If you are not confident,
return null for that field and lower the overall confidence.

Cancer-area taxonomy (use ONLY these slugs, never invent new ones):
${slugs.join(", ")}

Mapping guidance:
- urological: prostate, kidney, bladder, testicular, GU
- breast: SABCS, breast oncology
- gi: gastric, colorectal, pancreatic, ESMO GI, ASCO GI
- lung: WCLC, lung cancer
- gynecological: ovarian, cervical, endometrial, SGO
- hematological: ASH, EHA, lymphoma, leukemia, myeloma
- head_neck, skin (melanoma), neuro, sarcoma, pediatric

Hashtag rules:
- primary_hashtags: 1-3 OFFICIAL congress hashtags (no leading "#"), lowercased.
- community_hashtags: up to 5 commonly-used variants / topical tags (no leading "#").

KOL rules:
- 5-10 X/Twitter handles known to actively cover this congress (no leading "@").
- Each gets a one-line "reason" (e.g. "Prostate cancer KOL, frequent ASCO GU commentator").
- Do not invent handles. If unsure, return fewer.

Citations: include 2-5 supporting URLs with titles (official site, conference page, society page).

confidence:
- high: well-known major congress, high certainty in dates + location.
- medium: known event but some fields uncertain.
- low: ambiguous or speculative — set no_match=true if you cannot identify the event at all.

Dates as YYYY-MM-DD, or null. Country in English. Description: 1-2 sentences.`;
}

const TOOL = {
  type: "function" as const,
  function: {
    name: "return_congress_lookup",
    description: "Return structured data about the requested medical congress.",
    parameters: {
      type: "object",
      properties: {
        no_match: { type: "boolean" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        name: { type: ["string", "null"] },
        short_code: { type: ["string", "null"] },
        start_date: { type: ["string", "null"] },
        end_date: { type: ["string", "null"] },
        city: { type: ["string", "null"] },
        country: { type: ["string", "null"] },
        website: { type: ["string", "null"] },
        description: { type: ["string", "null"] },
        primary_hashtags: { type: "array", items: { type: "string" } },
        community_hashtags: { type: "array", items: { type: "string" } },
        cancer_area_slugs: { type: "array", items: { type: "string" } },
        suggested_kols: {
          type: "array",
          items: {
            type: "object",
            properties: {
              handle: { type: "string" },
              reason: { type: "string" },
            },
            required: ["handle", "reason"],
            additionalProperties: false,
          },
        },
        citations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              title: { type: "string" },
            },
            required: ["url", "title"],
            additionalProperties: false,
          },
        },
      },
      required: [
        "no_match",
        "confidence",
        "name",
        "short_code",
        "start_date",
        "end_date",
        "city",
        "country",
        "website",
        "description",
        "primary_hashtags",
        "community_hashtags",
        "cancer_area_slugs",
        "suggested_kols",
        "citations",
      ],
      additionalProperties: false,
    },
  },
};

function sanitizeResult(
  raw: Partial<CongressLookupResult>,
  validSlugs: Set<string>,
): CongressLookupResult {
  const out: CongressLookupResult = emptyResult();
  out.no_match = !!raw.no_match;
  out.confidence = (raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low")
    ? raw.confidence
    : "low";
  out.name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;
  out.short_code = typeof raw.short_code === "string" && raw.short_code.trim()
    ? raw.short_code.trim().toUpperCase()
    : null;
  out.start_date = typeof raw.start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.start_date) ? raw.start_date : null;
  out.end_date = typeof raw.end_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.end_date) ? raw.end_date : null;
  out.city = typeof raw.city === "string" && raw.city.trim() ? raw.city.trim() : null;
  out.country = typeof raw.country === "string" && raw.country.trim() ? raw.country.trim() : null;
  out.website = typeof raw.website === "string" && /^https?:\/\//i.test(raw.website) ? raw.website.trim() : null;
  out.description = typeof raw.description === "string" && raw.description.trim() ? raw.description.trim().slice(0, 1000) : null;

  const phs = Array.isArray(raw.primary_hashtags) ? raw.primary_hashtags : [];
  out.primary_hashtags = Array.from(new Set(phs.map(cleanHashtag).filter(Boolean))).slice(0, 5);
  const chs = Array.isArray(raw.community_hashtags) ? raw.community_hashtags : [];
  out.community_hashtags = Array.from(new Set(chs.map(cleanHashtag).filter(Boolean))).slice(0, 8);

  const slugs = Array.isArray(raw.cancer_area_slugs) ? raw.cancer_area_slugs : [];
  out.cancer_area_slugs = Array.from(
    new Set(slugs.map((s) => String(s).trim().toLowerCase()).filter((s) => validSlugs.has(s))),
  );

  const kols = Array.isArray(raw.suggested_kols) ? raw.suggested_kols : [];
  const seenHandles = new Set<string>();
  out.suggested_kols = [];
  for (const k of kols) {
    if (!k || typeof k.handle !== "string") continue;
    const h = cleanHandle(k.handle);
    if (!/^[A-Za-z0-9_]{1,15}$/.test(h)) continue;
    const key = h.toLowerCase();
    if (seenHandles.has(key)) continue;
    seenHandles.add(key);
    out.suggested_kols.push({
      handle: h,
      reason: typeof k.reason === "string" ? k.reason.trim().slice(0, 280) : "",
    });
    if (out.suggested_kols.length >= 12) break;
  }

  const cites = Array.isArray(raw.citations) ? raw.citations : [];
  out.citations = cites
    .filter((c) => c && typeof c.url === "string" && /^https?:\/\//i.test(c.url))
    .slice(0, 8)
    .map((c) => ({
      url: c.url,
      title: typeof c.title === "string" ? c.title.slice(0, 200) : c.url,
    }));

  return out;
}

async function callGateway(query: string, slugs: string[]): Promise<CongressLookupResult | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.error("[congress-lookup] LOVABLE_API_KEY missing");
    return null;
  }
  const url = "https://ai.gateway.lovable.dev/v1/chat/completions";
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  // STEP 1 — grounded research call. Use Gemini's google_search tool so the
  // model fetches real, current facts (city, dates, website, official hashtag)
  // rather than relying on stale training data. We ask for a brief textual
  // brief that the structured-extraction step will consume.
  const groundingPrompt = `Research this medical/oncology congress using Google Search and produce a short factual brief.

Query: "${query}"

Return a concise brief (max ~250 words) with these labelled fields, EACH on its own line, using only verified facts from the search results. Use "unknown" if a fact cannot be confirmed.

OFFICIAL_NAME: ...
SHORT_CODE: ...
START_DATE (YYYY-MM-DD): ...
END_DATE (YYYY-MM-DD): ...
CITY: ...
COUNTRY: ...
OFFICIAL_WEBSITE: ...
OFFICIAL_HASHTAGS: #tag1, #tag2
COMMUNITY_HASHTAGS: #tag1, #tag2
ONE_LINE_DESCRIPTION: ...
SOURCES: list 2-5 URLs (one per line) you actually used.

Do not guess. If the venue/city has been announced for a future edition, cite the official society page.`;

  const groundRes = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: "You are a precise research assistant. Only state facts confirmed by the search results. If unsure, write 'unknown'." },
        { role: "user", content: groundingPrompt },
      ],
      tools: [{ type: "google_search" }],
    }),
  });
  if (groundRes.status === 429 || groundRes.status === 402) {
    throw new Error(groundRes.status === 429 ? "rate_limited" : "payment_required");
  }
  if (!groundRes.ok) {
    console.error("[congress-lookup] grounding error", groundRes.status, await groundRes.text().catch(() => ""));
    return null;
  }
  const groundJson = (await groundRes.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const brief = groundJson.choices?.[0]?.message?.content?.trim() ?? "";
  if (!brief) {
    console.error("[congress-lookup] empty grounding brief");
    return null;
  }

  // STEP 2 — structured extraction. Feed the grounded brief back in and force
  // a tool call so we get strict JSON. The model must NOT add facts beyond
  // what is in the brief (esp. city/dates/website).
  const extractRes = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: buildSystemPrompt(slugs) },
        {
          role: "user",
          content: `Below is a verified research brief about the congress "${query}". Extract structured data ONLY from this brief — do not introduce facts that are not present in the brief. If the brief says "unknown" for a field, return null. For suggested_kols, you may add 5-10 well-known X/Twitter handles that historically cover this congress (your training knowledge is fine for KOLs).

--- BRIEF ---
${brief}
--- END BRIEF ---`,
        },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "return_congress_lookup" } },
    }),
  });
  if (extractRes.status === 429 || extractRes.status === 402) {
    throw new Error(extractRes.status === 429 ? "rate_limited" : "payment_required");
  }
  if (!extractRes.ok) {
    console.error("[congress-lookup] extract error", extractRes.status, await extractRes.text().catch(() => ""));
    return null;
  }
  const json = (await extractRes.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try {
    return sanitizeResult(JSON.parse(args) as Partial<CongressLookupResult>, new Set(slugs));
  } catch (e) {
    console.error("[congress-lookup] parse error", e);
    return null;
  }
}

/**
 * Online lookup with 24h cache. Returns null on hard failure.
 * Throws "rate_limited" / "payment_required" so callers can surface.
 */
export async function lookupCongress(
  query: string,
): Promise<{ result: CongressLookupResult; cached: boolean } | null> {
  const q = normalize(query);
  if (q.length < 3) return null;

  const hash = hashQuery(q);
  const nowISO = new Date().toISOString();

  const { data: cached } = await supabaseAdmin
    .from("congress_lookup_cache" as never)
    .select("result, expires_at")
    .eq("query_hash", hash)
    .maybeSingle();
  const c = cached as { result: CongressLookupResult; expires_at: string } | null;
  if (c && c.expires_at > nowISO) {
    return { result: c.result, cached: true };
  }

  const { data: slugRows } = await supabaseAdmin
    .from("cancer_areas")
    .select("slug")
    .order("display_order");
  const slugs = ((slugRows ?? []) as Array<{ slug: string }>).map((r) => r.slug);

  const fresh = await callGateway(q, slugs);
  if (!fresh) return null;

  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 3600 * 1000).toISOString();
  await supabaseAdmin
    .from("congress_lookup_cache" as never)
    .upsert(
      { query_hash: hash, query_raw: q, result: fresh, fetched_at: nowISO, expires_at: expiresAt } as never,
      { onConflict: "query_hash" },
    );

  return { result: fresh, cached: false };
}