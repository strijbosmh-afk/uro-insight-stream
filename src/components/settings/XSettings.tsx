import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, AlertTriangle, ExternalLink, Trash2, Send, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  connectX,
  disconnectX,
  getXConnectionStatus,
  listMyPosts,
  listXAccounts,
  switchActiveXAccount,
} from "@/serverFns/x-credentials";
import { ComposeTweetDialog } from "@/components/x/ComposeTweetDialog";

const DAILY_CAP = 50;

type XConnectionStatus = NonNullable<Awaited<ReturnType<typeof getXConnectionStatus>>>;
type XAccount = Awaited<ReturnType<typeof listXAccounts>>[number];

export function XSettings() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ["x-connection-status"],
    queryFn: () => getXConnectionStatus(),
  });
  const { data: accounts } = useQuery({
    queryKey: ["x-accounts"],
    queryFn: () => listXAccounts(),
  });

  const [adding, setAdding] = React.useState(false);

  if (isLoading) {
    return <div className="text-text-muted text-sm">Loading…</div>;
  }

  const accountList = accounts ?? [];
  const hasAny = accountList.length > 0;
  const activeAccount = accountList.find((a) => a.is_active) ?? null;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["x-connection-status"] });
    qc.invalidateQueries({ queryKey: ["x-accounts"] });
    qc.invalidateQueries({ queryKey: ["x-my-posts"] });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">X (Twitter) accounts</h2>
        <p className="text-sm text-text-muted mt-1">
          Connect one or more X accounts and switch between them. The active
          account is used when you post or reply from UroFeed. Credentials are
          encrypted and only ever used by you.
        </p>
      </div>

      {hasAny && !adding && (
        <AccountList
          accounts={accountList}
          activeStatus={status ?? null}
          onAdd={() => setAdding(true)}
          onChanged={invalidateAll}
        />
      )}

      {(adding || !hasAny) && (
        <ConnectForm
          onConnected={() => {
            setAdding(false);
            invalidateAll();
          }}
          onCancel={hasAny ? () => setAdding(false) : undefined}
        />
      )}

      {activeAccount && !adding && (
        <RecentPosts username={activeAccount.x_username} />
      )}
    </div>
  );
}

