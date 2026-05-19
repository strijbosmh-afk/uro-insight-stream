// Server-only: AI-assisted online congress lookup with 24-hour cache.
//
// Uses the Anthropic API (claude-sonnet-4-6) with the server-side
// `web_search_20260209` tool for live grounding, adaptive thinking, prompt
// caching on the large taxonomy/instruction prefix, and a `strict` tool to
// enforce the JSON shape. Replaces the prior 2-step Lovable (Gemini) pipeline
// with a single Claude call.

import { createHash } from "crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getAnthropic,
  normalizeAnthropicError,
} from "@/server/anthropic-client.server";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CongressLookupKol = {
  /** X/Twitter handle (no leading @). */
  handle: string;
  /** Short, 1-line justification — why this account covers the congress. */
  reason: string;
  // --- Extended fields (all optional for backward compatibility) ---
  /** Best-effort display name from the model's prior knowledge. */
  display_name?: string | null;
  /** What kind of account this is. */
  role?: "kol" | "institution" | "journal" | "society" | "industry" | "other" | null;
  /** How the account relates to the congress. */
  category?:
    | "chair"
    | "speaker"
    | "organizer"
    | "regular_commentator"
    | "society_account"
    | null;
  /** Free-text specialty / clinical focus (e.g. "Prostate cancer, mCRPC trials"). */
  specialty?: string | null;
  /** Per-KOL confidence — distinct from the overall congress confidence. */
  confidence?: "high" | "medium" | "low" | null;
};

export type CongressLookupCitation = { url: string; title: string };

export type CongressPastEdition = {
  year: number;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
};

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
  // --- Extended fields (all optional for backward compatibility) ---
  /** Specific venue / convention center, when announced. */
  venue?: string | null;
  /** Year of the edition the lookup refers to (e.g. 2026). */
  year?: number | null;
  /** True iff start_date is today or later. */
  is_future_edition?: boolean;
  /** Alternate short-code spellings (e.g. ASCO-GU, GUSCO). Lowercased. */
  alternate_short_codes?: string[];
  /** Official society X/Twitter handle (no leading @). */
  society_handle?: string | null;
  /** Up to 5 past editions for identity verification. */
  past_editions?: CongressPastEdition[];
};

// ---------------------------------------------------------------------------
// Cache + normalization
// ---------------------------------------------------------------------------

const CACHE_TTL_HOURS = 24;
// Bump on any non-additive change to the lookup pipeline so old cached results
// are not served. Suffix encodes the LLM provider so a future migration is
// trivially distinguishable in the table.
const LOOKUP_CACHE_VERSION = "v3-anthropic";

function normalize(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, " ");
}

function hashQuery(query: string): string {
  return createHash("sha256")
    .update(`${LOOKUP_CACHE_VERSION}:${normalize(query)}`)
    .digest("hex");
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
    venue: null,
    year: null,
    is_future_edition: false,
    alternate_short_codes: [],
    society_handle: null,
    past_editions: [],
  };
}

function cleanHashtag(t: string): string {
  return t.replace(/^#+/, "").trim().toLowerCase();
}

function cleanHandle(h: string): string {
  return h.replace(/^@+/, "").trim();
}

// ---------------------------------------------------------------------------
// ESMO official-page verification (deterministic post-LLM cross-check)
// ---------------------------------------------------------------------------

const MONTHS: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)));
}

function htmlToText(html: string): string {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHumanDate(value: string): string | null {
  const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const m = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})$/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

function parseOfficialMeetingPage(html: string, url: string) {
  const text = htmlToText(html);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const facts: Partial<CongressLookupResult> & {
    verified_url: string;
    verified_title: string;
  } = {
    verified_url: url,
    verified_title: title ? htmlToText(title).slice(0, 200) : "Official meeting page",
  };

  const labelled = text.match(
    /Start\s*date\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2})\s*End\s*date\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2})\s*Location\s*([A-Za-zÀ-ÿ' .-]+,\s*[A-Za-zÀ-ÿ' .-]+)/i,
  );
  if (labelled) {
    facts.start_date = parseHumanDate(labelled[1]);
    facts.end_date = parseHumanDate(labelled[2]);
    const [city, country] = labelled[3].split(",").map((p) => p.trim()).filter(Boolean);
    if (city && country && city.length <= 120 && country.length <= 120) {
      facts.city = city;
      facts.country = country;
    }
  }

  return facts.city || facts.country || facts.start_date || facts.end_date ? facts : null;
}

