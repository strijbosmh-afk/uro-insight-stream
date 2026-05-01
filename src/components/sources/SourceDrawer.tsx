import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { feedService } from "@/services/feedService";
import { isValidHandle, normalizeHandle } from "@/lib/validation";
import type { Source, SourceList } from "@/types";

interface Props {
  source: Source | null;
  lists: SourceList[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLES: Source["role"][] = ["KOL", "institution", "journal", "society", "other"];

export function SourceDrawer({ source, lists, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = React.useState<Source | null>(source);
  const [specialtyText, setSpecialtyText] = React.useState("");

  React.useEffect(() => {
    setDraft(source);
    setSpecialtyText(source?.specialty.join(", ") ?? "");
  }, [source]);

  const update = useMutation({
    mutationFn: (patch: Partial<Source>) =>
      feedService.updateSource(source!.id, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["sources"] });
      const prev = qc.getQueryData<Source[]>(["sources"]);
      qc.setQueryData<Source[]>(["sources"], (old) =>
        (old ?? []).map((s) => (s.id === source!.id ? { ...s, ...patch } : s)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["sources"], ctx.prev);
      toast.error("Failed to save source");
    },
    onSuccess: () => toast.success("Source updated"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });

  const remove = useMutation({
    mutationFn: () => feedService.removeSource(source!.id),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["sources"] });
      const prev = qc.getQueryData<Source[]>(["sources"]);
      qc.setQueryData<Source[]>(["sources"], (old) =>
        (old ?? []).filter((s) => s.id !== source!.id),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["sources"], ctx.prev);
      toast.error("Failed to delete source");
    },
    onSuccess: () => {
      toast.success("Source removed");
      onOpenChange(false);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });

  if (!draft) return null;

  const handleValid = isValidHandle(draft.handle);

  const save = () => {
    if (!handleValid) {
      toast.error("Invalid handle. Use letters, digits, _ (max 15).");
      return;
    }
    update.mutate({
      handle: normalizeHandle(draft.handle),
      displayName: draft.displayName.trim(),
      role: draft.role,
      specialty: specialtyText.split(",").map((s) => s.trim()).filter(Boolean),
      verified: draft.verified,
      active: draft.active,
      listIds: draft.listIds ?? [],
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[420px] sm:max-w-[420px] bg-panel border-l border-border text-text-primary p-0"
      >
        <SheetHeader className="px-5 py-3 border-b border-border">
          <SheetTitle className="text-[12px] font-semibold uppercase tracking-[0.12em]">
            Edit source
          </SheetTitle>
          <SheetDescription className="font-mono text-[10px] text-text-muted">
            {source?.id}
          </SheetDescription>
        </SheetHeader>

        <div className="px-5 py-4 space-y-4 overflow-y-auto h-[calc(100%-104px)]">
          <div className="grid gap-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-text-muted">Handle</Label>
            <Input
              value={draft.handle}
              onChange={(e) => setDraft({ ...draft, handle: e.target.value })}
              className="font-mono"
              placeholder="DrUroOnc"
            />
            {!handleValid && (
              <span className="text-[10px] text-destructive">
                Letters, digits, underscore (1–15 chars)
              </span>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-text-muted">Display name</Label>
            <Input
              value={draft.displayName}
              onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-text-muted">Role</Label>
              <Select
                value={draft.role}
                onValueChange={(v) => setDraft({ ...draft, role: v as Source["role"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-text-muted">Verified</Label>
              <div className="flex items-center h-9">
                <Switch
                  checked={draft.verified}
                  onCheckedChange={(v) => setDraft({ ...draft, verified: v })}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-text-muted">Specialty (comma-separated)</Label>
            <Input
              value={specialtyText}
              onChange={(e) => setSpecialtyText(e.target.value)}
              placeholder="prostate, robotic"
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-text-muted">Lists</Label>
            <div className="space-y-1.5 border border-border rounded-sm p-2 bg-panel-elevated/40">
              {lists.length === 0 && (
                <span className="text-[11px] text-text-muted">No lists yet.</span>
              )}
              {lists.map((l) => {
                const checked = (draft.listIds ?? []).includes(l.id);
                return (
                  <label key={l.id} className="flex items-center gap-2 text-[12px] cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const cur = draft.listIds ?? [];
                        setDraft({
                          ...draft,
                          listIds: v ? [...cur, l.id] : cur.filter((x) => x !== l.id),
                        });
                      }}
                    />
                    <span>{l.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between border border-border rounded-sm px-3 py-2 bg-panel-elevated/40">
            <span className="text-[12px]">Active</span>
            <Switch
              checked={draft.active}
              onCheckedChange={(v) => setDraft({ ...draft, active: v })}
            />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-panel px-5 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={update.isPending}>
              Save
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}