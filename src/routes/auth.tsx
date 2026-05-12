import * as React from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Activity,
  Loader2,
  Mail,
  KeyRound,
  Lock,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  UserPlus,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Panel } from "@/components/shell/Panel";
import { AuthStatusBar } from "@/components/shell/AuthStatusBar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";

async function signInWithPasswordResilient(email: string, password: string) {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sign-in failed";
    if (msg !== "Failed to fetch" && !msg.toLowerCase().includes("networkerror")) {
      throw err;
    }
  }

  const res = await fetch("/api/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
    session?: { access_token: string; refresh_token: string };
  };
  if (!res.ok || !payload.session) {
    throw new Error(payload.error ?? "Sign-in failed");
  }
  const { error } = await supabase.auth.setSession({
    access_token: payload.session.access_token,
    refresh_token: payload.session.refresh_token,
  });
  if (error) throw error;
}

interface AuthSearch {
  redirect?: string;
  invite?: string;
  email?: string;
}

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — UroFeed" },
      {
        name: "description",
        content:
          "Sign in to access the UroFeed clinical congress dashboard.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): AuthSearch => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
    invite: typeof s.invite === "string" ? s.invite : undefined,
    email: typeof s.email === "string" ? s.email : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { redirect, invite, email: emailFromUrl } = useSearch({ from: "/auth" });
  const [busyState, setBusyState] = React.useState<
    "ready" | "signing-in" | "sending-link" | "completing-invite" | "resetting" | "requesting-access"
  >("ready");
  const [showAccessRequest, setShowAccessRequest] = React.useState(false);

  // Already signed in? Honour ?redirect=, otherwise dashboard.
  React.useEffect(() => {
    if (loading || !user) return;
    if (invite) return; // let the invite flow finish before redirecting
    if (redirect && redirect.startsWith("/")) {
      window.location.replace(redirect);
    } else {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [user, loading, navigate, redirect, invite]);

  const isInvite = Boolean(invite);

  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-text-primary overflow-hidden">
      <main className="flex-1 min-h-0 flex items-center justify-center p-4">
        <div className="w-full max-w-[440px]">
          {/* Brand */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-7 h-7 rounded-[3px] bg-accent/10 border border-accent/40 flex items-center justify-center">
              <Activity className="w-4 h-4 text-accent" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-base font-semibold tracking-tight text-text-primary">
                UroFeed
              </span>
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-muted mt-0.5">
                clinical · v0.1
              </span>
            </div>
          </div>

          <Panel
            title={
              isInvite
                ? "Complete your invite"
                : showAccessRequest
                  ? "Request access"
                  : "Sign in"
            }
            actions={
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted px-2">
                {isInvite
                  ? "view · invite"
                  : showAccessRequest
                    ? "view · request"
                    : "view · auth"}
              </span>
            }
            bodyClassName="p-5"
          >
            {isInvite ? (
              <InviteForm
                token={invite!}
                emailHint={emailFromUrl}
                onBusy={(b) =>
                  setBusyState(b ? "completing-invite" : "ready")
                }
              />
            ) : showAccessRequest ? (
              <AccessRequestForm
                onBack={() => setShowAccessRequest(false)}
                onBusy={(b) =>
                  setBusyState(b ? "requesting-access" : "ready")
                }
              />
            ) : (
              <SignInTabs
                redirect={redirect}
                onBusy={(s) => setBusyState(s)}
              />
            )}
          </Panel>

          {isInvite ? (
            <p className="text-center text-[11px] text-text-muted mt-4 font-mono">
              Setting your password completes the invitation.
            </p>
          ) : showAccessRequest ? (
            <p className="text-center text-[11px] text-text-muted mt-4 font-mono">
              An admin will review your request and reach out by email.
            </p>
          ) : (
            <p className="text-center text-[11px] text-text-muted mt-4 font-mono">
              UroFeed is invite-only ·{" "}
              <button
                type="button"
                onClick={() => setShowAccessRequest(true)}
                className="text-accent hover:underline underline-offset-2 transition-colors"
              >
                ask an admin for access
              </button>
            </p>
          )}
        </div>
      </main>
      <AuthStatusBar state={busyState} />
    </div>
  );
}

/* ---------- Sign-in (tabs: password · magic link) ---------- */

function SignInTabs({
  redirect,
  onBusy,
}: {
  redirect?: string;
  onBusy: (
    s: "ready" | "signing-in" | "sending-link" | "resetting",
  ) => void;
}) {
  const [tab, setTab] = React.useState<"password" | "magic">("password");
  const [showReset, setShowReset] = React.useState(false);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "password" | "magic")}>
      <TabsList className="w-full grid grid-cols-2 bg-panel-elevated">
        <TabsTrigger value="password" className="text-[12px]">
          <KeyRound className="w-3 h-3 mr-1.5" /> Sign in
        </TabsTrigger>
        <TabsTrigger value="magic" className="text-[12px]">
          <Mail className="w-3 h-3 mr-1.5" /> Magic link
        </TabsTrigger>
      </TabsList>

      <TabsContent value="password" className="mt-4">
        {showReset ? (
          <ForgotPasswordForm
            onBack={() => setShowReset(false)}
            onBusy={(b) => onBusy(b ? "resetting" : "ready")}
          />
        ) : (
          <PasswordForm
            redirect={redirect}
            onBusy={(b) => onBusy(b ? "signing-in" : "ready")}
            onForgot={() => setShowReset(true)}
          />
        )}
      </TabsContent>

      <TabsContent value="magic" className="mt-4">
        <MagicLinkForm
          redirect={redirect}
          onBusy={(b) => onBusy(b ? "sending-link" : "ready")}
        />
      </TabsContent>
    </Tabs>
  );
}