function normalizeOfficialUrl(url: string): string {
  return url.replace("/meetings/", "/meeting-calendar/");
}

async function verifyOfficialFacts(
  result: CongressLookupResult,
): Promise<CongressLookupResult> {
  const officialUrl = normalizeOfficialUrl(
    result.citations.find((c) => /^https:\/\/(?:[^/]+\.)?esmo\.org\//i.test(c.url))?.url
      ?? result.website
      ?? "",
  );
  if (!officialUrl || !/^https:\/\/(www\.)?esmo\.org\//i.test(officialUrl)) return result;

  try {
    const res = await fetch(officialUrl, {
      headers: { "User-Agent": "UroFeed congress lookup verifier" },
    });
    if (!res.ok) return result;
    const html = await res.text();
    let facts = parseOfficialMeetingPage(html, officialUrl);
    if (!facts) {
      // Some ESMO pages render dates only via client-side JS — fall back to
      // Jina's text-reader proxy which executes the page first.
      const readerRes = await fetch(`https://r.jina.ai/http://${officialUrl}`, {
        headers: { "User-Agent": "UroFeed congress lookup verifier" },
      });
      if (readerRes.ok) facts = parseOfficialMeetingPage(await readerRes.text(), officialUrl);
    }
    if (!facts) return result;
    const citation = { url: facts.verified_url, title: facts.verified_title };
    return {
      ...result,
      start_date: facts.start_date ?? result.start_date,
      end_date: facts.end_date ?? result.end_date,
      city: facts.city ?? result.city,
      country: facts.country ?? result.country,
      website: result.website ?? officialUrl,
      citations: [citation, ...result.citations.filter((c) => c.url !== citation.url)].slice(0, 8),
      // If the official page confirmed dates + location, the result should not
      // be downgraded below "medium".
      confidence: facts.city && facts.country ? result.confidence : "medium",
    };
  } catch (e) {
    console.warn("[congress-lookup] official fact verification failed", e);
    return result;
  }
}

// ---------------------------------------------------------------------------
// Sanitization — never trust raw model output past this gate
// ---------------------------------------------------------------------------

const VALID_KOL_ROLES = new Set([
  "kol",
  "institution",
  "journal",
  "society",
  "industry",
  "other",
] as const);
const VALID_KOL_CATEGORIES = new Set([
  "chair",
  "speaker",
  "organizer",
  "regular_commentator",
  "society_account",
] as const);

function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function sanitizeResult(
  raw: Partial<CongressLookupResult>,
  validSlugs: Set<string>,
): CongressLookupResult {
  const out: CongressLookupResult = emptyResult();
  out.no_match = !!raw.no_match;
  out.confidence =
    raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low"
      ? raw.confidence
      : "low";
  out.name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : null;
  out.short_code =
    typeof raw.short_code === "string" && raw.short_code.trim()
      ? raw.short_code.trim().toUpperCase()
      : null;
  out.start_date = isIsoDate(raw.start_date) ? raw.start_date : null;
  out.end_date = isIsoDate(raw.end_date) ? raw.end_date : null;
  // Defensive: if both dates parsed but end < start, drop end_date (and trust
  // the post-LLM official-page check to fill in correct values where possible).
  if (out.start_date && out.end_date && out.end_date < out.start_date) {
    out.end_date = null;
  }
  out.city = typeof raw.city === "string" && raw.city.trim() ? raw.city.trim() : null;
  out.country = typeof raw.country === "string" && raw.country.trim() ? raw.country.trim() : null;
  out.website =
    typeof raw.website === "string" && /^https?:\/\//i.test(raw.website)
      ? raw.website.trim()
      : null;
  out.description =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim().slice(0, 1000)
      : null;

  const phs = Array.isArray(raw.primary_hashtags) ? raw.primary_hashtags : [];
  out.primary_hashtags = Array.from(
    new Set(phs.map(cleanHashtag).filter(Boolean)),
  ).slice(0, 5);
  const chs = Array.isArray(raw.community_hashtags) ? raw.community_hashtags : [];
  out.community_hashtags = Array.from(
    new Set(chs.map(cleanHashtag).filter(Boolean)),
  ).slice(0, 8);

  const slugs = Array.isArray(raw.cancer_area_slugs) ? raw.cancer_area_slugs : [];
  out.cancer_area_slugs = Array.from(
    new Set(
      slugs
        .map((s) => String(s).trim().toLowerCase())
        .filter((s) => validSlugs.has(s)),
    ),
  );

  const kols = Array.isArray(raw.suggested_kols) ? raw.suggested_kols : [];
  const seenHandles = new Set<string>();
  out.suggested_kols = [];
  for (const k of kols) {
    if (!k || typeof k.handle !== "string") continue;
    const h = cleanHandle(k.handle);
    // X/Twitter handle ruleset: 1-15 alphanumeric/underscore.
    if (!/^[A-Za-z0-9_]{1,15}$/.test(h)) continue;
    const key = h.toLowerCase();
    if (seenHandles.has(key)) continue;
    seenHandles.add(key);
    const role =
      typeof k.role === "string" && VALID_KOL_ROLES.has(k.role as never)
        ? (k.role as CongressLookupKol["role"])
        : null;
    const category =
      typeof k.category === "string" && VALID_KOL_CATEGORIES.has(k.category as never)
        ? (k.category as CongressLookupKol["category"])
        : null;
    const confidence =
      k.confidence === "high" || k.confidence === "medium" || k.confidence === "low"
        ? k.confidence
        : null;
    out.suggested_kols.push({
      handle: h,
      reason: typeof k.reason === "string" ? k.reason.trim().slice(0, 280) : "",
      display_name:
        typeof k.display_name === "string" && k.display_name.trim()
          ? k.display_name.trim().slice(0, 120)
          : null,
      role,
      category,
      specialty:
        typeof k.specialty === "string" && k.specialty.trim()
          ? k.specialty.trim().slice(0, 200)
          : null,
      confidence,
    });
    // Allow up to 20 KOLs (was 12) to accommodate adding societies + journals
    // alongside individual experts in one list.
    if (out.suggested_kols.length >= 20) break;
  }

  const cites = Array.isArray(raw.citations) ? raw.citations : [];
  out.citations = cites
    .filter((c) => c && typeof c.url === "string" && /^https?:\/\//i.test(c.url))
    .slice(0, 8)
    .map((c) => ({
      url: c.url,
      title: typeof c.title === "string" ? c.title.slice(0, 200) : c.url,
    }));

  // --- Extended optional fields ---
  out.venue =
    typeof raw.venue === "string" && raw.venue.trim() ? raw.venue.trim().slice(0, 200) : null;

  if (typeof raw.year === "number" && Number.isInteger(raw.year) && raw.year >= 2000 && raw.year <= 2099) {
    out.year = raw.year;
  } else if (out.start_date) {
    out.year = Number(out.start_date.slice(0, 4));
  } else {
    out.year = null;
  }

  if (out.start_date) {
    const today = new Date().toISOString().slice(0, 10);
    out.is_future_edition = out.start_date >= today;
  } else {
    out.is_future_edition = false;
  }

  const alts = Array.isArray(raw.alternate_short_codes) ? raw.alternate_short_codes : [];
  out.alternate_short_codes = Array.from(
    new Set(
      alts
        .map((s) => (typeof s === "string" ? s.trim().toLowerCase() : ""))
        .filter(Boolean),
    ),
  ).slice(0, 6);

  out.society_handle =
    typeof raw.society_handle === "string" && /^[A-Za-z0-9_]{1,15}$/.test(cleanHandle(raw.society_handle))
      ? cleanHandle(raw.society_handle)
      : null;

  const editions = Array.isArray(raw.past_editions) ? raw.past_editions : [];
  out.past_editions = editions
    .filter((e): e is CongressPastEdition => {
      if (!e || typeof e !== "object") return false;
      const ed = e as Partial<CongressPastEdition>;
      return (
        typeof ed.year === "number" &&
        Number.isInteger(ed.year) &&
        ed.year >= 2000 &&
        ed.year <= 2099
      );
    })
    .slice(0, 5)
    .map((e) => ({
      year: e.year,
      city: typeof e.city === "string" && e.city.trim() ? e.city.trim().slice(0, 120) : null,
      start_date: isIsoDate(e.start_date) ? e.start_date : null,
      end_date: isIsoDate(e.end_date) ? e.end_date : null,
    }));

  return out;
}

// ---------------------------------------------------------------------------
// Prompt + tool schema
// ---------------------------------------------------------------------------

function buildSystemPrompt(slugs: string[]): string {
  return `You identify medical / oncology congresses for a clinical research database.

Return data ONLY for real, well-known scientific congresses (e.g. ASCO GU, ESMO, EAU, ASH, SABCS, ESMO Asia, ASCO Annual Meeting, AUA, EAU, ASTRO). Do not fabricate names, dates, hashtags, URLs, or X/Twitter handles. If you are not confident, return null for that field and lower the overall confidence. If the query does not name a real congress, set no_match=true and leave all fields null.

## Prefer the next upcoming edition

Use the web_search tool to confirm CURRENT facts — society training data is months out of date. For a query that names a congress series (e.g. "ASCO GU"):
- Find the next upcoming edition (start_date >= today).
- If a future edition has been formally announced (the society has published dates + city), return THAT edition.
- If no future edition has been announced yet, return the most recently completed edition and set is_future_edition=false.
- Set year to the year of the start_date.
- Populate past_editions with up to 5 prior years for identity verification (year + city + dates).

## Cancer-area taxonomy

Use ONLY these slugs in cancer_area_slugs — never invent new ones:
${slugs.join(", ")}

Mapping guidance:
- urological: prostate, kidney, bladder, testicular, GU
- breast: SABCS, breast oncology
- gi: gastric, colorectal, pancreatic, ESMO GI, ASCO GI
- lung: WCLC, lung cancer
- gynecological: ovarian, cervical, endometrial, SGO
- hematological: ASH, EHA, lymphoma, leukemia, myeloma
- head_neck, skin (melanoma), neuro, sarcoma, pediatric

## Hashtags

- primary_hashtags: 1-3 OFFICIAL congress hashtags (no leading "#"), lowercased. Include the year-suffixed variant when one is in active use (e.g. "esmo24", "ascogu26").
- community_hashtags: up to 5 commonly-used variants / topical tags (no leading "#"). May include #genitourinarycancer, #prostatecancer, etc.

## Suggested X/Twitter accounts (suggested_kols)

Return up to 20 accounts that actively cover this congress. Mix three categories:
1. **Individual KOLs**: clinicians/researchers who present, chair sessions, or routinely comment live. Set role="kol", category="speaker" | "chair" | "regular_commentator".
2. **Societies & official accounts**: the host society (e.g. @myESMO, @ASCO), official conference account if it has its own. Set role="society" or "other", category="society_account" or "organizer".
3. **Journals & institutions**: cancer-focused journals (@NEJM, @TheLancetOncol) and institutions if they cover this disease space. Set role="journal" or "institution".

For each:
- handle: X/Twitter handle WITHOUT the leading "@", 1-15 chars, alphanumeric + underscore. Must be a REAL account — do NOT invent.
- display_name: best-effort known display name from your prior knowledge (or null if unsure).
- reason: one short sentence — what they cover, why they're relevant to THIS congress.
- specialty: clinical focus area (e.g. "Prostate cancer, mCRPC trials") or null.
- role: kol | institution | journal | society | industry | other.
- category: chair | speaker | organizer | regular_commentator | society_account, or null.
- confidence: high (you're certain the account exists and posts about this congress) | medium | low.

Order by confidence (high first). Set society_handle to the host society's primary X handle.

## Dates, location, venue

- start_date / end_date: YYYY-MM-DD or null. If both are provided, end_date >= start_date.
- city + country: in English ("Madrid" / "Spain", not "Madrid, ES").
- venue: convention center / hotel if announced (e.g. "Moscone West" / "IFEMA Madrid"), else null.
- website: official congress page URL or null. Must start with https://.

## Citations

Include 2-5 supporting URLs with titles. PREFER official society URLs (esmo.org, asco.org, eau.org, aua.net, sabcs.org). Avoid blog posts, slide decks, social media as primary sources.

## Confidence

- high: well-known major congress, dates + location verified against an official source.
- medium: known event, but some fields still uncertain (e.g. venue TBA).
- low: ambiguous or speculative — set no_match=true if you cannot identify the event at all.

## Description

1-2 sentences explaining what the congress covers (e.g. "Annual symposium of the American Society of Clinical Oncology focused on genitourinary cancers...").

ALWAYS call the return_congress_lookup tool with your final answer — never reply in plain text.`;
}

const RETURN_TOOL: Anthropic.Tool = {
  name: "return_congress_lookup",
  description:
    "Return structured data about the requested medical congress. Always call this tool — never reply in plain text.",
  // NOT using strict mode. The strict-schema validator rejects multi-type
  // arrays like `type: ["string", "null"]` (only `anyOf` is supported in
  // strict). We use multi-type everywhere here because the model emits
  // nulls for unknown fields. Server-side `sanitizeResult()` validates
  // every field regardless of what the model returns, so dropping strict
  // doesn't loosen the trust boundary.
  input_schema: {
    type: "object",
    properties: {
      no_match: { type: "boolean", description: "True if the query does not name a real congress." },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      name: { type: ["string", "null"], description: "Full official name." },
      short_code: { type: ["string", "null"], description: "Short code (e.g. ASCOGU, ESMO)." },
      year: { type: ["integer", "null"], description: "Year of this edition (e.g. 2026)." },
      start_date: { type: ["string", "null"], description: "YYYY-MM-DD or null." },
      end_date: { type: ["string", "null"], description: "YYYY-MM-DD or null." },
      city: { type: ["string", "null"] },
      country: { type: ["string", "null"], description: "Country in English." },
      venue: { type: ["string", "null"], description: "Convention center / hotel if known." },
      website: { type: ["string", "null"], description: "Official URL, https only." },
      description: { type: ["string", "null"] },
      primary_hashtags: {
        type: "array",
        items: { type: "string" },
        description: "1-3 official hashtags, no #, lowercased.",
      },
      community_hashtags: {
        type: "array",
        items: { type: "string" },
        description: "Up to 5 community/topical hashtags.",
      },
      alternate_short_codes: {
        type: "array",
        items: { type: "string" },
        description: "Alternate spellings of the short code (e.g. asco-gu, gusco).",
      },
      cancer_area_slugs: {
        type: "array",
        items: { type: "string" },
        description: "Slugs from the provided taxonomy.",
      },
      society_handle: {
        type: ["string", "null"],
        description: "Host society X/Twitter handle, no @.",
      },
      past_editions: {
        type: "array",
        description: "Up to 5 prior editions for identity verification.",
        items: {
          type: "object",
          properties: {
            year: { type: "integer" },
            city: { type: ["string", "null"] },
            start_date: { type: ["string", "null"] },
            end_date: { type: ["string", "null"] },
          },
          required: ["year", "city", "start_date", "end_date"],
          additionalProperties: false,
        },
      },
      suggested_kols: {
        type: "array",
        description: "Up to 20 accounts (KOLs, societies, journals) that cover this congress.",
        items: {
          type: "object",
          properties: {
            handle: { type: "string", description: "X handle without @, 1-15 chars." },
            reason: { type: "string" },
            display_name: { type: ["string", "null"] },
            role: {
              type: ["string", "null"],
              enum: ["kol", "institution", "journal", "society", "industry", "other", null],
            },
            category: {
              type: ["string", "null"],
              enum: ["chair", "speaker", "organizer", "regular_commentator", "society_account", null],
            },
            specialty: { type: ["string", "null"] },
            confidence: {
              type: ["string", "null"],
              enum: ["high", "medium", "low", null],
            },
          },
          required: ["handle", "reason", "display_name", "role", "category", "specialty", "confidence"],
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
      "year",
      "start_date",
      "end_date",
      "city",
      "country",
      "venue",
      "website",
      "description",
      "primary_hashtags",
      "community_hashtags",
      "alternate_short_codes",
      "cancer_area_slugs",
      "society_handle",
      "past_editions",
      "suggested_kols",
      "citations",
    ],
    additionalProperties: false,
  },
} as Anthropic.Tool;
// (strict mode intentionally not set — see RETURN_TOOL comment.)

// ---------------------------------------------------------------------------
// Anthropic call
// ---------------------------------------------------------------------------

async function callAnthropic(
  query: string,
  slugs: string[],
): Promise<CongressLookupResult | null> {
  const client = await getAnthropic();
  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = buildSystemPrompt(slugs);

  try {
    // Streaming + finalMessage:
    //  - web_search calls can take 30+ seconds; non-streaming would risk
    //    SDK HTTP timeouts.
    //  - finalMessage() returns the complete Anthropic.Message so we can
    //    extract the tool_use block without writing a stream-event loop.
    const message = await client.messages
      .stream({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        // Cache the large taxonomy + instruction prefix. The query string sits
        // in the user message AFTER the breakpoint, so different queries reuse
        // the same cached prefix (~1.5K tokens, ~90% input cost reduction on
        // cache hit).
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        thinking: { type: "adaptive" },
        // GA: dynamic-filtering web search. No extra beta header, no
        // separate code_execution declaration — the model writes filter
        // scripts internally before results reach context.
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 8 },
          RETURN_TOOL,
        ],
        // Force the structured-output tool so the final assistant turn is
        // always a `return_congress_lookup` call.
        tool_choice: { type: "tool", name: "return_congress_lookup" },
        messages: [
          {
            role: "user",
            content: `Today is ${today}.

Research this medical/oncology congress and return structured data via the return_congress_lookup tool.

Query: "${query}"

Use web_search to confirm CURRENT facts (dates, city, venue, official URL, official hashtag). Return the NEXT UPCOMING edition if one has been announced; otherwise return the most recent past edition and set is_future_edition=false.`,
          },
        ],
      })
      .finalMessage();

    // The forced tool_choice means the final assistant turn ends in exactly
    // one return_congress_lookup call. Find it.
    const toolUse = message.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === "return_congress_lookup",
    );
    if (!toolUse) {
      // Surface stop reason + any text-block content so the wizard's toast
      // tells us what the model actually said instead of a generic failure.
      const textBlock = message.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      const detail = textBlock?.text?.slice(0, 200) ?? "(no text block)";
      console.error(
        "[congress-lookup] no return_congress_lookup tool call",
        message.stop_reason,
        detail,
      );
      throw new Error(
        `lookup_no_tool_call: stop=${message.stop_reason} text=${detail}`,
      );
    }

    const sanitized = sanitizeResult(
      toolUse.input as Partial<CongressLookupResult>,
      new Set(slugs),
    );
    return await verifyOfficialFacts(sanitized);
  } catch (e) {
    // Re-throw our own lookup_* errors untouched (already user-readable).
    if (e instanceof Error && e.message.startsWith("lookup_")) throw e;

    // Try to map Anthropic SDK errors to short codes. normalizeAnthropicError
    // always throws — either the short code or the original error.
    const KNOWN = new Set([
      "rate_limited",
      "payment_required",
      "anthropic_overloaded",
      "anthropic_unauthorized",
      "anthropic_forbidden",
      "anthropic_not_configured",
    ]);
    try {
      normalizeAnthropicError(e);
    } catch (mapped) {
      if (mapped instanceof Error && KNOWN.has(mapped.message)) throw mapped;
      // Fall through to the wrap-with-detail path below.
    }

    console.error("[congress-lookup] anthropic call failed", e);
    // Wrap with a short prefix the wizard toast can show verbatim — this
    // is what previously got swallowed as a useless generic "lookup_failed".
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`lookup_failed: ${detail.slice(0, 240)}`);
  }
}

// ---------------------------------------------------------------------------
// Public entry — cache-aware wrapper
// ---------------------------------------------------------------------------

/**
 * Online lookup with 24h cache. Returns null on hard failure.
 * Throws "rate_limited" / "payment_required" / "anthropic_*" so callers can
 * surface them to the user.
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

  const fresh = await callAnthropic(q, slugs);
  if (!fresh) return null;

  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 3600 * 1000).toISOString();
  await supabaseAdmin
    .from("congress_lookup_cache" as never)
    .upsert(
      {
        query_hash: hash,
        query_raw: q,
        result: fresh,
        fetched_at: nowISO,
        expires_at: expiresAt,
      } as never,
      { onConflict: "query_hash" },
    );

  return { result: fresh, cached: false };
}
