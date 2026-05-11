import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, AlertTriangle, ExternalLink, Trash2, Send, Plus, RefreshCw, Info } from "lucide-react";
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
import { XConnectWizard } from "@/components/x-wizard/XConnectWizard";

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
  const [wizardOpen, setWizardOpen] = React.useState(false);

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
          onAdd={() => setWizardOpen(true)}
          onChanged={invalidateAll}
        />
      )}

      {!hasAny && (
        <div className="border border-border rounded-[3px] p-4 bg-panel space-y-3">
          <div className="text-sm text-text-primary">
            You haven't connected an X account yet. The setup wizard walks
            you through the X Developer Portal in 8 illustrated steps.
          </div>
          <Button onClick={() => setWizardOpen(true)}>
            Launch setup wizard
          </Button>
        </div>
      )}

      <XConnectWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onConnected={() => {
          setAdding(false);
          invalidateAll();
        }}
      />

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
      <HelpPanel />

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

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[12px] bg-panel-elevated border border-border rounded px-1.5 py-0.5 text-text-primary">
      {children}
    </code>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent text-accent-foreground text-xs font-semibold shrink-0">
      {n}
    </span>
  );
}

function HelpPanel() {
  return (
    <Accordion type="single" collapsible defaultValue="how">
      <AccordionItem value="how" className="border border-border rounded-[3px] px-3">
        <AccordionTrigger className="text-sm">
          How to get these credentials{" "}
          <span className="text-text-muted ml-2">(~3 minutes)</span>
        </AccordionTrigger>
        <AccordionContent className="text-sm text-text-muted space-y-4 pt-2">
          <div className="flex gap-2 items-start border border-warning/40 bg-warning/10 rounded-[3px] p-3">
            <Info className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <p className="text-text-primary text-xs leading-relaxed">
              UroFeed uses <b>OAuth 1.0a</b> — <b>NOT</b> OAuth 2.0. Ignore any
              "Client ID / Client Secret" dialogs you see in the X portal; you
              need four different values listed below.
            </p>
          </div>

          <Step n={1} title="Open or create your app">
            <p>
              Go to the{" "}
              <a
                href="https://developer.x.com/en/portal/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-accent inline-flex items-center gap-1"
              >
                X Developer Portal <ExternalLink className="w-3 h-3" />
              </a>{" "}
              → Projects & Apps → select your app (or create one inside a
              Project).
            </p>
          </Step>

          <Step n={2} title="Enable write access FIRST (order matters)">
            <p>
              In your app, scroll to <b>User authentication settings</b> → click{" "}
              <b>Set up</b>.
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-1">
              <li>
                App permissions: select <b>Read and write</b>
              </li>
              <li>
                Type of App: select <b>Web App, Automated App or Bot</b>
              </li>
              <li>
                Callback URI: <Code>https://localhost</Code> (any valid URL
                works — UroFeed doesn't use it)
              </li>
              <li>
                Website URL: your site, or <Code>https://localhost</Code>
              </li>
              <li>Save.</li>
            </ul>
            <div className="flex gap-2 items-start border border-destructive/40 bg-destructive/10 rounded-[3px] p-3 mt-3">
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-text-primary text-xs leading-relaxed">
                Skipping or delaying this step is the <b>#1 reason Connect
                fails</b>. Access Tokens are permanently locked to whatever
                permission level exists when they're generated.
              </p>
            </div>
          </Step>

          <Step n={3} title="Get your Consumer Key + Secret">
            <p>
              Go to the <b>Keys and tokens</b> tab → <b>Consumer Keys</b>{" "}
              section → click <b>Regenerate</b>.
            </p>
            <p className="mt-1">
              Copy <b>BOTH</b> values into the fields below immediately — the
              Secret is shown only once.
            </p>
          </Step>

          <Step n={4} title="Generate Access Token + Secret">
            <p>
              Same page, <b>Authentication Tokens</b> section →{" "}
              <b>Access Token and Secret</b> → click <b>Generate</b> (or
              Regenerate if one already exists).
            </p>
            <p className="mt-1">
              Verify the token shows <Code>Read and Write</Code> beneath it. If
              it says <Code>Read</Code> only, return to Step 2.
            </p>
            <p className="mt-1">
              Copy <b>BOTH</b> values immediately — the Secret is shown only
              once.
            </p>
          </Step>

          <Step n={5} title="Paste all four values into the form below and click Connect.">
            <></>
          </Step>

          <Accordion type="single" collapsible>
            <AccordionItem
              value="trouble"
              className="border border-border rounded-[3px] px-3"
            >
              <AccordionTrigger className="text-sm">
                Troubleshooting
              </AccordionTrigger>
              <AccordionContent className="text-xs text-text-muted space-y-2 pt-2">
                <p>
                  <b>401 Unauthorized:</b> wrong key, secret, or trailing
                  whitespace when pasting. Re-copy carefully.
                </p>
                <p>
                  <b>403 Forbidden:</b> Access Token was generated before
                  Read+Write was enabled. Regenerate it (Step 4).
                </p>
                <p>
                  <b>453:</b> your X API tier doesn't permit posting. Upgrade
                  to Basic or Pro tier at developer.x.com.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <StepBadge n={n} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-text-primary font-medium text-sm">{title}</div>
        <div className="text-xs leading-relaxed">{children}</div>
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