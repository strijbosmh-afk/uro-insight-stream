import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
  if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "unauthorized" }, { status: 401 });
  const token = auth.slice(7);
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) return jsonResponse({ error: "unauthorized" }, { status: 401 });
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
- Only handle medical / scientific congresses relevant to urology, GU oncology, andrology, female pelvic medicine, endourology. Reject unrelated events.`;

async function callLLM(query: string): Promise<LLMResp | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  const tool = {
    type: "function" as const,
    function: {
      name: "return_congress_matches",
      description: "Return up to 3 candidate congress matches.",
      parameters: {
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
    },
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Query: ${query}` },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "return_congress_matches" } },
    }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return null;
  try {
    const parsed = JSON.parse(args) as LLMResp;
    if (!Array.isArray(parsed.matches)) return null;
    return parsed;
  } catch {
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
          return jsonResponse({ error: "invalid_json" }, { status: 400 });
        }
        const raw = typeof body.query === "string" ? body.query : "";
        const query = normalizeQuery(raw);
        if (query.length < 3) {
          return jsonResponse({ matches: [], too_short: true });
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
          return jsonResponse({
            matches: annotated,
            no_match: !!c.response_json.no_match,
            from_cache: true,
            cached_at: c.created_at,
          });
        }

        // rate limit
        const rl = await checkPerUserLimit(userId);
        if (!rl.ok) {
          return jsonResponse(
            { error: "per_user_rate_limit", resets_in_seconds: rl.resetsIn, matches: [] },
            { status: 429, headers: { "Retry-After": String(rl.resetsIn) } },
          );
        }

        const llm = await callLLM(query);
        if (!llm) {
          return jsonResponse({ matches: [], error: "lookup_failed" });
        }

        await supabaseAdmin
          .from("congress_suggestion_cache" as never)
          .upsert(
            { query_normalized: query, response_json: llm, hits: 1, created_at: new Date().toISOString() } as never,
            { onConflict: "query_normalized" },
          );

        const annotated = await annotateExisting(llm.matches ?? []);
        return jsonResponse({
          matches: annotated,
          no_match: !!llm.no_match,
          from_cache: false,
          cached_at: new Date().toISOString(),
        });
      },
    },
  },
});