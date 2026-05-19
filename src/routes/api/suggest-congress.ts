import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAnthropic, normalizeAnthropicError } from "@/server/anthropic-client.server";

const PER_USER_LIMIT = 30;
const PER_USER_WINDOW_MS = 60 * 1000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function originAllowed(origin: string | null): string | null {
  if (!origin) return null;
  const raw = process.env.ALLOWED_ORIGINS ?? "";
  const entries = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const entry of entries) {
    if (entry === origin) return origin;
    if (entry.includes("*")) {
      const pattern: string =
        "^" + entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
      const re: RegExp = new RegExp(pattern);
      if (re.test(origin)) return origin;
    }
  }
  return null;
}
function buildCorsHeaders(req: Request): Record<string, string> {
  const allowed = originAllowed(req.headers.get("origin"));
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
  if (allowed) headers["Access-Control-Allow-Origin"] = allowed;
  return headers;
}
function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
  req?: Request,
) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(req ? buildCorsHeaders(req) : {}),
      ...(init.headers ?? {}),
    },
  });
}

function bucketStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

async function authenticate(request: Request): Promise<{ userId: string } | Response> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "unauthorized" }, { status: 401 }, request);
  const token = auth.slice(7);
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) return jsonResponse({ error: "unauthorized" }, { status: 401 }, request);
  return { userId: data.claims.sub as string };
}

async function checkPerUserLimit(userId: string): Promise<{ ok: true } | { ok: false; resetsIn: number }> {
  const now = new Date();
  const window = bucketStart(now, PER_USER_WINDOW_MS);
  const { data: existing } = await supabaseAdmin
    .from("rate_limit_congress_suggest" as never)
    .select("count")
    .eq("user_id", userId)
    .eq("window_start", window.toISOString())
    .maybeSingle();
  const current = (existing as { count?: number } | null)?.count ?? 0;
  if (current + 1 > PER_USER_LIMIT) {
    const resetsIn = Math.ceil((window.getTime() + PER_USER_WINDOW_MS - now.getTime()) / 1000);
    return { ok: false, resetsIn: Math.max(1, resetsIn) };
  }
  await supabaseAdmin
    .from("rate_limit_congress_suggest" as never)
    .upsert(
      { user_id: userId, window_start: window.toISOString(), count: current + 1, updated_at: now.toISOString() } as never,
      { onConflict: "user_id,window_start" },
    );
  return { ok: true };
}

function normalizeQuery(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, " ");
}

type Match = {
  name: string;
  short_code: string;
  city: string;
  country: string;
  start_date: string;
  end_date: string;
  primary_hashtags: string[];
  status: "upcoming" | "live" | "archived";
  confidence: "high" | "medium" | "low";
  field_confidence: { dates: string; city: string; hashtags: string };
  notes: string;
  already_exists?: boolean;
  existing_id?: string;
};

type LLMResp = { matches: Match[]; no_match: boolean };

const SYSTEM_PROMPT = `You are an assistant that helps urologists add medical congress entries to a database.
Given a partial or ambiguous name, identify the canonical urology / GU oncology congress they likely mean.
Rules:
- If ambiguous (e.g. "GU 2026"), return up to 3 candidates ranked by likelihood.
- If you don't recognize the query as a real urology / GU congress, set no_match=true and matches=[].
- Never invent congresses. Never hallucinate dates if you don't know them — set field_confidence to "low" and add a note "verify with official source".
- Only handle medical / scientific congresses relevant to urology, GU oncology, andrology, female pelvic medicine, endourology. Reject unrelated events.
- Always call the return_congress_matches tool — never reply in plain text.`;

