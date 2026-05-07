import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, AlertTriangle, ExternalLink, Trash2, Send } from "lucide-react";
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
} from "@/serverFns/x-credentials";
import { ComposeTweetDialog } from "@/components/x/ComposeTweetDialog";

const DAILY_CAP = 50;

type XConnectionStatus = NonNullable<Awaited<ReturnType<typeof getXConnectionStatus>>>;

export function XSettings() {
  const qc = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ["x-connection-status"],
    queryFn: () => getXConnectionStatus(),
  });

  const [editing, setEditing] = React.useState(false);
  const [justConnectedStatus, setJustConnectedStatus] = React.useState<XConnectionStatus | null>(null);

  React.useEffect(() => {
    if (status) setJustConnectedStatus(null);
  }, [status]);

  if (isLoading) {
    return <div className="text-text-muted text-sm">Loading…</div>;
  }

  const visibleStatus = status ?? justConnectedStatus;
  const connectedStatus = visibleStatus && !visibleStatus.revoked_at ? visibleStatus : null;
  const connected = !!connectedStatus;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">X (Twitter) account</h2>
        <p className="text-sm text-text-muted mt-1">
          Connect your X account to post and reply directly from UroFeed. Your
          credentials are encrypted and only ever used by you.
        </p>
      </div>

      {connected && !editing ? (
        <ConnectedView
          status={connectedStatus}
          onReplace={() => setEditing(true)}
          onDisconnect={async () => {
            await disconnectX();
            toast.success("Disconnected from X");
            setJustConnectedStatus(null);
            qc.invalidateQueries({ queryKey: ["x-connection-status"] });
          }}
        />
      ) : (
        <ConnectForm
          onConnected={(nextStatus) => {
            setJustConnectedStatus(nextStatus);
            setEditing(false);
            qc.invalidateQueries({ queryKey: ["x-connection-status"] });
          }}
          onCancel={connected ? () => setEditing(false) : undefined}
        />
      )}
    </div>
  );
}

function ConnectForm({
  onConnected,
  onCancel,
}: {
  onConnected: (status: XConnectionStatus) => void;
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
        onConnected({
          user_id: "",
          x_user_id: res.xUserId,
          x_username: res.xUsername,
          last_verified_at: new Date().toISOString(),
          last_post_at: null,
          scope_write: true,
          post_count_today: 0,
          post_count_window_start: null,
          revoked_at: null,
        });
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

function ConnectedView({
  status,
  onReplace,
  onDisconnect,
}: {
  status: {
    x_username: string | null;
    last_verified_at: string | null;
    last_post_at: string | null;
    scope_write: boolean | null;
    post_count_today: number | null;
    post_count_window_start: string | null;
  };
  onReplace: () => void;
  onDisconnect: () => void | Promise<void>;
}) {
  const [composeOpen, setComposeOpen] = React.useState(false);
  const { data: posts } = useQuery({
    queryKey: ["x-my-posts"],
    queryFn: () => listMyPosts({ data: { limit: 20 } }),
  });

  const windowStart = status.post_count_window_start
    ? new Date(status.post_count_window_start).getTime()
    : 0;
  const windowExpired = !windowStart || Date.now() - windowStart > 24 * 60 * 60 * 1000;
  const used = windowExpired ? 0 : status.post_count_today ?? 0;

  return (
    <div className="space-y-6">
      <div className="border border-border rounded-[3px] p-4 bg-panel">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span className="font-mono text-sm">
                @{status.x_username ?? "unknown"}
              </span>
              {status.scope_write ? (
                <Badge variant="secondary" className="text-[10px]">
                  Read + Write
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px]">
                  Read-only token
                </Badge>
              )}
            </div>
            <div className="text-xs text-text-muted mt-1">
              Verified{" "}
              {status.last_verified_at
                ? new Date(status.last_verified_at).toLocaleString()
                : "—"}
            </div>
            <div className="text-xs text-text-muted">
              Today: {used} / {DAILY_CAP} posts
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setComposeOpen(true)}>
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Send a test tweet
            </Button>
            <Button size="sm" variant="ghost" onClick={onReplace}>
              Replace credentials
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost">
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  Disconnect
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect X account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your encrypted credentials will be wiped from UroFeed. Past
                    posts remain on X. You can reconnect any time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void onDisconnect()}>
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <ComposeTweetDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        initialText="Hello from UroFeed 👋"
      />

      <div>
        <h3 className="text-sm font-semibold mb-2">
          Recent posts from UroFeed
        </h3>
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
                {p.posted_tweet_id && status.x_username && (
                  <a
                    className="text-xs text-accent inline-flex items-center gap-1 mt-1"
                    href={`https://x.com/${status.x_username}/status/${p.posted_tweet_id}`}
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