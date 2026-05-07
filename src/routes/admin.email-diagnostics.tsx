import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, ShieldAlert, Ban, Inbox, Search } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Panel } from "@/components/shell/Panel";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  listEmailDiagnostics,
  getRecipientDetail,
  type EmailLogRow,
} from "@/serverFns/email-diagnostics";

export const Route = createFileRoute("/admin/email-diagnostics")({
  head: () => ({ meta: [{ title: "Email diagnostics — UroFeed admin" }] }),
  component: EmailDiagnosticsPage,
});

function EmailDiagnosticsPage() {
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
      <DiagnosticsView />
    </div>
  );
}

function DiagnosticsView() {
  const listFn = useServerFn(listEmailDiagnostics);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [template, setTemplate] = React.useState<string>("all");
  const [status, setStatus] = React.useState<string>("all");
  const [rangeHours, setRangeHours] = React.useState<number>(24 * 7);
  const [openEmail, setOpenEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["email-diagnostics", debouncedSearch, template, status, rangeHours],
    queryFn: () =>
      listFn({
        data: {
          search: debouncedSearch || undefined,
          template: template === "all" ? undefined : template,
          status: status === "all" ? undefined : status,
          rangeHours,
        },
      }),
    refetchInterval: 30_000,
  });

  const summary = data?.summary;

  return (
    <>
      <Panel title="Email delivery diagnostics">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <StatCard label="Total" value={summary?.total ?? 0} icon={Inbox} />
          <StatCard label="Sent" value={summary?.sent ?? 0} icon={Mail} tone="success" />
          <StatCard label="Pending" value={summary?.pending ?? 0} icon={Loader2} />
          <StatCard label="Failed" value={summary?.failed ?? 0} icon={ShieldAlert} tone="danger" />
          <StatCard label="Suppressed" value={summary?.suppressed ?? 0} icon={Ban} tone="warning" />
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative max-w-xs flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <Input
              placeholder="Search recipient email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7"
            />
          </div>
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All templates</SelectItem>
              {data?.templates.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="dlq">DLQ</SelectItem>
              <SelectItem value="bounced">Bounced</SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(rangeHours)} onValueChange={(v) => setRangeHours(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24">Last 24h</SelectItem>
              <SelectItem value="168">Last 7 days</SelectItem>
              <SelectItem value="720">Last 30 days</SelectItem>
              <SelectItem value="2160">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading log…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-text-muted border-b border-border">
                <tr>
                  <th className="text-left py-2 font-medium">Template</th>
                  <th className="text-left py-2 font-medium">Recipient</th>
                  <th className="text-left py-2 font-medium">Status</th>
                  <th className="text-left py-2 font-medium">When</th>
                  <th className="text-left py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((row, i) => (
                  <tr
                    key={`${row.message_id ?? row.recipient_email}-${i}`}
                    className="border-b border-border/60 hover:bg-panel-elevated/40 cursor-pointer"
                    onClick={() => setOpenEmail(row.recipient_email)}
                  >
                    <td className="py-2 font-mono text-xs">{row.template_name}</td>
                    <td className="py-2">{row.recipient_email}</td>
                    <td className="py-2"><StatusBadge status={row.status} /></td>
                    <td className="py-2 text-xs text-text-muted">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 text-xs text-destructive max-w-[280px] truncate" title={row.error_message ?? undefined}>
                      {row.error_message ?? ""}
                    </td>
                  </tr>
                ))}
                {(data?.rows.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-text-muted">
                      No emails match those filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {data?.truncated && (
              <p className="text-xs text-text-muted mt-2">
                Showing first {data.rows.length} matching emails. Narrow filters to see more.
              </p>
            )}
          </div>
        )}
      </Panel>

      <Sheet open={!!openEmail} onOpenChange={(o) => !o && setOpenEmail(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {openEmail && <RecipientDetailView email={openEmail} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function RecipientDetailView({ email }: { email: string }) {
  const detailFn = useServerFn(getRecipientDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["recipient-detail", email],
    queryFn: () => detailFn({ data: { email } }),
  });

  return (
    <>
      <SheetHeader>
        <SheetTitle className="break-all">{email}</SheetTitle>
        <SheetDescription>Per-recipient delivery state</SheetDescription>
      </SheetHeader>

      {isLoading || !data ? (
        <div className="mt-6 flex items-center gap-2 text-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <DetailCard
              title="Suppression"
              tone={data.suppression.suppressed ? "danger" : "success"}
              primary={data.suppression.suppressed ? `Blocked: ${data.suppression.reason ?? "unknown"}` : "Not suppressed"}
              secondary={
                data.suppression.created_at
                  ? `Since ${new Date(data.suppression.created_at).toLocaleString()}`
                  : "—"
              }
            />
            <DetailCard
              title="Unsubscribe"
              tone={data.unsubscribe.used_at ? "warning" : data.unsubscribe.has_token ? "neutral" : "muted"}
              primary={
                data.unsubscribe.used_at
                  ? "Unsubscribed"
                  : data.unsubscribe.has_token
                    ? "Token issued"
                    : "No token"
              }
              secondary={
                data.unsubscribe.used_at
                  ? `Used ${new Date(data.unsubscribe.used_at).toLocaleString()}`
                  : data.unsubscribe.created_at
                    ? `Issued ${new Date(data.unsubscribe.created_at).toLocaleString()}`
                    : "—"
              }
            />
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
              Send history ({data.history.length})
            </h3>
            <div className="border border-border rounded-md divide-y divide-border max-h-[60vh] overflow-y-auto">
              {data.history.length === 0 && (
                <div className="p-4 text-sm text-text-muted">No emails sent to this address.</div>
              )}
              {data.history.map((h: EmailLogRow, i: number) => (
                <div key={i} className="p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono">{h.template_name}</span>
                    <StatusBadge status={h.status} />
                  </div>
                  <div className="text-text-muted">
                    {new Date(h.created_at).toLocaleString()}
                  </div>
                  {h.error_message && (
                    <div className="text-destructive break-words">{h.error_message}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: "border-success/40 text-success",
    pending: "border-border text-text-muted",
    failed: "border-destructive/40 text-destructive",
    dlq: "border-destructive/40 text-destructive",
    bounced: "border-destructive/40 text-destructive",
    complained: "border-destructive/40 text-destructive",
    suppressed: "border-warning/40 text-warning",
  };
  return (
    <Badge variant="outline" className={map[status] ?? "border-border text-text-muted"}>
      {status}
    </Badge>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "success" | "danger" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-destructive"
        : tone === "warning"
          ? "text-warning"
          : "text-text-primary";
  return (
    <div className="border border-border rounded-md p-3 bg-panel-elevated/40">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-text-muted">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}

function DetailCard({
  title,
  primary,
  secondary,
  tone,
}: {
  title: string;
  primary: string;
  secondary: string;
  tone: "success" | "danger" | "warning" | "neutral" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-destructive"
        : tone === "warning"
          ? "text-warning"
          : tone === "neutral"
            ? "text-text-primary"
            : "text-text-muted";
  return (
    <div className="border border-border rounded-md p-3 bg-panel-elevated/40">
      <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
        {title}
      </div>
      <div className={`text-sm font-medium mt-1 ${toneClass}`}>{primary}</div>
      <div className="text-xs text-text-muted mt-0.5">{secondary}</div>
    </div>
  );
}