/* ---------- Password form ---------- */

function PasswordForm({
  redirect,
  onBusy,
  onForgot,
}: {
  redirect?: string;
  onBusy: (b: boolean) => void;
  onForgot: () => void;
}) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    onBusy(true);
    try {
      await signInWithPasswordResilient(email, password);
      toast.success("Signed in");
      if (redirect && redirect.startsWith("/")) {
        window.location.replace(redirect);
      } else {
        void navigate({ to: "/dashboard", replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      const friendly =
        msg === "Failed to fetch" || msg.toLowerCase().includes("networkerror")
          ? "Can't reach the auth server. A browser extension (uBlock, Brave Shields, AdGuard) or your network is likely blocking *.supabase.co. Try an incognito window or allowlist the domain."
          : msg;
      toast.error(friendly);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-text-muted">
          Email
        </Label>
        <Input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-text-muted">
          Password
        </Label>
        <Input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="font-mono"
        />
      </div>
      <Button type="submit" className="w-full h-9" disabled={busy}>
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
        ) : (
          <Lock className="w-3.5 h-3.5 mr-1.5" />
        )}
        Sign in
      </Button>
      <div className="text-right">
        <button
          type="button"
          onClick={onForgot}
          className="text-[11px] font-mono text-text-muted hover:text-accent transition-colors"
        >
          forgot password?
        </button>
      </div>
    </form>
  );
}

/* ---------- Magic link form ---------- */

function MagicLinkForm({
  redirect,
  onBusy,
}: {
  redirect?: string;
  onBusy: (b: boolean) => void;
}) {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    onBusy(true);
    try {
      const target =
        redirect && redirect.startsWith("/")
          ? `${window.location.origin}${redirect}`
          : `${window.location.origin}/dashboard`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: target, shouldCreateUser: false },
      });
      if (error) throw error;
      setSent(true);
      toast.success("Check your email", {
        description: "We sent a sign-in link.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send link";
      const friendly =
        msg === "Failed to fetch" || msg.toLowerCase().includes("networkerror")
          ? "Can't reach the auth server. A browser extension or your network is likely blocking *.supabase.co. Try an incognito window or allowlist the domain."
          : msg;
      toast.error(friendly);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="flex items-start gap-2 text-[12px] text-text-muted leading-relaxed">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
        <div>
          A sign-in link was sent to{" "}
          <span className="text-text-primary font-mono">{email}</span>. Open it
          on this device to continue.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-text-muted">
          Email
        </Label>
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="font-mono"
        />
      </div>
      <Button type="submit" className="w-full h-9" disabled={busy}>
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
        ) : (
          <Mail className="w-3.5 h-3.5 mr-1.5" />
        )}
        Send magic link
      </Button>
    </form>
  );
}

/* ---------- Forgot password (inline) ---------- */

function ForgotPasswordForm({
  onBack,
  onBusy,
}: {
  onBack: () => void;
  onBusy: (b: boolean) => void;
}) {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    onBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send reset";
      toast.error(msg);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[11px] font-mono text-text-muted hover:text-accent"
      >
        <ArrowLeft className="w-3 h-3" /> back to sign in
      </button>

      {sent ? (
        <div className="flex items-start gap-2 text-[12px] text-text-muted leading-relaxed">
          <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
          <div>
            If an account exists for{" "}
            <span className="text-text-primary font-mono">{email}</span>, a
            reset link is on its way.
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-[12px] text-text-muted leading-relaxed">
            Enter your email and we'll send you a link to set a new password.
          </p>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-text-muted">
              Email
            </Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="font-mono"
            />
          </div>
          <Button type="submit" className="w-full h-9" disabled={busy}>
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <Mail className="w-3.5 h-3.5 mr-1.5" />
            )}
            Send reset link
          </Button>
        </form>
      )}
    </div>
  );
}

