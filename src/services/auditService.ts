import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "source.create"
  | "source.update"
  | "source.delete"
  | "hashtag.create"
  | "hashtag.update"
  | "hashtag.delete"
  | "congress.create"
  | "congress.update"
  | "congress.delete"
  | "user.invite"
  | "user.deactivate"
  | "user.reactivate"
  | "role.grant"
  | "role.revoke";

export interface AuditEntry {
  action: AuditAction;
  target_type: "source" | "hashtag" | "congress" | "user" | "role";
  target_id?: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Best-effort audit log insert. Silently no-ops if the user isn't signed in
 * (e.g. running in mock-only mode without auth).
 */
export async function recordAudit(entry: AuditEntry) {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("audit_log").insert({
      actor_id: u.user.id,
      action: entry.action,
      target_type: entry.target_type,
      target_id: entry.target_id ?? null,
      summary: entry.summary ?? null,
      before: (entry.before as object | null) ?? null,
      after: (entry.after as object | null) ?? null,
    });
  } catch (e) {
    // Don't break the UI if audit logging fails.
    console.warn("audit log insert failed", e);
  }
}