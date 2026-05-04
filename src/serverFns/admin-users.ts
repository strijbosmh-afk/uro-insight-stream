import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "@/server/admin-middleware.server";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type AppRole = "admin" | "editor" | "viewer";
const RoleEnum = z.enum(["admin", "editor", "viewer"]);

export type AdminUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  roles: AppRole[];
  is_active: boolean;
  last_sign_in_at: string | null;
  created_at: string;
  notes: string | null;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: AppRole;
  invited_by: string | null;
  invited_by_email: string | null;
  display_name: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
};

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type AdminAuditEntry = {
  id: string;
  actor_user_id: string;
  actor_email: string | null;
  action: string;
  target_user_id: string | null;
  target_email: string | null;
  metadata: Json | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function logAdminAction(args: {
  actorUserId: string;
  action: string;
  targetUserId?: string | null;
  targetEmail?: string | null;
  metadata?: Json | null;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("admin_audit_log").insert({
    actor_user_id: args.actorUserId,
    action: args.action,
    target_user_id: args.targetUserId ?? null,
    target_email: args.targetEmail ?? null,
    metadata: (args.metadata as never) ?? null,
  });
  if (error) console.error("[admin-audit] failed to log", args.action, error);
}

async function countAdmins(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function generateToken(): string {
  // 32 bytes -> 64 hex chars; cryptographically random in Worker / Node.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Crude per-process invite rate limit: 30 per admin per hour.
const inviteRateBuckets = new Map<string, { windowStart: number; count: number }>();
function checkInviteRate(actorId: string) {
  const now = Date.now();
  const bucket = inviteRateBuckets.get(actorId);
  if (!bucket || now - bucket.windowStart > 60 * 60 * 1000) {
    inviteRateBuckets.set(actorId, { windowStart: now, count: 1 });
    return;
  }
  if (bucket.count >= 30) {
    throw new Error("Invite rate limit reached (30/hour). Please wait.");
  }
  bucket.count += 1;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ListUsersSchema = z
  .object({
    search: z.string().max(200).optional(),
    role: RoleEnum.optional(),
    status: z.enum(["active", "deactivated"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    cursor: z.string().optional(),
  })
  .default({});

const UserIdSchema = z.object({ userId: z.string().uuid() });
const InvitationIdSchema = z.object({ id: z.string().uuid() });

const InviteSchema = z.object({
  email: z.string().email().max(254),
  role: RoleEnum,
  displayName: z.string().min(1).max(120).optional(),
});

const UpdateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: RoleEnum,
});

const SetActiveSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

const UpdateProfileSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const ListAuditSchema = z
  .object({
    actor: z.string().uuid().optional(),
    target: z.string().uuid().optional(),
    action: z.string().max(80).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    cursor: z.string().optional(),
  })
  .default({});

const ClaimInvitationSchema = z.object({
  token: z.string().min(16).max(128),
});

// ---------------------------------------------------------------------------
// Public server functions
// ---------------------------------------------------------------------------

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListUsersSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const limit = data.limit ?? 100;

    // Page through auth users via the admin API. For the first iteration we
    // pull a single page (up to 1000 by default); pagination cursor can be
    // wired to listUsers({ page }) later.
    const page = data.cursor ? Number(data.cursor) : 1;
    const { data: usersPage, error: usersErr } =
      await supabaseAdmin.auth.admin.listUsers({ page, perPage: Math.min(limit, 200) });
    if (usersErr) throw new Error(usersErr.message);

    const users = usersPage.users;
    const ids = users.map((u) => u.id);
    if (ids.length === 0) return { users: [] as AdminUserRow[], nextCursor: null };

    const [{ data: roleRows }, { data: extraRows }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin
        .from("user_profile_extras")
        .select("user_id, is_active, display_name, notes")
        .in("user_id", ids),
    ]);

    const rolesByUser = new Map<string, AppRole[]>();
    for (const r of (roleRows ?? []) as Array<{ user_id: string; role: AppRole }>) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }
    const extrasByUser = new Map<
      string,
      { is_active: boolean; display_name: string | null; notes: string | null }
    >();
    for (const e of (extraRows ?? []) as Array<{
      user_id: string;
      is_active: boolean;
      display_name: string | null;
      notes: string | null;
    }>) {
      extrasByUser.set(e.user_id, {
        is_active: e.is_active,
        display_name: e.display_name,
        notes: e.notes,
      });
    }

    let rows: AdminUserRow[] = users.map((u) => {
      const extras = extrasByUser.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        display_name:
          extras?.display_name ??
          (u.user_metadata?.display_name as string | undefined) ??
          null,
        roles: (rolesByUser.get(u.id) ?? []) as AppRole[],
        is_active: extras?.is_active ?? true,
        last_sign_in_at: u.last_sign_in_at ?? null,
        created_at: u.created_at,
        notes: extras?.notes ?? null,
      };
    });

    if (data.search) {
      const q = data.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.email.toLowerCase().includes(q) ||
          (r.display_name ?? "").toLowerCase().includes(q),
      );
    }
    if (data.role) rows = rows.filter((r) => r.roles.includes(data.role!));
    if (data.status === "active") rows = rows.filter((r) => r.is_active);
    if (data.status === "deactivated") rows = rows.filter((r) => !r.is_active);

    return {
      users: rows,
      nextCursor: users.length >= Math.min(limit, 200) ? String(page + 1) : null,
    };
  });

