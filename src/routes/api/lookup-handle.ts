import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- constants ----------
const PER_USER_LIMIT = 60; // per minute
const PER_USER_WINDOW_MS = 60 * 1000;
const GLOBAL_LIMIT = 200; // per 15 min
const GLOBAL_WINDOW_MS = 15 * 60 * 1000;

type LookupResult = {
  handle: string;
  found: boolean;
  source?: {
    id: string;
    handle: string;
    display_name: string;
    avatar_url: string;
    verified: boolean;
  };
  cached?: boolean;
  error?: string;
};

function bucketStart(now: Date, windowMs: number): Date {
  const ts = Math.floor(now.getTime() / windowMs) * windowMs;
  return new Date(ts);
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function authenticate(request: Request): Promise<{ userId: string } | Response> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }
  const token = auth.slice(7);
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }
  return { userId: data.claims.sub as string };
}

async function checkPerUserLimit(userId: string, count: number): Promise<{ ok: true } | { ok: false; resetsIn: number }> {
  const now = new Date();
  const window = bucketStart(now, PER_USER_WINDOW_MS);
  // Try increment via upsert
  const { data: existing } = await supabaseAdmin
    .from("rate_limit_lookups")
    .select("count")
    .eq("user_id", userId)
    .eq("window_start", window.toISOString())
    .maybeSingle();
  const current = existing?.count ?? 0;
  if (current + count > PER_USER_LIMIT) {
    const resetsIn = Math.ceil((window.getTime() + PER_USER_WINDOW_MS - now.getTime()) / 1000);
    return { ok: false, resetsIn: Math.max(1, resetsIn) };
  }
  await supabaseAdmin
    .from("rate_limit_lookups")
    .upsert(
      { user_id: userId, window_start: window.toISOString(), count: current + count, updated_at: now.toISOString() },
      { onConflict: "user_id,window_start" },
    );
  return { ok: true };
}

async function checkGlobalLimit(count: number): Promise<{ ok: true } | { ok: false; resetsIn: number }> {
  const now = new Date();
  const { data } = await supabaseAdmin
    .from("rate_limit_global_lookups")
    .select("window_start, count")
    .eq("id", 1)
    .maybeSingle();
  const winStart = data ? new Date(data.window_start) : now;
  const elapsed = now.getTime() - winStart.getTime();
  // Reset if window expired
  if (!data || elapsed >= GLOBAL_WINDOW_MS) {
    await supabaseAdmin
      .from("rate_limit_global_lookups")
      .upsert({ id: 1, window_start: now.toISOString(), count, updated_at: now.toISOString() });
    return { ok: true };
  }
  const newCount = (data.count ?? 0) + count;
  if (newCount > GLOBAL_LIMIT) {
    const resetsIn = Math.ceil((winStart.getTime() + GLOBAL_WINDOW_MS - now.getTime()) / 1000);
    return { ok: false, resetsIn: Math.max(1, resetsIn) };
  }
  await supabaseAdmin
    .from("rate_limit_global_lookups")
    .update({ count: newCount, updated_at: now.toISOString() })
    .eq("id", 1);
  return { ok: true };
}

function normalizeHandle(h: string): string {
  return h.trim().replace(/^@/, "").toLowerCase();
}

async function lookupCachedSources(handles: string[]): Promise<Map<string, LookupResult["source"]>> {
  const out = new Map<string, LookupResult["source"]>();
  if (handles.length === 0) return out;
  // sources.id is the lowercased handle
  const { data } = await supabaseAdmin
    .from("sources")
    .select("id, handle, display_name, avatar_url, verified")
    .in("id", handles);
  for (const row of (data ?? []) as Array<{
    id: string;
    handle: string;
    display_name: string;
    avatar_url: string;
    verified: boolean;
  }>) {
    out.set(row.id, {
      id: row.id,
      handle: row.handle,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      verified: row.verified,
    });
  }
  return out;
}

type XUser = {
  id: string;
  username: string;
  name?: string;
  verified?: boolean;
  profile_image_url?: string;
};

