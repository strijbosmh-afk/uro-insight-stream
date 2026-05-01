import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_PREFS,
  type SummaryPrefs,
  type SummaryTone,
} from "@/hooks/useSummaryPrefs";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefs: SummaryPrefs;
  onSave: (p: SummaryPrefs) => void;
  onReset: () => void;
}

const TOKENS = ["{{sessionTitle}}", "{{tweets}}", "{{specialty}}", "{{tone}}", "{{language}}", "{{maxBullets}}"] as const;

export function CustomizeSummaryDrawer({
  open,
  onOpenChange,
  prefs,
  onSave,
  onReset,
}: Props) {
  const [draft, setDraft] = React.useState<SummaryPrefs>(prefs);
  React.useEffect(() => {
    if (open) setDraft(prefs);
  }, [open, prefs]);

  const update = <K extends keyof SummaryPrefs>(k: K, v: SummaryPrefs[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[520px] sm:max-w-[520px] bg-panel border-l border-border overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-[13px] font-semibold uppercase tracking-[0.12em]">
            Customize summary
          </SheetTitle>
          <SheetDescription className="text-[12px] text-text-muted">
            Settings persist per-user. Variables you can use in templates:
            <span className="block mt-1 font-mono text-accent text-[11px]">
              {TOKENS.join("  ")}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          <div>
            <Label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
              System prompt
            </Label>
            <Textarea
              value={draft.systemPrompt}
              onChange={(e) => update("systemPrompt", e.target.value)}
              rows={4}
              className="mt-1 text-[12px] font-mono"
            />
          </div>

          <div>
            <Label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
              User template
            </Label>
            <Textarea
              value={draft.userTemplate}
              onChange={(e) => update("userTemplate", e.target.value)}
              rows={10}
              className="mt-1 text-[12px] font-mono"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Max bullets
              </Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={draft.maxBullets}
                onChange={(e) =>
                  update("maxBullets", Math.max(1, Math.min(10, Number(e.target.value) || 1)))
                }
                className="mt-1 h-8 text-[12px] font-mono"
              />
            </div>
            <div>
              <Label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Tone
              </Label>
              <Select
                value={draft.tone}
                onValueChange={(v) => update("tone", v as SummaryTone)}
              >
                <SelectTrigger className="mt-1 h-8 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="clinical">Clinical</SelectItem>
                  <SelectItem value="conversational">Conversational</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Language
              </Label>
              <Input
                value={draft.language}
                onChange={(e) => update("language", e.target.value)}
                className="mt-1 h-8 text-[12px]"
              />
            </div>
          </div>
        </div>

        <SheetFooter className="mt-6 flex-row justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(DEFAULT_PREFS);
              onReset();
              toast.success("Reset to defaults");
            }}
          >
            Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onSave(draft);
                onOpenChange(false);
                toast.success("Summary preferences saved");
              }}
            >
              Save
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default CustomizeSummaryDrawer;