export const getUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UserIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: u, error } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (error || !u?.user) throw new Error(error?.message ?? "User not found");

    const [{ data: roleRows }, { data: extras }, { data: audit }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
      supabaseAdmin
        .from("user_profile_extras")
        .select("*")
        .eq("user_id", data.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("admin_audit_log")
        .select("*")
        .or(`target_user_id.eq.${data.userId},actor_user_id.eq.${data.userId}`)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return {
      id: u.user.id,
      email: u.user.email ?? "",
      created_at: u.user.created_at,
      last_sign_in_at: u.user.last_sign_in_at ?? null,
      roles: ((roleRows ?? []) as Array<{ role: AppRole }>).map((r) => r.role),
      extras: extras ?? null,
      audit: (audit ?? []) as AdminAuditEntry[],
    };
  });

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    checkInviteRate(context.userId);

    const email = data.email.toLowerCase();

    // Reject if there's already an active user with this email
    const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (usersPage?.users?.some((u) => (u.email ?? "").toLowerCase() === email)) {
      throw new Error("A user with this email already exists.");
    }

    // Reject if there's already a pending invite
    const { data: existing } = await supabaseAdmin
      .from("user_invitations")
      .select("id")
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      throw new Error("A pending invitation already exists for this email.");
    }

    const token = generateToken();
    const { data: invite, error: insertErr } = await supabaseAdmin
      .from("user_invitations")
      .insert({
        email,
        role: data.role,
        invited_by: context.userId,
        token,
        display_name: data.displayName ?? null,
      })
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    // Use Supabase's built-in invite email; user clicks link, sets password,
    // then on first login the client claims the invitation token to receive
    // its role.
    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          invited_role: data.role,
          invitation_token: token,
          display_name: data.displayName ?? null,
        },
      },
    );
    if (inviteErr) {
      // Roll the invitation row back so the admin can retry cleanly.
      await supabaseAdmin.from("user_invitations").delete().eq("id", invite.id);
      throw new Error(`Failed to send invite: ${inviteErr.message}`);
    }

    await logAdminAction({
      actorUserId: context.userId,
      action: "user.invite",
      targetEmail: email,
      metadata: { role: data.role, invitation_id: invite.id },
    });

    return { id: invite.id };
  });

