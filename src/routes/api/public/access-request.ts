import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// CORS allowlist (mirrors src/routes/api/suggest-congress.ts)
function originAllowed(origin: string | null): string | null {
  if (!origin) return null;
  const raw = process.env.ALLOWED_ORIGINS ?? "";
  const entries = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const entry of entries) {
    if (entry === origin) return origin;
    if (entry.includes("*")) {
      const pattern: string =
        "^" + entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
      if (new RegExp(pattern).test(origin)) return origin;
    }
  }
  return null;
}
function buildCorsHeaders(req: Request): Record<string, string> {
  const allowed = originAllowed(req.headers.get("origin"));
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  if (allowed) headers["Access-Control-Allow-Origin"] = allowed;
  return headers;
}
function jsonResponse(body: unknown, init: ResponseInit, req: Request) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...buildCorsHeaders(req),
      ...(init.headers ?? {}),
    },
  });
}

const BodySchema = z.object({
  email: z.string().email().max(254),
  name: z.string().max(120).optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
});

const RATE_LIMIT_MAX = 3;
const BUCKET_SECONDS = 3600;

let warnedNoIp = false;

function getClientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  if (!warnedNoIp) {
    console.warn(
      "[access-request] No client IP available (cf-connecting-ip / x-forwarded-for / x-real-ip all missing). " +
        "Falling back to shared 'unknown' bucket — proxy chain may be misconfigured.",
    );
    warnedNoIp = true;
  }
  return "unknown";
}

function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_IP_SALT ?? process.env.X_JOB_SECRET ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function currentBucketStart(): Date {
  const sec = Math.floor(Date.now() / 1000);
  return new Date(Math.floor(sec / BUCKET_SECONDS) * BUCKET_SECONDS * 1000);
}

async function logRateLimitHit(ipHash: string, email: string | null) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      action: "access_request_rate_limited",
      target_type: "access_request",
      target_id: ipHash.slice(0, 16),
      summary: email ? `Blocked submit from ${email}` : "Blocked submit (no email)",
      after: { ip_hash: ipHash, email },
    });
  } catch (err) {
    console.error("[access-request] Failed to write audit_log entry:", err);
  }
}

export const Route = createFileRoute("/api/public/access-request")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: buildCorsHeaders(request) }),

      POST: async ({ request }) => {
        // Parse body (best-effort; capture email even on validation failure for logging)
        let rawBody: unknown = null;
        let parsedEmail: string | null = null;
        try {
          rawBody = await request.json();
          if (rawBody && typeof rawBody === "object" && "email" in rawBody) {
            const e = (rawBody as { email?: unknown }).email;
            if (typeof e === "string") parsedEmail = e.trim().toLowerCase();
          }
        } catch {
          return jsonResponse({ error: "Invalid JSON" }, { status: 400 }, request);
        }

        // Rate limit BEFORE validation so spam can't bypass via malformed bodies
        const ip = getClientIp(request);
        const ipHash = hashIp(ip);
        const bucketStart = currentBucketStart();

        // Atomic upsert + increment
        const { data: existing, error: selErr } = await supabaseAdmin
          .from("rate_limit_access_requests")
          .select("count")
          .eq("ip_hash", ipHash)
          .eq("bucket_start", bucketStart.toISOString())
          .maybeSingle();

        if (selErr) {
          console.error("[access-request] rate-limit read failed:", selErr);
          return jsonResponse({ error: "Service unavailable" }, { status: 503 }, request);
        }

        const currentCount = existing?.count ?? 0;
        if (currentCount >= RATE_LIMIT_MAX) {
          const retryAfter =
            BUCKET_SECONDS - Math.floor((Date.now() - bucketStart.getTime()) / 1000);
          await logRateLimitHit(ipHash, parsedEmail);
          return jsonResponse(
            {
              error: "rate_limited",
              message: "Too many requests. Please try again later.",
              retry_after_seconds: retryAfter,
            },
            { status: 429, headers: { "Retry-After": String(retryAfter) } },
            request,
          );
        }

        // Validate body
        const parsed = BodySchema.safeParse(rawBody);
        if (!parsed.success) {
          // Still consume a slot to prevent malformed-body spam
          await supabaseAdmin
            .from("rate_limit_access_requests")
            .upsert(
              {
                ip_hash: ipHash,
                bucket_start: bucketStart.toISOString(),
                count: currentCount + 1,
                last_attempt_at: new Date().toISOString(),
              },
              { onConflict: "ip_hash,bucket_start" },
            );
          return jsonResponse({ error: "Invalid input" }, { status: 400 }, request);
        }

        const { email, name, reason } = parsed.data;

        // Insert request (service role bypasses RLS)
        const { error: insErr } = await supabaseAdmin.from("access_requests").insert({
          email: email.trim().toLowerCase(),
          name: name?.trim() || null,
          reason: reason?.trim() || null,
        });

        if (insErr) {
          console.error("[access-request] insert failed:", insErr);
          return jsonResponse({ error: "Could not save request" }, { status: 500 }, request);
        }

        // Increment rate-limit counter on success
        await supabaseAdmin
          .from("rate_limit_access_requests")
          .upsert(
            {
              ip_hash: ipHash,
              bucket_start: bucketStart.toISOString(),
              count: currentCount + 1,
              last_attempt_at: new Date().toISOString(),
            },
            { onConflict: "ip_hash,bucket_start" },
          );

        return jsonResponse({ ok: true }, { status: 200 }, request);
      },
    },
  },
});