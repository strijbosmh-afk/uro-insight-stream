import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const BodySchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(4096),
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

// H-S2: only accept sign-in requests originating from this project's known
// hosts. The previous wildcard let *any* *.lovable.app / *.lovableproject.com
// site post credentials here, which is a credential-stuffing surface.
const PROJECT_ID = "b4982a9a-484b-4e14-9df5-1bcc313546ed";
const ALLOWED_HOSTS_EXACT = new Set<string>([
  // Custom production domains
  "urofeed.com",
  "www.urofeed.com",
  // Published Lovable hosts
  "uro-insight-stream.lovable.app",
  // Stable per-project Lovable hosts (prod + preview)
  `project--${PROJECT_ID}.lovable.app`,
  `project--${PROJECT_ID}-dev.lovable.app`,
  `id-preview--${PROJECT_ID}.lovable.app`,
  // Sandbox preview host
  `${PROJECT_ID}.lovableproject.com`,
  `${PROJECT_ID}.sandbox.lovable.dev`,
]);

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches from this app omit Origin
  try {
    const originHost = new URL(origin).host;
    const reqHost = request.headers.get("host") ?? new URL(request.url).host;
    if (originHost === reqHost) return true;
    return ALLOWED_HOSTS_EXACT.has(originHost);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/auth/password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request)) {
          return jsonResponse({ error: "Unauthorized" }, { status: 403 });
        }

        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return jsonResponse({ error: "Invalid sign-in request" }, { status: 400 });
        }

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return jsonResponse({ error: "Auth is temporarily unavailable" }, { status: 503 });
        }

        const authClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data, error } = await authClient.auth.signInWithPassword({
          email: body.email,
          password: body.password,
        });

        if (error || !data.session || !data.user) {
          return jsonResponse(
            { error: error?.message ?? "Sign-in failed" },
            { status: error?.status ?? 401 },
          );
        }

        return jsonResponse({ session: data.session, user: data.user });
      },
    },
  },
});