export const resendInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InvitationIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    checkInviteRate(context.userId);

    const { data: inv, error } = await supabaseAdmin
      .from("user_invitations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invitation not found");
    if (inv.status !== "pending") {
      throw new Error(`Cannot resend a ${inv.status} invitation.`);
    }

    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error: updErr } = await supabaseAdmin
      .from("user_invitations")
      .update({ expires_at: newExpiry })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    const { error: sendErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      inv.email as string,
      {
        data: {
          invited_role: inv.role,
          invitation_token: inv.token,
          display_name: inv.display_name,
        },
      },
    );
    if (sendErr) throw new Error(`Failed to resend: ${sendErr.message}`);

    await logAdminAction({
      actorUserId: context.userId,
      action: "invitation.resend",
      targetEmail: inv.email as string,
      metadata: { invitation_id: inv.id },
    });
    return { ok: true };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InvitationIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data: inv, error } = await supabaseAdmin
      .from("user_invitations")
      .select("email, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invitation not found");
    if (inv.status !== "pending") {
      throw new Error(`Invitation is already ${inv.status}.`);
    }

    const { error: updErr } = await supabaseAdmin
      .from("user_invitations")
      .update({ status: "revoked" })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    await logAdminAction({
      actorUserId: context.userId,
      action: "invitation.revoke",
      targetEmail: inv.email as string,
      metadata: { invitation_id: data.id },
    });
    return { ok: true };
  });

export const listInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);

    const { data, error } = await supabaseAdmin
      .from("user_invitations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    // Resolve invited_by emails
    const inviterIds = Array.from(
      new Set(
        (data ?? [])
          .map((r: { invited_by: string | null }) => r.invited_by)
          .filter(Boolean) as string[],
      ),
    );
    const inviterEmails = new Map<string, string>();
    for (const id of inviterIds) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
      if (u?.user?.email) inviterEmails.set(id, u.user.email);
    }

    return (data ?? []).map((row: any): PendingInvitation => ({
      id: row.id,
      email: row.email,
      role: row.role,
      invited_by: row.invited_by,
      invited_by_email: row.invited_by ? inviterEmails.get(row.invited_by) ?? null : null,
      display_name: row.display_name,
      status: row.status,
      expires_at: row.expires_at,
      created_at: row.created_at,
      accepted_at: row.accepted_at,
    }));
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateRoleSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    // Determine current roles
    const { data: current } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const currentRoles = ((current ?? []) as Array<{ role: AppRole }>).map((r) => r.role);
    const wasAdmin = currentRoles.includes("admin");
    const willBeAdmin = data.role === "admin";

    if (wasAdmin && !willBeAdmin) {
      const adminCount = await countAdmins();
      if (adminCount <= 1) {
        throw new Error("Cannot demote the last remaining admin.");
      }
    }

    // Replace with single role row
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role, granted_by: context.userId });
    if (insErr) throw new Error(insErr.message);

    await logAdminAction({
      actorUserId: context.userId,
      action: "user.role_change",
      targetUserId: data.userId,
      metadata: { from: currentRoles, to: [data.role] },
    });
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SetActiveSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    if (data.userId === context.userId && !data.isActive) {
      throw new Error("You cannot deactivate your own account.");
    }

    if (!data.isActive) {
      // If deactivating an admin, ensure at least one admin remains
      const { data: targetRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId);
      if (((targetRoles ?? []) as Array<{ role: string }>).some((r) => r.role === "admin")) {
        const adminCount = await countAdmins();
        if (adminCount <= 1) {
          throw new Error("Cannot deactivate the last remaining admin.");
        }
      }
    }

    // Upsert extras row
    const { error: upErr } = await supabaseAdmin.from("user_profile_extras").upsert(
      {
        user_id: data.userId,
        is_active: data.isActive,
        deactivated_at: data.isActive ? null : new Date().toISOString(),
        deactivated_by: data.isActive ? null : context.userId,
      },
      { onConflict: "user_id" },
    );
    if (upErr) throw new Error(upErr.message);

    if (!data.isActive) {
      // Revoke all sessions for the deactivated user
      try {
        await supabaseAdmin.auth.admin.signOut(data.userId);
      } catch (e) {
        console.warn("[setUserActive] signOut failed", e);
      }
    }

    await logAdminAction({
      actorUserId: context.userId,
      action: data.isActive ? "user.reactivate" : "user.deactivate",
      targetUserId: data.userId,
    });
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UserIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    if (data.userId === context.userId) {
      throw new Error("You cannot delete your own account.");
    }

    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if (((targetRoles ?? []) as Array<{ role: string }>).some((r) => r.role === "admin")) {
      const adminCount = await countAdmins();
      if (adminCount <= 1) {
        throw new Error("Cannot delete the last remaining admin.");
      }
    }

    // Capture target email for the audit trail BEFORE delete
    const { data: target } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const targetEmail = target?.user?.email ?? null;

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    await logAdminAction({
      actorUserId: context.userId,
      action: "user.delete",
      targetUserId: data.userId,
      targetEmail,
      metadata: { deleted_email: targetEmail },
    });
    return { ok: true };
  });