function AccountList({
  accounts,
  activeStatus,
  onAdd,
  onChanged,
}: {
  accounts: XAccount[];
  activeStatus: XConnectionStatus | null;
  onAdd: () => void;
  onChanged: () => void;
}) {
  const switchMut = useMutation({
    mutationFn: (accountId: string) =>
      switchActiveXAccount({ data: { accountId } }),
    onSuccess: (_res, accountId) => {
      const acc = accounts.find((a) => a.id === accountId);
      toast.success(`Switched to @${acc?.x_username ?? "account"}`);
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const disconnectMut = useMutation({
    mutationFn: (accountId: string) =>
      disconnectX({ data: { accountId } }),
    onSuccess: () => {
      toast.success("Account removed");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {accounts.map((a) => {
          const isActive = a.is_active;
          const used =
            isActive && activeStatus
              ? (() => {
                  const ws = activeStatus.post_count_window_start
                    ? new Date(activeStatus.post_count_window_start).getTime()
                    : 0;
                  const expired = !ws || Date.now() - ws > 24 * 60 * 60 * 1000;
                  return expired ? 0 : activeStatus.post_count_today ?? 0;
                })()
              : null;
          return (
            <div
              key={a.id}
              className={
                "border rounded-[3px] p-3 bg-panel flex items-start justify-between gap-3 flex-wrap " +
                (isActive ? "border-success/60" : "border-border")
              }
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {isActive ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : (
                    <span className="w-4 h-4 inline-block" />
                  )}
                  <span className="font-mono text-sm">@{a.x_username ?? "unknown"}</span>
                  {isActive && (
                    <Badge variant="secondary" className="text-[10px]">
                      Active
                    </Badge>
                  )}
                  {a.scope_write ? (
                    <Badge variant="secondary" className="text-[10px]">
                      Read + Write
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[10px]">
                      Read-only
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-text-muted mt-1">
                  Verified{" "}
                  {a.last_verified_at
                    ? new Date(a.last_verified_at).toLocaleString()
                    : "—"}
                </div>
                {used !== null && (
                  <div className="text-xs text-text-muted">
                    Today: {used} / {DAILY_CAP} posts
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                {!isActive && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => switchMut.mutate(a.id)}
                    disabled={switchMut.isPending}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Use this account
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost">
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Remove
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Disconnect @{a.x_username}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Encrypted credentials will be wiped. Past posts remain
                        on X. You can reconnect any time.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => disconnectMut.mutate(a.id)}
                      >
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Add another account
        </Button>
      </div>
    </div>
  );
}

function RecentPosts({ username }: { username: string | null }) {
  const [composeOpen, setComposeOpen] = React.useState(false);
  const { data: posts } = useQuery({
    queryKey: ["x-my-posts"],
    queryFn: () => listMyPosts({ data: { limit: 20 } }),
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recent posts from UroFeed</h3>
        <Button size="sm" onClick={() => setComposeOpen(true)}>
          <Send className="w-3.5 h-3.5 mr-1.5" />
          Send a test tweet
        </Button>
      </div>
      <ComposeTweetDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        initialText="Hello from UroFeed 👋"
      />
      {!posts || posts.length === 0 ? (
        <div className="text-xs text-text-muted">
          No posts yet. Send a test tweet to try it out.
        </div>
      ) : (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li
              key={p.id}
              className="border border-border rounded-[3px] p-2 bg-panel text-sm"
            >
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                <StatusBadge status={p.status} />
                <span>{new Date(p.posted_at).toLocaleString()}</span>
                {p.in_reply_to_tweet_id && <span>reply</span>}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-text-primary line-clamp-3">
                {p.text}
              </div>
              {p.error_message && (
                <div className="mt-1 text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {p.error_message}
                </div>
              )}
              {p.posted_tweet_id && username && (
                <a
                  className="text-xs text-accent inline-flex items-center gap-1 mt-1"
                  href={`https://x.com/${username}/status/${p.posted_tweet_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on X <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConnectForm({
  onConnected,
  onCancel,
}: {
  onConnected: () => void;
  onCancel?: () => void;
}) {
  const [consumerKey, setConsumerKey] = React.useState("");
  const [consumerSecret, setConsumerSecret] = React.useState("");
  const [accessToken, setAccessToken] = React.useState("");
  const [accessTokenSecret, setAccessTokenSecret] = React.useState("");

  const mutation = useMutation({
    mutationFn: () =>
      connectX({
        data: { consumerKey, consumerSecret, accessToken, accessTokenSecret },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`Connected as @${res.xUsername}`);
        setConsumerKey("");
        setConsumerSecret("");
        setAccessToken("");
        setAccessTokenSecret("");
        onConnected();
      } else {
        toast.error(res.message);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4">
      <Accordion type="single" collapsible>
        <AccordionItem value="how" className="border border-border rounded-[3px] px-3">
          <AccordionTrigger className="text-sm">
            How to get these credentials
          </AccordionTrigger>
          <AccordionContent className="text-sm text-text-muted space-y-2">
            <ol className="list-decimal pl-5 space-y-1">
              <li>
                Go to the{" "}
                <a
                  href="https://developer.x.com/en/portal/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent inline-flex items-center gap-1"
                >
                  X Developer Portal <ExternalLink className="w-3 h-3" />
                </a>{" "}
                and create (or open) an App.
              </li>
              <li>
                Under <b>User authentication settings</b>, set permissions to{" "}
                <b>Read and write</b>.
              </li>
              <li>
                Under <b>Keys and tokens</b>, generate (or reveal) the{" "}
                <b>Consumer Keys</b> — copy Key + Secret.
              </li>
              <li>
                Generate the <b>Access Token and Secret</b> for your own user.
                These must be created <i>after</i> Read+Write is enabled.
              </li>
              <li>Paste all four values below.</li>
            </ol>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="grid gap-3">
        <Field label="Consumer Key" value={consumerKey} onChange={setConsumerKey} />
        <Field label="Consumer Secret" value={consumerSecret} onChange={setConsumerSecret} secret />
        <Field label="Access Token" value={accessToken} onChange={setAccessToken} />
        <Field label="Access Token Secret" value={accessTokenSecret} onChange={setAccessTokenSecret} secret />
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={mutation.isPending}>
            Cancel
          </Button>
        )}
        <Button
          onClick={() => mutation.mutate()}
          disabled={
            mutation.isPending ||
            !consumerKey ||
            !consumerSecret ||
            !accessToken ||
            !accessTokenSecret
          }
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying with X…
            </>
          ) : (
            "Connect"
          )}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  secret,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secret?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type={secret ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        className="font-mono text-sm"
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "sent")
    return <span className="text-success">sent</span>;
  if (status === "rate_limited")
    return <span className="text-warning">rate-limited</span>;
  return <span className="text-destructive">failed</span>;
}

export default XSettings;