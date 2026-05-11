import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft, ArrowRight, Check, ExternalLink, Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IllustrationFrame, type Variant } from "./PortalIllustration";
import { connectX, getXConnectionStatus } from "@/serverFns/x-credentials";
import { getXSetupProgress, saveXSetupProgress } from "@/serverFns/x-setup-progress";

type Tier = "free" | "basic" | "pro" | "enterprise";

interface Step {
  id: number;
  title: string;
  variant: Variant;
}

const STEPS: Step[] = [
  { id: 1, title: "Do you have a developer account?", variant: "developer-account" },
  { id: 2, title: "Pick your tier", variant: "tier-picker" },
  { id: 3, title: "Create a Project + App", variant: "project-and-app" },
  { id: 4, title: "User authentication settings", variant: "user-auth-settings" },
  { id: 5, title: "Generate Consumer Keys + Access Token", variant: "keys-and-tokens" },
  { id: 6, title: "Paste credentials", variant: "paste-credentials" },
  { id: 7, title: "Verify", variant: "verify" },
  { id: 8, title: "Done", variant: "done" },
];

export function XConnectWizard({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConnected?: () => void;
}) {
  const qc = useQueryClient();
  const { data: progressData } = useQuery({
    queryKey: ["x-setup-progress"],
    queryFn: () => getXSetupProgress(),
    enabled: open,
  });
  const { data: status } = useQuery({
    queryKey: ["x-connection-status"],
    queryFn: () => getXConnectionStatus(),
    enabled: open,
  });

  const [step, setStep] = React.useState(1);
  const [tier, setTier] = React.useState<Tier>("free");
  const [consumerKey, setConsumerKey] = React.useState("");
  const [consumerSecret, setConsumerSecret] = React.useState("");
  const [accessToken, setAccessToken] = React.useState("");
  const [accessTokenSecret, setAccessTokenSecret] = React.useState("");
  const completedRef = React.useRef<Set<number>>(new Set());

  // Hydrate progress when wizard opens.
  React.useEffect(() => {
    if (!open || !progressData) return;
    const p = progressData.progress;
    setStep(Math.min(8, Math.max(1, p.current_step ?? 1)));
    if (p.tier_chosen) setTier(p.tier_chosen as Tier);
    completedRef.current = new Set((p.completed_steps as number[]) ?? []);
  }, [open, progressData]);

  const saveProgress = useMutation({
    mutationFn: (next: number) =>
      saveXSetupProgress({
        data: {
          current_step: next,
          completed_steps: Array.from(completedRef.current),
          tier_chosen: tier,
        },
      }),
  });

  const goNext = async () => {
    completedRef.current.add(step);
    const next = Math.min(8, step + 1);
    setStep(next);
    saveProgress.mutate(next);
  };
  const goBack = () => setStep((s) => Math.max(1, s - 1));
  const saveAndExit = async () => {
    await saveProgress.mutateAsync(step);
    toast.success("Progress saved — resume anytime from Settings → X");
    onOpenChange(false);
  };

  const connectMut = useMutation({
    mutationFn: () =>
      connectX({ data: { consumerKey, consumerSecret, accessToken, accessTokenSecret } }),
    onSuccess: async (res) => {
      if (res.ok) {
        toast.success(`Connected as @${res.xUsername}`);
        completedRef.current.add(6);
        completedRef.current.add(7);
        setStep(8);
        await saveProgress.mutateAsync(8);
        qc.invalidateQueries({ queryKey: ["x-connection-status"] });
        qc.invalidateQueries({ queryKey: ["x-accounts"] });
        onConnected?.();
      } else {
        toast.error(res.message);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const current = STEPS[step - 1];
  const callbackUrl = "https://localhost";
  const copy = (v: string, label: string) => {
    void navigator.clipboard?.writeText(v);
    toast.success(`${label} copied`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-xs text-text-muted">
              Step {step} / 8
            </span>
            <span>{current.title}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex gap-1.5 my-2">
          {STEPS.map((s) => (
            <div
              key={s.id}
              className={
                "h-1 flex-1 rounded " +
                (s.id < step
                  ? "bg-success"
                  : s.id === step
                    ? "bg-accent"
                    : "bg-border")
              }
            />
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-4">
          <div className="space-y-3 text-sm">
            {step === 1 && <Step1 />}
            {step === 2 && <Step2 tier={tier} setTier={setTier} />}
            {step === 3 && <Step3 />}
            {step === 4 && <Step4 callbackUrl={callbackUrl} onCopy={copy} />}
            {step === 5 && <Step5 />}
            {step === 6 && (
              <Step6
                consumerKey={consumerKey}
                setConsumerKey={setConsumerKey}
                consumerSecret={consumerSecret}
                setConsumerSecret={setConsumerSecret}
                accessToken={accessToken}
                setAccessToken={setAccessToken}
                accessTokenSecret={accessTokenSecret}
                setAccessTokenSecret={setAccessTokenSecret}
                onSubmit={() => connectMut.mutate()}
                pending={connectMut.isPending}
                canSubmit={
                  !!consumerKey && !!consumerSecret && !!accessToken && !!accessTokenSecret
                }
              />
            )}
            {step === 7 && <Step7 username={status?.x_username ?? null} />}
            {step === 8 && <Step8 onClose={() => onOpenChange(false)} />}
          </div>
          <IllustrationFrame variant={current.variant} />
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={saveAndExit}>
            Save & exit
          </Button>
          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" size="sm" onClick={goBack}>
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
              </Button>
            )}
            {step < 8 && step !== 6 && (
              <Button size="sm" onClick={goNext}>
                Next <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            )}
            {step === 8 && (
              <Button size="sm" onClick={() => onOpenChange(false)}>
                <Check className="w-3.5 h-3.5 mr-1" /> Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------- Step bodies -------- */

function Linkout({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent inline-flex items-center gap-1"
    >
      {children} <ExternalLink className="w-3 h-3" />
    </a>
  );
}

function Step1() {
  return (
    <div className="space-y-3">
      <p>
        UroFeed needs an X (Twitter) developer account in your name so ingestion
        runs against <b>your</b> quota — not the platform's.
      </p>
      <p>
        If you already have one, sign in to the{" "}
        <Linkout href="https://developer.x.com/en/portal/dashboard">Developer Portal</Linkout>
        {" "}and continue.
      </p>
      <p>
        If not, apply for the <b>Free</b> tier — it's instant and enough to test
        the connection. Click <b>Sign up free</b> and answer "Personal use".
      </p>
    </div>
  );
}

function Step2({ tier, setTier }: { tier: string; setTier: (t: Tier) => void }) {
  const opts: { id: Tier; name: string; price: string; reads: string; hint: string }[] = [
    { id: "free", name: "Free", price: "$0", reads: "~1 search / 15min", hint: "Fine for trying UroFeed" },
    { id: "basic", name: "Basic", price: "$200/mo", reads: "10K reads / month", hint: "Light personal use" },
    { id: "pro", name: "Pro", price: "$5K/mo", reads: "1M reads / month", hint: "Power users, multi-source" },
  ];
  return (
    <div className="space-y-2">
      <p className="text-text-muted text-xs">
        Tell us which tier you'll use so we can show your remaining quota
        accurately. You can change this anytime.
      </p>
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setTier(o.id)}
          className={
            "w-full text-left rounded-[3px] border p-3 transition " +
            (tier === o.id
              ? "border-accent bg-accent/5"
              : "border-border hover:border-text-muted")
          }
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold">{o.name}</span>
            <span className="text-accent text-sm">{o.price}</span>
          </div>
          <div className="text-xs text-text-muted mt-1">
            {o.reads} · {o.hint}
          </div>
        </button>
      ))}
    </div>
  );
}

function Step3() {
  return (
    <div className="space-y-3">
      <p>
        In the Developer Portal sidebar, open <b>Projects & Apps</b>. Create a
        new <b>Project</b>, then add an <b>App</b> inside it (X requires both).
      </p>
      <p>
        Name the app something memorable like <code className="bg-panel-elevated px-1 rounded">UroFeed-personal</code>.
      </p>
    </div>
  );
}

function Step4({
  callbackUrl,
  onCopy,
}: {
  callbackUrl: string;
  onCopy: (v: string, label: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p>
        Open your app → scroll to <b>User authentication settings</b> → click{" "}
        <b>Set up</b>. Configure exactly:
      </p>
      <ul className="list-disc pl-5 text-xs space-y-1">
        <li>App permissions: <b>Read and write</b></li>
        <li>Type of App: <b>Web App, Automated App or Bot</b></li>
        <li>Callback URI / Redirect URL:</li>
      </ul>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-panel-elevated border border-border rounded px-2 py-1 text-xs font-mono">
          {callbackUrl}
        </code>
        <Button size="sm" variant="outline" onClick={() => onCopy(callbackUrl, "Callback URL")}>
          <Copy className="w-3 h-3" />
        </Button>
      </div>
      <div className="flex gap-2 items-start border border-warning/40 bg-warning/10 rounded p-2">
        <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
        <p className="text-xs">
          <b>Save before continuing.</b> Tokens generated before saving stay
          read-only forever — this is the #1 reason users get stuck.
        </p>
      </div>
    </div>
  );
}

function Step5() {
  return (
    <div className="space-y-3">
      <p>
        Go to the <b>Keys and tokens</b> tab in your app:
      </p>
      <ol className="list-decimal pl-5 text-xs space-y-1">
        <li>Under <b>Consumer Keys</b>, click <b>Regenerate</b>. Copy both values immediately.</li>
        <li>Under <b>Authentication Tokens</b> → <b>Access Token and Secret</b>, click <b>Generate</b>. Copy both.</li>
      </ol>
      <p className="text-xs text-text-muted">
        Confirm the access token shows <b>Read and Write</b> beneath it. If it
        says <b>Read only</b>, return to Step 4.
      </p>
    </div>
  );
}

function Step6(props: {
  consumerKey: string;
  setConsumerKey: (v: string) => void;
  consumerSecret: string;
  setConsumerSecret: (v: string) => void;
  accessToken: string;
  setAccessToken: (v: string) => void;
  accessTokenSecret: string;
  setAccessTokenSecret: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
  canSubmit: boolean;
}) {
  const F = (label: string, val: string, set: (v: string) => void, secret = false) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type={secret ? "password" : "text"}
        value={val}
        onChange={(e) => set(e.target.value)}
        className="font-mono text-xs"
      />
    </div>
  );
  return (
    <div className="space-y-3">
      {F("Consumer Key", props.consumerKey, props.setConsumerKey)}
      {F("Consumer Secret", props.consumerSecret, props.setConsumerSecret, true)}
      {F("Access Token", props.accessToken, props.setAccessToken)}
      {F("Access Token Secret", props.accessTokenSecret, props.setAccessTokenSecret, true)}
      <Button
        className="w-full"
        onClick={props.onSubmit}
        disabled={!props.canSubmit || props.pending}
      >
        {props.pending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying with X…
          </>
        ) : (
          "Connect & verify"
        )}
      </Button>
    </div>
  );
}

function Step7({ username }: { username: string | null }) {
  return (
    <div className="space-y-3">
      <p>
        Connection verified
        {username ? (
          <>
            {" "}
            as <b>@{username}</b>
          </>
        ) : null}
        . X confirmed your tokens have <b>Read + Write</b> scope.
      </p>
      <p className="text-text-muted text-xs">
        From now on, ingestion of your subscribed sources uses your quota — not
        the platform's. You'll see usage in <b>Settings → X</b>.
      </p>
    </div>
  );
}

function Step8({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-3">
      <p className="font-semibold">You're all set.</p>
      <ul className="list-disc pl-5 text-xs space-y-1 text-text-muted">
        <li>Subscribed sources will be ingested with your tokens.</li>
        <li>You can switch tier or disconnect anytime in Settings → X.</li>
        <li>Posting from UroFeed (replies, quotes) also goes through your account.</li>
      </ul>
      <Button variant="outline" size="sm" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}