export const updateUserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateProfileSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const patch: Record<string, unknown> = { user_id: data.userId };
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await supabaseAdmin
      .from("user_profile_extras")
      .upsert(patch as never, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    await logAdminAction({
      actorUserId: context.userId,
      action: "user.profile_update",
      targetUserId: data.userId,
      metadata: {
        fields: Object.keys(patch).filter((k) => k !== "user_id"),
      },
    });
    return { ok: true };
  });

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ListAuditSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const limit = data.limit ?? 100;
    let q = supabaseAdmin
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data.actor) q = q.eq("actor_user_id", data.actor);
    if (data.target) q = q.eq("target_user_id", data.target);
    if (data.action) q = q.eq("action", data.action);
    if (data.cursor) q = q.lt("created_at", data.cursor);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // Resolve actor emails
    const actorIds = Array.from(
      new Set((rows ?? []).map((r: { actor_user_id: string }) => r.actor_user_id)),
    );
    const actorEmails = new Map<string, string>();
    for (const id of actorIds) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
      if (u?.user?.email) actorEmails.set(id, u.user.email);
    }

    return (rows ?? []).map((r: any): AdminAuditEntry => ({
      id: r.id,
      actor_user_id: r.actor_user_id,
      actor_email: actorEmails.get(r.actor_user_id) ?? null,
      action: r.action,
      target_user_id: r.target_user_id,
      target_email: r.target_email,
      metadata: r.metadata,
      created_at: r.created_at,
    }));
  });

// ---------------------------------------------------------------------------
// Invitation acceptance — called by the freshly authenticated invitee
// ---------------------------------------------------------------------------

export const claimInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ClaimInvitationSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await supabaseAdmin
      .from("user_invitations")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invitation not found.");
    if (inv.status === "revoked") throw new Error("This invitation has been revoked.");
    if (inv.status === "accepted") throw new Error("This invitation has already been accepted.");
    if (new Date(inv.expires_at as string) < new Date()) {
      await supabaseAdmin
        .from("user_invitations")
        .update({ status: "expired" })
        .eq("id", inv.id);
      throw new Error("This invitation has expired.");
    }

    // Make sure the email matches the authenticated user
    const { data: me } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const myEmail = (me?.user?.email ?? "").toLowerCase();
    if (myEmail !== (inv.email as string).toLowerCase()) {
      throw new Error("This invitation was sent to a different email address.");
    }

    // Grant the role (idempotent against the unique (user_id, role) index)
    const { error: existingErr, data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", inv.role)
      .maybeSingle();
    if (existingErr) throw new Error(existingErr.message);
    if (!existingRole) {
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: context.userId,
          role: inv.role as AppRole,
          granted_by: (inv.invited_by as string | null) ?? null,
        } as never);
      if (roleErr) throw new Error(roleErr.message);
    }

    // Mark invitation accepted
    await supabaseAdmin
      .from("user_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_user_id: context.userId,
      })
      .eq("id", inv.id);

    // Apply admin-supplied display name if any
    if (inv.display_name) {
      await supabaseAdmin.from("user_profile_extras").upsert(
        { user_id: context.userId, display_name: inv.display_name as string },
        { onConflict: "user_id" },
      );
    }

    await logAdminAction({
      actorUserId: context.userId,
      action: "invitation.accepted",
      targetUserId: context.userId,
      targetEmail: myEmail,
      metadata: { invitation_id: inv.id, role: inv.role },
    });

    return { ok: true, role: inv.role as AppRole };
  });