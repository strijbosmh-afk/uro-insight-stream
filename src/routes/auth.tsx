import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity, Loader2, Mail, KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — UroFeed" },
      { name: "description", content: "Sign in to access the UroFeed clinical congress dashboard." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!loading && user) {
      void navigate({ to: "/dashboard" });
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2 mb-8">
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

        <div className="border border-border rounded-[3px] bg-panel p-5">
          <Tabs defaultValue="password">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="password" className="text-[12px]">
                <KeyRound className="w-3 h-3 mr-1" /> Password
              </TabsTrigger>
              <TabsTrigger value="magic" className="text-[12px]">
                <Mail className="w-3 h-3 mr-1" /> Magic link
              </TabsTrigger>
              <TabsTrigger value="signup" className="text-[12px]">
                Sign up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="password" className="mt-4">
              <PasswordForm />
            </TabsContent>
            <TabsContent value="magic" className="mt-4">
              <MagicLinkForm />
            </TabsContent>
            <TabsContent value="signup" className="mt-4">
              <SignupNotice />
            </TabsContent>
          </Tabs>
        </div>

        <p className="text-center text-[11px] text-text-muted mt-4 font-mono">
          UroFeed is invite-only. Ask an admin for access.
        </p>
      </div>
    </div>
  );
}

function PasswordForm() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Signed in");
      void navigate({ to: "/dashboard" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[12px]">Email</Label>
        <Input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[12px]">Password</Label>
        <Input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Lock className="w-3.5 h-3.5 mr-1.5" />}
        Sign in
      </Button>
    </form>
  );
}

function MagicLinkForm() {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          shouldCreateUser: false,
        },
      });
      if (error) throw error;
      setSent(true);
      toast.success("Check your email", { description: "We sent a sign-in link." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send link";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="text-[13px] text-text-muted leading-relaxed">
        A sign-in link has been sent to <span className="text-text-primary font-mono">{email}</span>.
        Open it on this device to continue.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[12px]">Email</Label>
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Mail className="w-3.5 h-3.5 mr-1.5" />}
        Send magic link
      </Button>
    </form>
  );
}

function SignupNotice() {
  return (
    <div className="text-[12px] text-text-muted leading-relaxed space-y-2">
      <p>
        Public sign-up is <span className="text-text-primary">disabled</span>.
        UroFeed is invite-only.
      </p>
      <p>
        Ask an existing administrator to send you an invitation from{" "}
        <span className="font-mono text-text-primary">Settings → Team</span>.
      </p>
    </div>
  );
}