/* ---------- Invite completion ---------- */

function InviteForm({
  token,
  emailHint,
  onBusy,
}: {
  token: string;
  emailHint?: string;
  onBusy: (b: boolean) => void;
}) {
  const [email, setEmail] = React.useState(emailHint ?? "");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    onBusy(true);
    try {
      // Invite tokens are issued via generateLink(type:'recovery'); verifyOtp
      // exchanges the hashed_token + email for a real session.
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email,
        token_hash: token,
        type: "recovery",
      });
      if (verifyErr) throw verifyErr;
      // Now we have a session — set the chosen password.
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;
      toast.success("Welcome — invite accepted");
      void navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Invite could not be verified";
      toast.error(msg);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-start gap-2 text-[12px] text-text-muted leading-relaxed border border-accent/30 bg-accent/5 rounded-[3px] p-2.5">
        <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <div>
          You've been invited to UroFeed. Set a password to activate your
          account.
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-text-muted">
          Email
        </Label>
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="font-mono"
          readOnly={Boolean(emailHint)}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-text-muted">
          New password
        </Label>
        <Input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-text-muted">
          Confirm password
        </Label>
        <Input
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="font-mono"
        />
      </div>
      <Button type="submit" className="w-full h-9" disabled={busy}>
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
        ) : (
          <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
        )}
        Accept invite & sign in
      </Button>
    </form>
  );
}

/* ---------- Access request (ask an admin for access) ---------- */

function AccessRequestForm({
  onBack,
  onBusy,
}: {
  onBack: () => void;
  onBusy: (b: boolean) => void;
}) {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [cooldownUntil, setCooldownUntil] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!cooldownUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooldownRemaining =
    cooldownUntil && cooldownUntil > now
      ? Math.ceil((cooldownUntil - now) / 1000)
      : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownRemaining > 0) return;
    setBusy(true);
    onBusy(true);
    try {
      const res = await fetch("/api/public/access-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim() || null,
          reason: reason.trim() || null,
        }),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const retry = Number(data?.retry_after_seconds) || 3600;
        setCooldownUntil(Date.now() + retry * 1000);
        const mins = Math.max(1, Math.ceil(retry / 60));
        toast.error("Too many requests", {
          description: `Please try again in about ${mins} minute${mins === 1 ? "" : "s"}.`,
        });
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Couldn't send request");
      }
      setSent(true);
      toast.success("Request sent", {
        description: "An admin will review it shortly.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't send request";
      toast.error(msg);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 text-[12px] text-text-muted leading-relaxed border border-success/30 bg-success/5 rounded-[3px] p-2.5">
          <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
          <div>
            Your request has been sent. An admin will reach out at{" "}
            <span className="text-text-primary font-mono">{email}</span> once
            it's reviewed.
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full h-9"
          onClick={onBack}
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[11px] font-mono text-text-muted hover:text-accent"
      >
        <ArrowLeft className="w-3 h-3" /> back to sign in
      </button>

      <div className="flex items-start gap-2 text-[12px] text-text-muted leading-relaxed border border-accent/30 bg-accent/5 rounded-[3px] p-2.5">
        <UserPlus className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <div>
          UroFeed is invite-only. Tell us who you are and an admin will get in
          touch.
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-text-muted">
          Email
        </Label>
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="font-mono"
          autoComplete="email"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-text-muted">
          Name <span className="text-text-muted/60 normal-case">(optional)</span>
        </Label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="font-mono"
          autoComplete="name"
          placeholder="Dr. Jane Smith"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] uppercase tracking-wider text-text-muted">
          Why do you need access?{" "}
          <span className="text-text-muted/60 normal-case">(optional)</span>
        </Label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="font-mono text-[12px] min-h-[72px]"
          placeholder="e.g. Urology resident attending EAU 2026"
          maxLength={500}
        />
      </div>

      <Button
        type="submit"
        className="w-full h-9"
        disabled={busy || !email || cooldownRemaining > 0}
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
        ) : (
          <Send className="w-3.5 h-3.5 mr-1.5" />
        )}
        {cooldownRemaining > 0
          ? `Try again in ${Math.ceil(cooldownRemaining / 60)}m`
          : "Send request"}
      </Button>
    </form>
  );
}