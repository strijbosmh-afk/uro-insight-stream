import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { recordAudit } from "@/services/auditService";

interface TeamMember {
  id: string;
  email: string;
  display_name: string | null;
  active: boolean;
  role: AppRole;
}

export function TeamSettings() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: async (): Promise<TeamMember[]> => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,email,display_name,active"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const roleMap = new Map<string, AppRole>();
      ((roles ?? []) as { user_id: string; role: AppRole }[]).forEach((r) =>
        roleMap.set(r.user_id, r.role),
      );
      return ((profiles ?? []) as Omit<TeamMember, "role">[]).map((p) => ({
        ...p,
        role: roleMap.get(p.id) ?? "viewer",
      }));
    },
  });

  const { data: audit = [] } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<AppRole>("viewer");
  const [tempPwd, setTempPwd] = React.useState<string | null>(null);

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "admin-invite-user",
        { body: { email, role } },
      );
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Invite failed");
      return data as { temp_password: string; email: string };
    },
    onSuccess: (d) => {
      setTempPwd(d.temp_password);
      setEmail("");
      toast.success(`Invited ${d.email}`);
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["audit-log"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const changeRole = useMutation({
    mutationFn: async (vars: { userId: string; newRole: AppRole; oldRole: AppRole }) => {
      const { error: delErr } = await supabase
        .from("user_roles").delete().eq("user_id", vars.userId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase
        .from("user_roles").insert([{ user_id: vars.userId, role: vars.newRole }]);
      if (insErr) throw insErr;
      await recordAudit({
        action: "role.grant",
        target_type: "role",
        target_id: vars.userId,
        summary: `Role: ${vars.oldRole} → ${vars.newRole}`,
        before: { role: vars.oldRole },
        after: { role: vars.newRole },
      });
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["audit-log"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async (vars: { userId: string; active: boolean; email: string }) => {
      const { error } = await supabase
        .from("profiles").update({ active: vars.active }).eq("id", vars.userId);
      if (error) throw error;
      await recordAudit({
        action: vars.active ? "user.reactivate" : "user.deactivate",
        target_type: "user",
        target_id: vars.userId,
        summary: `${vars.active ? "Reactivated" : "Deactivated"} ${vars.email}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["audit-log"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!isAdmin) {
    return (
      <div className="flex items-start gap-2 text-[13px] text-text-muted border border-border rounded-[3px] bg-panel p-4">
        <ShieldAlert className="w-4 h-4 mt-0.5 text-amber-500" />
        Only administrators can manage the team.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Invite */}
      <section className="border border-border rounded-[3px] bg-panel p-4 space-y-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Invite member
        </h2>
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1.5">
            <Label className="text-[12px]">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="w-40 space-y-1.5">
            <Label className="text-[12px]">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => invite.mutate()}
            disabled={!email || invite.isPending}
          >
            {invite.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
            )}
            Invite
          </Button>
        </div>
        {tempPwd && (
          <div className="text-[12px] font-mono p-2 rounded-[3px] border border-accent/40 bg-accent/5">
            Temporary password: <span className="text-accent">{tempPwd}</span>
            <span className="block text-text-muted mt-1">
              Share with the new user out-of-band. They can change it after signing in.
            </span>
          </div>
        )}
      </section>

      {/* Members table */}
      <section className="border border-border rounded-[3px] bg-panel">
        <div className="px-4 py-3 border-b border-border text-[12px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Members
        </div>
        {isLoading ? (
          <div className="p-4 text-[12px] text-text-muted">Loading…</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="text-left px-4 py-2">Email</th>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Role</th>
                <th className="text-left px-4 py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-[12px]">{m.email}</td>
                  <td className="px-4 py-2">{m.display_name || "—"}</td>
                  <td className="px-4 py-2">
                    <Select
                      value={m.role}
                      onValueChange={(v) =>
                        changeRole.mutate({ userId: m.id, newRole: v as AppRole, oldRole: m.role })
                      }
                    >
                      <SelectTrigger className="h-7 w-32 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-2">
                    <Switch
                      checked={m.active}
                      onCheckedChange={(v) =>
                        toggleActive.mutate({ userId: m.id, active: v, email: m.email })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Audit log */}
      <section className="border border-border rounded-[3px] bg-panel">
        <div className="px-4 py-3 border-b border-border text-[12px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Audit log (last 50)
        </div>
        <ul className="divide-y divide-border max-h-96 overflow-auto">
          {audit.length === 0 && (
            <li className="p-4 text-[12px] text-text-muted">No activity yet.</li>
          )}
          {audit.map((a) => (
            <li key={a.id} className="px-4 py-2 text-[12px] flex items-center gap-3">
              <span className="font-mono text-text-muted shrink-0">
                {new Date(a.created_at).toLocaleString("en-GB", {
                  hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short",
                })}
              </span>
              <span className="font-mono text-accent shrink-0">{a.action}</span>
              <span className="text-text-primary truncate">{a.summary}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default TeamSettings;