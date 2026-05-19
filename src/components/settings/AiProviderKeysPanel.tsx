import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getAnthropicKeyStatus,
  setAnthropicKey,
  clearAnthropicKey,
  type AnthropicKeyStatus,
} from "@/serverFns/admin-secrets";

const SUPER_ADMIN_EMAIL = "strijbosmh@gmail.com";

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Workspace-wide LLM provider keys. Rendered only for the super-admin.
 * Raw key values never leave the server — the UI only sees prefix +
 * last-four for verification.
 */
export function AiProviderKeysPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isSuper = user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  const getStatus = useServerFn(getAnthropicKeyStatus);
  const setKey = useServerFn(setAnthropicKey);
  const clearKey = useServerFn(clearAnthropicKey);

  const { data: status, isLoading } = useQuery<AnthropicKeyStatus>({
    queryKey: ["admin-anthropic-key-status"],
    queryFn: () => getStatus(),
    enabled: isSuper,
    staleTime: 30_000,
  });

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [reveal, setReveal] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);

  const saveMut = useMutation({
    mutationFn: (key: string) => setKey({ data: { key } }),
    onSuccess: () => {
      toast.success("Anthropic key saved and validated");
      setEditing(false);
      setDraft("");
      setReveal(false);
      qc.invalidateQueries({ queryKey: ["admin-anthropic-key-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearMut = useMutation({
    mutationFn: () => clearKey(),
    onSuccess: () => {
      toast.success("Anthropic key cleared. Falling back to env var if set.");
      setConfirmClear(false);
      qc.invalidateQueries({ queryKey: ["admin-anthropic-key-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Hide the whole panel for non-super-admins — keeps the AI Settings page
  // identical for regular users.
  if (!isSuper) return null;

  return (
    <section className="border border-accent/30 rounded-[3px] bg-panel p-4 space-y-4">
      <header className="flex items-start gap-2">
        <KeyRound aria-hidden="true" className="w-4 h-4 mt-0.5 text-accent shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            API provider keys · super admin
          </h2>
          <p className="text-[12px] text-text-muted mt-1">
            Workspace-wide credentials used by server-side LLM calls (congress
            lookup, suggestions, summaries). Stored in Supabase with strict
            RLS — the raw value never leaves the server.
          </p>
        </div>
      </header>

      {/* Anthropic */}
      <div className="border border-border rounded-[3px] bg-panel-elevated/30 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-medium text-text-primary">
              Anthropic API key
            </span>
            {isLoading ? (
              <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin text-text-muted" />
            ) : status?.configured ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-success">
                <CheckCircle2 aria-hidden="true" className="w-3 h-3" />
                configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-warning">
                <AlertCircle aria-hidden="true" className="w-3 h-3" />
                not set
              </span>
            )}
          </div>
          {status?.configured && !editing && (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => setEditing(true)}
              >
                Replace
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
                onClick={() => setConfirmClear(true)}
                disabled={clearMut.isPending}
              >
                <Trash2 aria-hidden="true" className="w-3 h-3 mr-1" />
                Clear
              </Button>
            </div>
          )}
          {!status?.configured && !editing && (
            <Button
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setEditing(true)}
            >
              Set key
            </Button>
          )}
        </div>

        {status?.configured && !editing && (
          <div className="space-y-1 text-[12px]">
            <div className="font-mono text-text-primary">
              {status.prefix}
              <span className="text-text-muted">…………</span>
              {status.last_four}
            </div>
            <div className="text-[11px] font-mono text-text-muted">
              Updated {relTime(status.updated_at)}
              {status.updated_by_email ? ` · by ${status.updated_by_email}` : ""}
            </div>
          </div>
        )}

        {editing && (
          <div className="space-y-2">
            <Label
              htmlFor="anthropic-key-input"
              className="text-[12px] text-text-primary"
            >
              Paste a key starting with{" "}
              <span className="font-mono">sk-ant-</span>
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="anthropic-key-input"
                  type={reveal ? "text" : "password"}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="sk-ant-..."
                  className="pr-9 font-mono text-[12px]"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  aria-label={reveal ? "Hide key" : "Show key"}
                  title={reveal ? "Hide" : "Show"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-1 rounded-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  {reveal ? (
                    <EyeOff aria-hidden="true" className="w-3.5 h-3.5" />
                  ) : (
                    <Eye aria-hidden="true" className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              <Button
                size="sm"
                className="h-9 px-3"
                onClick={() => saveMut.mutate(draft.trim())}
                disabled={saveMut.isPending || draft.trim().length < 8}
              >
                {saveMut.isPending ? (
                  <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Save aria-hidden="true" className="w-3.5 h-3.5 mr-1.5" />
                )}
                Validate &amp; save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 px-3"
                onClick={() => {
                  setEditing(false);
                  setDraft("");
                  setReveal(false);
                }}
                disabled={saveMut.isPending}
              >
                Cancel
              </Button>
            </div>
            <p className="text-[11px] text-text-muted">
              We make a tiny test call to Anthropic before storing — an
              invalid key is rejected here, not at the next lookup.
            </p>
          </div>
        )}
      </div>

      <p className="text-[11px] font-mono text-text-muted">
        Resolution order: <span className="text-text-primary">app_secrets</span>{" "}
        →{" "}
        <span className="text-text-primary">ANTHROPIC_API_KEY</span> env var.
        Clearing the key falls back to the env var.
      </p>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the Anthropic API key?</AlertDialogTitle>
            <AlertDialogDescription>
              Server-side LLM calls (congress lookup, suggestions) will fall
              back to the <span className="font-mono">ANTHROPIC_API_KEY</span>{" "}
              environment variable if one is set, or fail with{" "}
              <span className="font-mono">anthropic_not_configured</span>{" "}
              otherwise.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearMut.mutate()}
              disabled={clearMut.isPending}
            >
              {clearMut.isPending ? "Clearing…" : "Clear key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default AiProviderKeysPanel;
