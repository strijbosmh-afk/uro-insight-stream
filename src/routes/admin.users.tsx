import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserPlus, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Panel } from "@/components/shell/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  listUsers,
  listInvitations,
  listAuditLog,
  inviteUser,
  resendInvitation,
  revokeInvitation,
  updateUserRole,
  setUserActive,
  deleteUser,
  updateUserProfile,
  bulkUpdateRole,
  bulkSetActive,
  type AppRole,
  type AdminUserRow,
  type PendingInvitation,
  type AdminAuditEntry,
} from "@/serverFns/admin-users";
import { EmailDiagnosticsView } from "@/components/admin/EmailDiagnosticsView";
import { TableRowSkeleton } from "@/components/shell/Skeletons";
import { useMutationWithToast } from "@/hooks/useMutationWithToast";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users — UroFeed admin" }] }),
  component: UsersAdminPage,
});

function UsersAdminPage() {
  const { isAdmin, loading } = useAuth();
  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="p-6">
        <Panel title="Access denied">
          <p className="text-sm text-text-muted">
            This page is admin-only.{" "}
            <Link to="/dashboard" className="text-accent underline">
              Go to dashboard
            </Link>
            .
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="invitations">Pending invitations</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="email">Email diagnostics</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="invitations" className="mt-4">
          <InvitationsTab />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTab />
        </TabsContent>
        <TabsContent value="email" className="mt-4">
          <EmailDiagnosticsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------- Users tab ----------------

function UsersTab() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listUsers);
  const bulkRoleFn = useServerFn(bulkUpdateRole);
  const bulkActiveFn = useServerFn(bulkSetActive);
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<"all" | AppRole>("all");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "active" | "deactivated">("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = React.useState<AppRole>("viewer");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", search, roleFilter, statusFilter],
    queryFn: () =>
      listFn({
        data: {
          search: search || undefined,
          role: roleFilter === "all" ? undefined : roleFilter,
          status: statusFilter === "all" ? undefined : statusFilter,
        },
      }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const users = data?.users ?? [];
  // Selectable = all users except yourself (server blocks self-destructive ops anyway,
  // but excluding self from bulk avoids confusing "1 failed" toasts on every action).
  const selectableIds = React.useMemo(
    () => users.filter((u) => u.id !== currentUser?.id).map((u) => u.id),
    [users, currentUser?.id],
  );
  // Drop selections that disappeared after a filter/refresh.
  React.useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(selectableIds);
      const next = new Set<string>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [selectableIds]);

  const allSelected = selectableIds.length > 0 && selected.size === selectableIds.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(selectableIds) : new Set());
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const reportBulk = (label: string, res: { succeeded: string[]; failed: { userId: string; error: string }[] }) => {
    if (res.succeeded.length && !res.failed.length) {
      toast.success(`${label}: ${res.succeeded.length} user${res.succeeded.length === 1 ? "" : "s"} updated`);
    } else if (res.succeeded.length && res.failed.length) {
      toast.warning(`${label}: ${res.succeeded.length} updated, ${res.failed.length} failed`, {
        description: res.failed[0]?.error,
      });
    } else {
      toast.error(`${label} failed`, { description: res.failed[0]?.error });
    }
  };

  const bulkRoleMutation = useMutation({
    mutationFn: () => bulkRoleFn({ data: { userIds: Array.from(selected), role: bulkRole } }),
    onSuccess: (res) => {
      reportBulk(`Role → ${bulkRole}`, res);
      setSelected(new Set());
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkActiveMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      bulkActiveFn({ data: { userIds: Array.from(selected), isActive } }),
    onSuccess: (res, isActive) => {
      reportBulk(isActive ? "Reactivate" : "Deactivate", res);
      setSelected(new Set());
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkPending =
    bulkRoleMutation.isPending || bulkActiveMutation.isPending;

  return (
    <Panel
      title="Users"
      actions={
        <InviteDialog onCreated={() => qc.invalidateQueries({ queryKey: ["admin-invitations"] })} />
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input
          placeholder="Search email or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="deactivated">Deactivated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-md border border-border bg-panel-elevated/40">
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <span className="text-xs text-text-muted">
            (your own account is excluded from bulk actions)
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-muted">Set role:</span>
            <Select value={bulkRole} onValueChange={(v) => setBulkRole(v as AppRole)}>
              <SelectTrigger className="w-[110px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkPending}
              onClick={() => bulkRoleMutation.mutate()}
            >
              Apply
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkPending}
            onClick={() => bulkActiveMutation.mutate(true)}
          >
            Reactivate
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkPending}
            onClick={() => bulkActiveMutation.mutate(false)}
          >
            Deactivate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={bulkPending}
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-text-muted border-b border-border">
            <tr>
              <th className="w-8 py-2">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAll(v === true)}
                  aria-label="Select all users"
                  disabled={selectableIds.length === 0 || isLoading}
                />
              </th>
              <th className="text-left py-2 font-medium">User</th>
              <th className="text-left py-2 font-medium">Role</th>
              <th className="text-left py-2 font-medium">Status</th>
              <th className="text-left py-2 font-medium">Last sign-in</th>
              <th className="text-left py-2 font-medium">Created</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRowSkeleton key={i} cols={7} />
              ))
            ) : (
              <>
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === currentUser?.id}
                    onChange={refresh}
                    selected={selected.has(u.id)}
                    onSelectChange={(c) => toggleOne(u.id, c)}
                  />
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-text-muted">
                      No users match those filters.
                    </td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function UserRow({
  user,
  isSelf,
  onChange,
  selected,
  onSelectChange,
}: {
  user: AdminUserRow;
  isSelf: boolean;
  onChange: () => void;
  selected: boolean;
  onSelectChange: (checked: boolean) => void;
}) {
  const updateRoleFn = useServerFn(updateUserRole);
  const setActiveFn = useServerFn(setUserActive);
  const deleteFn = useServerFn(deleteUser);
  const updateProfileFn = useServerFn(updateUserProfile);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [editOpen, setEditOpen] = React.useState(false);
  const [editName, setEditName] = React.useState(user.display_name ?? "");
  const [editNotes, setEditNotes] = React.useState(user.notes ?? "");

  // Reset draft state whenever the drawer opens against a fresh row.
  React.useEffect(() => {
    if (editOpen) {
      setEditName(user.display_name ?? "");
      setEditNotes(user.notes ?? "");
    }
  }, [editOpen, user.display_name, user.notes]);

  const profileMutation = useMutation({
    mutationFn: () =>
      updateProfileFn({
        data: {
          userId: user.id,
          displayName: editName.trim() || null,
          notes: editNotes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Profile updated");
      setEditOpen(false);
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMutation = useMutation({
    mutationFn: (role: AppRole) => updateRoleFn({ data: { userId: user.id, role } }),
    onSuccess: () => {
      toast.success("Role updated");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      setActiveFn({ data: { userId: user.id, isActive } }),
    onSuccess: () => {
      toast.success("Updated");
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteFn({ data: { userId: user.id } }),
    onSuccess: () => {
      toast.success("User deleted");
      setConfirmDelete(false);
      onChange();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const role: AppRole = user.roles[0] ?? "viewer";
  const isSuperAdmin = user.email?.toLowerCase() === "strijbosmh@gmail.com";

  return (
    <tr className="border-b border-border/60 hover:bg-panel-elevated/40">
      <td className="py-3 align-middle">
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onSelectChange(v === true)}
          disabled={isSelf}
          aria-label={isSelf ? "You can't bulk-action your own account" : `Select ${user.email}`}
        />
      </td>
      <td className="py-3">
        <div className="font-medium text-text-primary">{user.display_name ?? "—"}</div>
        <div className="text-xs text-text-muted flex items-center gap-2">
          <span>{user.email}</span>
          {isSuperAdmin && (
            <Badge className="bg-primary text-primary-foreground border-transparent">
              Super Admin
            </Badge>
          )}
        </div>
      </td>
      <td className="py-3">
        <Select
          value={role}
          onValueChange={(v) => roleMutation.mutate(v as AppRole)}
          disabled={roleMutation.isPending}
        >
          <SelectTrigger className="w-[110px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="editor">Editor</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="py-3">
        {user.is_active ? (
          <Badge variant="outline" className="border-success/40 text-success">Active</Badge>
        ) : (
          <Badge variant="outline" className="border-destructive/40 text-destructive">Deactivated</Badge>
        )}
      </td>
      <td className="py-3 text-xs text-text-muted">
        {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "Never"}
      </td>
      <td className="py-3 text-xs text-text-muted">
        {new Date(user.created_at).toLocaleDateString()}
      </td>
      <td className="py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              Edit profile…
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isSelf || activeMutation.isPending}
              onClick={() => activeMutation.mutate(!user.is_active)}
              title={isSelf ? "You can't deactivate your own account" : undefined}
            >
              {user.is_active ? "Deactivate" : "Reactivate"}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isSelf}
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmDelete(true)}
              title={isSelf ? "You can't delete your own account" : undefined}
            >
              Delete user…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Sheet open={editOpen} onOpenChange={setEditOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Edit user</SheetTitle>
              <SheetDescription>{user.email}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider text-text-muted">
                  Display name
                </Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. Dr. Jane Doe"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wider text-text-muted">
                  Admin notes <span className="text-text-muted/60">(private)</span>
                </Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  maxLength={2000}
                  rows={6}
                  placeholder="Internal notes about this user — only visible to admins."
                />
                <div className="text-[10px] font-mono text-text-muted text-right">
                  {editNotes.length}/2000
                </div>
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => profileMutation.mutate()}
                disabled={profileMutation.isPending}
              >
                {profileMutation.isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                )}
                Save changes
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {user.email}?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-text-muted">
              This permanently deletes the account. Type the email to confirm.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={user.email}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={confirmText !== user.email || deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </td>
    </tr>
  );
}

// ---------------- Invite dialog ----------------

function InviteDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<AppRole>("viewer");
  const [displayName, setDisplayName] = React.useState("");
  const inviteFn = useServerFn(inviteUser);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      inviteFn({
        data: { email, role, displayName: displayName || undefined },
      }),
    onSuccess: () => {
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      setDisplayName("");
      setRole("viewer");
      setOpen(false);
      onCreated();
      qc.invalidateQueries({ queryKey: ["admin-invitations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="w-4 h-4 mr-1.5" />
          Invite user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a user</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase tracking-wider text-text-muted">Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-text-muted">Display name (optional)</label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-text-muted">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — full access including user management</SelectItem>
                <SelectItem value="editor">Editor — can manage sources, hashtags, congresses</SelectItem>
                <SelectItem value="viewer">Viewer — read-only access</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!email || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Invitations tab ----------------

function InvitationsTab() {
  const listFn = useServerFn(listInvitations);
  const resendFn = useServerFn(resendInvitation);
  const revokeFn = useServerFn(revokeInvitation);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-invitations"],
    queryFn: () => listFn(),
  });

  const resend = useMutationWithToast({
    mutationFn: (id: string) => resendFn({ data: { id } }),
    success: "Invitation resent",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-invitations"] }),
  });
  const revoke = useMutationWithToast({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    success: "Invitation revoked",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-invitations"] }),
  });

  const pending = (data ?? []).filter((i: PendingInvitation) => i.status === "pending");

  return (
    <Panel title="Pending invitations">
      {!isLoading && pending.length === 0 ? (
        <p className="text-sm text-text-muted">No pending invitations.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-text-muted border-b border-border">
              <tr>
                <th className="text-left py-2 font-medium">Email</th>
                <th className="text-left py-2 font-medium">Role</th>
                <th className="text-left py-2 font-medium">Invited by</th>
                <th className="text-left py-2 font-medium">Sent</th>
                <th className="text-left py-2 font-medium">Expires</th>
                <th className="text-right py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={6} />
                ))}
              {pending.map((inv: PendingInvitation) => (
                <tr key={inv.id} className="border-b border-border/60">
                  <td className="py-3">{inv.email}</td>
                  <td className="py-3 capitalize">{inv.role}</td>
                  <td className="py-3 text-xs text-text-muted">{inv.invited_by_email ?? "—"}</td>
                  <td className="py-3 text-xs text-text-muted">
                    {new Date(inv.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 text-xs text-text-muted">
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 text-right space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={resend.isPending}
                      onClick={() => resend.mutate(inv.id)}
                    >
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(inv.id)}
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ---------------- Audit tab ----------------

function AuditTab() {
  const listFn = useServerFn(listAuditLog);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => listFn({ data: {} }),
  });

  return (
    <Panel title="Audit log" loading={isLoading}>
      {isLoading ? (
        <ul className="divide-y divide-border/60">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="py-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="block h-3 w-32 rounded-[2px] bg-panel-elevated/70 animate-pulse" />
                <span className="block h-4 w-16 rounded-[2px] bg-panel-elevated/70 animate-pulse" />
              </div>
              <span className="block h-2.5 w-64 rounded-[2px] bg-panel-elevated/70 animate-pulse" />
            </li>
          ))}
        </ul>
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-text-muted">No admin actions recorded yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {(data ?? []).map((entry: AdminAuditEntry) => (
            <li key={entry.id} className="py-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-text-muted">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
                <Badge variant="outline">{entry.action}</Badge>
              </div>
              <div className="text-xs text-text-muted mt-1">
                actor: {entry.actor_email ?? entry.actor_user_id}
                {entry.target_email ? ` · target: ${entry.target_email}` : ""}
              </div>
              {entry.metadata != null && (
                <pre className="mt-2 text-[11px] font-mono bg-bg p-2 rounded border border-border overflow-x-auto">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}