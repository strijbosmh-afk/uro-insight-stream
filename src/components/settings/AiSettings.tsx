import * as React from "react";
import {
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAiSettings,
  AI_MODELS,
  AI_TONES,
  AI_LANGUAGES,
  DEFAULT_PROMPT_TEMPLATE,
  type AiSettings as AiSettingsT,
} from "@/hooks/useAiSettings";
import { mockAiService, lovableGatewayService } from "@/services/aiService";
import { toast } from "sonner";

export function AiSettings() {
  const { settings, save, reset } = useAiSettings();
  const [draft, setDraft] = React.useState<AiSettingsT>(settings);
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  React.useEffect(() => setDraft(settings), [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const onTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const svc = draft.useLive ? lovableGatewayService : mockAiService;
      const r = await svc.ping(draft.model);
      setResult({ ok: true, text: r.text });
      toast.success("AI responded", { description: r.text.slice(0, 120) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setResult({ ok: false, text: msg });
      toast.error("AI test failed", { description: msg });
    } finally {
      setTesting(false);
    }
  };

  const update = <K extends keyof AiSettingsT>(k: K, v: AiSettingsT[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-accent" />
          <h1 className="text-lg font-semibold tracking-tight text-text-primary">
            AI Configuration
          </h1>
        </div>
        <p className="text-[13px] text-text-muted leading-relaxed">
          Workspace defaults for AI-generated summaries. Requests run through a
          server-side proxy — no API keys touch the browser.
        </p>
        <div className="mt-3 flex items-start gap-2 text-[12px] text-text-muted bg-panel-elevated/60 border border-border rounded-[3px] px-3 py-2">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-accent" />
          <span>
            Using <span className="font-mono">Lovable AI Gateway</span> · per-user
            keys can be added later.
          </span>
        </div>
      </header>

      {/* Backend toggle */}
      <section className="border border-border rounded-[3px] bg-panel p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-[13px] text-text-primary">Use live AI</Label>
            <p className="text-[12px] text-text-muted mt-0.5">
              When off, summaries come from local canned mock data — fast,
              deterministic, zero cost.
            </p>
          </div>
          <Switch
            checked={draft.useLive}
            onCheckedChange={(v) => update("useLive", v)}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-[13px] text-text-primary">Model</Label>
          <Select
            value={draft.model}
            onValueChange={(v) => update("model", v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[12px]">{m.value}</span>
                    {m.note && (
                      <span className="text-[10px] uppercase tracking-wider text-text-muted">
                        {m.note}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Output shape */}
      <section className="border border-border rounded-[3px] bg-panel p-4 space-y-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Output
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-text-primary">Tone</Label>
            <Select
              value={draft.tone}
              onValueChange={(v) =>
                update("tone", v as AiSettingsT["tone"])
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-text-primary">Language</Label>
            <Select
              value={draft.language}
              onValueChange={(v) => update("language", v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-text-primary">Max bullets</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={draft.maxBullets}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                update("maxBullets", Math.min(12, Math.max(1, Math.round(n))));
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-[12px] text-text-primary">
              Prompt template
            </Label>
            <button
              type="button"
              className="text-[10px] uppercase tracking-wider text-text-muted hover:text-accent transition-colors"
              onClick={() => update("promptTemplate", DEFAULT_PROMPT_TEMPLATE)}
            >
              Reset template
            </button>
          </div>
          <Textarea
            value={draft.promptTemplate}
            onChange={(e) => update("promptTemplate", e.target.value)}
            rows={10}
            className="font-mono text-[12px] leading-relaxed"
          />
          <p className="text-[11px] text-text-muted font-mono">
            Variables: {"{{sessionTitle}} {{specialty}} {{tweets}} {{tone}} {{language}} {{maxBullets}}"}
          </p>
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!dirty}
          onClick={() => {
            save(draft);
            toast.success("AI settings saved");
          }}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!dirty}
          onClick={() => setDraft(settings)}
        >
          Discard
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            reset();
            toast.success("Reset to defaults");
          }}
          className="ml-auto"
        >
          Reset defaults
        </Button>
      </div>

      {/* Test */}
      <section className="border border-border rounded-[3px] bg-panel p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-[13px] text-text-primary">Test</Label>
            <p className="text-[12px] text-text-muted mt-0.5">
              Sends a tiny "say hello" completion through the Gateway using the
              current draft model.
            </p>
          </div>
          <Button size="sm" onClick={onTest} disabled={testing}>
            {testing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                Testing…
              </>
            ) : (
              "Run test"
            )}
          </Button>
        </div>
        {result && (
          <div
            className={`text-[12px] font-mono p-2 rounded-[3px] border flex items-start gap-2 ${
              result.ok
                ? "border-accent/40 bg-accent/5 text-text-primary"
                : "border-destructive/50 bg-destructive/5 text-destructive"
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-accent shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            )}
            <span className="break-words">{result.text}</span>
          </div>
        )}
      </section>
    </div>
  );
}

export default AiSettings;