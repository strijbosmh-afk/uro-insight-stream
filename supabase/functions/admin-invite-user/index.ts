// Admin-only: create a new user account with a chosen role.
// Requires the caller to be authenticated AND have the 'admin' role.
// Returns the temporary password so the admin can share it out-of-band
// (we have no email-sending infra wired up yet).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

function originAllowed(origin: string | null): string | null {
  if (!origin) return null;
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const entries = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const entry of entries) {
    if (entry === origin) return origin;
    if (entry.includes("*")) {
      const re = new RegExp(
        "^" + entry.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
      );
      if (re.test(origin)) return origin;
    }
  }
  return null;
}
function buildCorsHeaders(req: Request): Record<string, string> {
  const allowed = originAllowed(req.headers.get("origin"));
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (allowed) headers["Access-Control-Allow-Origin"] = allowed;
  return headers;
}

function generatePassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/[+/=]/g, "")
    .slice(0, 18);
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Missing bearer token" }, 401);
  }

  // Verify the caller and check their role.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: "Not authenticated" }, 401);
  }
  const callerId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: roleRows, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId);
  if (roleErr) return json({ error: roleErr.message }, 500);
  const callerRoles = (roleRows ?? []).map((r) => r.role);
  if (!callerRoles.includes("admin")) {
    return json({ error: "Forbidden — admin only" }, 403);
  }

  let body: { email?: string; role?: "admin" | "editor" | "viewer"; display_name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const role = body.role || "viewer";
  const displayName = (body.display_name || "").trim() || null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "Invalid email" }, 400);
  }
  if (!["admin", "editor", "viewer"].includes(role)) {
    return json({ error: "Invalid role" }, 400);
  }

  const tempPassword = generatePassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: displayName ? { display_name: displayName } : undefined,
  });
  if (createErr || !created.user) {
    return json({ error: createErr?.message || "Failed to create user" }, 400);
  }

  const newUserId = created.user.id;

  // Generate a single-use invite token. The admin will share the resulting
  // URL with the new user; visiting /auth?invite=<token>&email=<email>
  // lets them set a permanent password and sign in.
  let inviteToken: string | null = null;
  try {
    const { data: linkData } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    // hashed_token is the single-use token bound to this email + type.
    inviteToken =
      (linkData?.properties as { hashed_token?: string } | undefined)
        ?.hashed_token ?? null;
  } catch (_) {
    // Non-fatal: fall back to the temp password flow.
  }

  // The handle_new_user trigger inserts a default 'viewer' role.
  // If a different role was requested, replace it.
  if (role !== "viewer") {
    await admin.from("user_roles").delete().eq("user_id", newUserId);
    const { error: roleInsErr } = await admin
      .from("user_roles")
      .insert({ user_id: newUserId, role, granted_by: callerId });
    if (roleInsErr) return json({ error: roleInsErr.message }, 500);
  }

  // Audit log entry.
  await admin.from("audit_log").insert({
    actor_id: callerId,
    action: "user.invite",
    target_type: "user",
    target_id: newUserId,
    summary: `Invited ${email} as ${role}`,
    after: { email, role, display_name: displayName },
  });

  return json({
    ok: true,
    user_id: newUserId,
    email,
    role,
    temp_password: tempPassword,
    invite_token: inviteToken,
  });
});