const SUGGEST_TOOL: Anthropic.Tool = {
  name: "return_congress_matches",
  description: "Return up to 3 candidate congress matches.",
  input_schema: {
    type: "object",
    properties: {
      no_match: { type: "boolean" },
      matches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            short_code: { type: "string" },
            city: { type: "string" },
            country: { type: "string" },
            start_date: { type: "string", description: "YYYY-MM-DD or empty" },
            end_date: { type: "string", description: "YYYY-MM-DD or empty" },
            primary_hashtags: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["upcoming", "live", "archived"] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            field_confidence: {
              type: "object",
              properties: {
                dates: { type: "string", enum: ["high", "medium", "low"] },
                city: { type: "string", enum: ["high", "medium", "low"] },
                hashtags: { type: "string", enum: ["high", "medium", "low"] },
              },
              required: ["dates", "city", "hashtags"],
              additionalProperties: false,
            },
            notes: { type: "string" },
          },
          required: [
            "name",
            "short_code",
            "city",
            "country",
            "start_date",
            "end_date",
            "primary_hashtags",
            "status",
            "confidence",
            "field_confidence",
            "notes",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["matches", "no_match"],
    additionalProperties: false,
  },
} as Anthropic.Tool;
(SUGGEST_TOOL as unknown as { strict: boolean }).strict = true;

/**
 * Quick autocomplete-style suggestions for the new-congress dialog.
 * Uses Haiku for low latency + low cost; the deep wizard lookup uses Opus
 * with web search. This call does not search the web — it leans on the
 * model's training knowledge, which is fine for "did you mean ASCO GU?"
 * style suggestions.
 */
async function callLLM(query: string): Promise<LLMResp | null> {
  let client;
  try {
    client = getAnthropic();
  } catch {
    // ANTHROPIC_API_KEY not configured — suggestions degrade silently to "no
    // matches" rather than failing the dialog. The deep lookup will surface
    // a clear error.
    return null;
  }
  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: [SUGGEST_TOOL],
      tool_choice: { type: "tool", name: "return_congress_matches" },
      messages: [{ role: "user", content: `Query: ${query}` }],
    });
    const toolUse = message.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === "return_congress_matches",
    );
    if (!toolUse) return null;
    const parsed = toolUse.input as LLMResp;
    if (!Array.isArray(parsed.matches)) return null;
    return parsed;
  } catch (e) {
    // Map known errors so the route can return the right HTTP status, but
    // for everything else just log and return null — suggestions are an
    // enhancement, never block the user.
    try {
      normalizeAnthropicError(e);
    } catch (mapped) {
      const code = mapped instanceof Error ? mapped.message : String(mapped);
      if (code === "rate_limited" || code === "anthropic_overloaded") {
        // Re-raise so POST handler can return a 429.
        throw mapped;
      }
    }
    console.error("[suggest-congress] anthropic call failed", e);
    return null;
  }
}

async function annotateExisting(matches: Match[]): Promise<Match[]> {
  const codes = matches.map((m) => m.short_code).filter(Boolean);
  if (codes.length === 0) return matches;
  const { data } = await supabaseAdmin
    .from("congresses")
    .select("id, short_code")
    .in("short_code", codes);
  const map = new Map<string, string>();
  for (const r of (data ?? []) as Array<{ id: string; short_code: string }>) {
    map.set(r.short_code.toUpperCase(), r.id);
  }
  return matches.map((m) => {
    const id = map.get(m.short_code.toUpperCase());
    return id ? { ...m, already_exists: true, existing_id: id } : m;
  });
}

export const Route = createFileRoute("/api/suggest-congress")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: buildCorsHeaders(request),
        }),
      POST: async ({ request }) => {
        const auth = await authenticate(request);
        if (auth instanceof Response) return auth;
        const { userId } = auth;

        let body: { query?: unknown };
        try {
          body = (await request.json()) as { query?: unknown };
        } catch {
          return jsonResponse({ error: "invalid_json" }, { status: 400 }, request);
        }
        const raw = typeof body.query === "string" ? body.query : "";
        const query = normalizeQuery(raw);
        if (query.length < 3) {
          return jsonResponse({ matches: [], too_short: true }, {}, request);
        }

        // cache
        const { data: cached } = await supabaseAdmin
          .from("congress_suggestion_cache" as never)
          .select("response_json, created_at, hits")
          .eq("query_normalized", query)
          .maybeSingle();
        const c = cached as { response_json: LLMResp; created_at: string; hits: number } | null;
        if (c && Date.now() - new Date(c.created_at).getTime() < CACHE_TTL_MS) {
          await supabaseAdmin
            .from("congress_suggestion_cache" as never)
            .update({ hits: (c.hits ?? 0) + 1 } as never)
            .eq("query_normalized", query);
          const annotated = await annotateExisting(c.response_json.matches ?? []);
          return jsonResponse(
            {
              matches: annotated,
              no_match: !!c.response_json.no_match,
              from_cache: true,
              cached_at: c.created_at,
            },
            {},
            request,
          );
        }

        // rate limit
        const rl = await checkPerUserLimit(userId);
        if (!rl.ok) {
          return jsonResponse(
            { error: "per_user_rate_limit", resets_in_seconds: rl.resetsIn, matches: [] },
            { status: 429, headers: { "Retry-After": String(rl.resetsIn) } },
            request,
          );
        }

        let llm: LLMResp | null;
        try {
          llm = await callLLM(query);
        } catch (e) {
          const code = e instanceof Error ? e.message : "lookup_failed";
          if (code === "rate_limited" || code === "anthropic_overloaded") {
            return jsonResponse(
              { matches: [], error: code },
              { status: 429, headers: { "Retry-After": "30" } },
              request,
            );
          }
          return jsonResponse({ matches: [], error: "lookup_failed" }, {}, request);
        }
        if (!llm) {
          return jsonResponse({ matches: [], error: "lookup_failed" }, {}, request);
        }

        await supabaseAdmin
          .from("congress_suggestion_cache" as never)
          .upsert(
            { query_normalized: query, response_json: llm, hits: 1, created_at: new Date().toISOString() } as never,
            { onConflict: "query_normalized" },
          );

        const annotated = await annotateExisting(llm.matches ?? []);
        return jsonResponse(
          {
            matches: annotated,
            no_match: !!llm.no_match,
            from_cache: false,
            cached_at: new Date().toISOString(),
          },
          {},
          request,
        );
      },
    },
  },
});