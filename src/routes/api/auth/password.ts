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

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const reqHost = request.headers.get("host") ?? new URL(request.url).host;
    if (originHost === reqHost) return true;
    // Allow lovable preview/published hosts and custom domains for this project.
    if (/\.lovable(project)?\.app$/.test(originHost)) return true;
    if (/\.lovableproject\.com$/.test(originHost)) return true;
  } catch {
    return false;
  }
  return false;
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