async function fetchFromX(handles: string[]): Promise<Map<string, XUser>> {
  const out = new Map<string, XUser>();
  const token = process.env.X_BEARER_TOKEN;
  if (!token || handles.length === 0) return out;
  // X v2 users/by accepts up to 100 usernames
  const url = new URL("https://api.twitter.com/2/users/by");
  url.searchParams.set("usernames", handles.join(","));
  url.searchParams.set("user.fields", "name,username,verified,profile_image_url");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) throw new Error("x_rate_limited");
  if (!res.ok) throw new Error(`x_api_${res.status}`);
  const json = (await res.json()) as { data?: XUser[]; errors?: unknown };
  for (const u of json.data ?? []) {
    out.set(u.username.toLowerCase(), u);
  }
  return out;
}

async function persistNewSource(u: XUser): Promise<LookupResult["source"]> {
  const id = u.username.toLowerCase();
  const row = {
    id,
    handle: u.username,
    display_name: u.name ?? u.username,
    avatar_url: u.profile_image_url ?? "",
    verified: !!u.verified,
    role: "other",
    specialty: [],
    active: true,
    list_ids: [],
    // bio/followers/enriched_at intentionally left null — the discovery
    // aggregator cron picks up sources where enriched_at IS NULL on its
    // next tick and fetches the full profile (description + public_metrics).
    enriched_at: null,
  };
  await supabaseAdmin.from("sources").upsert(row, { onConflict: "id", ignoreDuplicates: false });
  return { id, handle: row.handle, display_name: row.display_name, avatar_url: row.avatar_url, verified: row.verified };
}

export const Route = createFileRoute("/api/lookup-handle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. Auth
        const auth = await authenticate(request);
        if (auth instanceof Response) return auth;
        const { userId } = auth;

        // 2. Parse + validate
        let body: { handles?: unknown };
        try {
          body = (await request.json()) as { handles?: unknown };
        } catch {
          return jsonResponse({ error: "invalid_json" }, { status: 400 });
        }
        if (!Array.isArray(body.handles)) {
          return jsonResponse({ error: "handles_must_be_array" }, { status: 400 });
        }
        const raw = body.handles.filter((h): h is string => typeof h === "string");
        const handles = Array.from(new Set(raw.map(normalizeHandle).filter((h) => /^[a-z0-9_]{1,15}$/.test(h))));
        if (handles.length === 0) {
          return jsonResponse({ results: [] });
        }
        if (handles.length > 100) {
          return jsonResponse({ error: "too_many_handles", max: 100 }, { status: 400 });
        }

        // 3. Local dedupe — cached sources count as 0 X API calls
        const cached = await lookupCachedSources(handles);
        const uncached = handles.filter((h) => !cached.has(h));

        // 4. Per-user rate limit (only counts uncached lookups)
        if (uncached.length > 0) {
          const userCheck = await checkPerUserLimit(userId, uncached.length);
          if (!userCheck.ok) {
            return jsonResponse(
              { error: "per_user_rate_limit", resets_in_seconds: userCheck.resetsIn },
              { status: 429, headers: { "Retry-After": String(userCheck.resetsIn) } },
            );
          }

          // 5. Global rate limit
          const globalCheck = await checkGlobalLimit(uncached.length);
          if (!globalCheck.ok) {
            return jsonResponse(
              { error: "global_rate_limit", resets_in_seconds: globalCheck.resetsIn },
              { status: 429, headers: { "Retry-After": String(globalCheck.resetsIn) } },
            );
          }
        }

        // 6. X API call for uncached
        let xUsers = new Map<string, XUser>();
        if (uncached.length > 0) {
          try {
            xUsers = await fetchFromX(uncached);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg === "x_rate_limited") {
              return jsonResponse(
                { error: "global_rate_limit", resets_in_seconds: 900 },
                { status: 429, headers: { "Retry-After": "900" } },
              );
            }
            return jsonResponse({ error: "x_api_error", detail: msg }, { status: 502 });
          }
        }

        // 7. Persist newly-found and assemble results
        const results: LookupResult[] = [];
        for (const h of handles) {
          const cachedSrc = cached.get(h);
          if (cachedSrc) {
            results.push({ handle: h, found: true, source: cachedSrc, cached: true });
            continue;
          }
          const xu = xUsers.get(h);
          if (xu) {
            const src = await persistNewSource(xu);
            results.push({ handle: h, found: true, source: src });
          } else {
            results.push({ handle: h, found: false, error: "handle_not_found" });
          }
        }
        return jsonResponse({ results });
      },
    },
  },
});