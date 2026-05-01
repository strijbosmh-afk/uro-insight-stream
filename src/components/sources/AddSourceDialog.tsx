import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { feedService } from "@/services/feedService";
import { isValidHandle, normalizeHandle } from "@/lib/validation";
import type { Source } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_ROLE: Source["role"] = "KOL";
const ROLES: Source["role"][] = ["KOL", "institution", "journal", "society", "other"];

export function AddSourceDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = React.useState<"single" | "bulk">("single");
  const [handle, setHandle] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [role, setRole] = React.useState<Source["role"]>(DEFAULT_ROLE);
  const [bulk, setBulk] = React.useState("");

  const reset = () => {
    setHandle("");
    setDisplayName("");
    setRole(DEFAULT_ROLE);
    setBulk("");
    setTab("single");
  };

  const add = useMutation({
    mutationFn: async (inputs: Array<Omit<Source, "id">>) => {
      const out: Source[] = [];
      for (const i of inputs) out.push(await feedService.addSource(i));
      return out;
    },
    onSuccess: (added) => {
      toast.success(
        added.length === 1
          ? `Added @${added[0].handle}`
          : `Added ${added.length} sources`,
      );
      qc.invalidateQueries({ queryKey: ["sources"] });
      reset();
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to add source(s)"),
  });

  const submitSingle = () => {
    if (!isValidHandle(handle)) {
      toast.error("Invalid handle.");
      return;
    }
    const h = normalizeHandle(handle);
    add.mutate([
      {
        handle: h,
        displayName: displayName.trim() || h,
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${h}`,
        role,
        specialty: [],
        verified: false,
        active: true,
        listIds: [],
      },
    ]);
  };

  const submitBulk = () => {
    const lines = bulk.split(/[\n,]/).map((l) => l.trim()).filter(Boolean);
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const l of lines) {
      if (isValidHandle(l)) valid.push(normalizeHandle(l));
      else invalid.push(l);
    }
    if (valid.length === 0) {
      toast.error("No valid handles found.");
      return;
    }
    if (invalid.length) toast.warning(`Skipped ${invalid.length} invalid handle(s)`);
    add.mutate(
      valid.map((h) => ({
        handle: h,
        displayName: h,
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${h}`,
        role: DEFAULT_ROLE,
        specialty: [],
        verified: false,
        active: true,
        listIds: [],
      })),
    );
  };

  const onCsvFile = async (file: File) => {
    const text = await file.text();
    setBulk(text);
    setTab("bulk");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="bg-panel border-border text-text-primary max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[12px] uppercase tracking-[0.12em]">
            Add source
          </DialogTitle>
          <DialogDescription className="text-[12px] text-text-muted">
            Add a single account or bulk-import many at once.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "single" | "bulk")}>
          <TabsList className="bg-panel-elevated">
            <TabsTrigger value="single">Single</TabsTrigger>
            <TabsTrigger value="bulk">Bulk / CSV</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-3 pt-3">
            <div className="grid gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-text-muted">Handle</Label>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@DrUroOnc"
                className="font-mono"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-text-muted">Display name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Dr. Alex Moreno"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-text-muted">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Source["role"])}>
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
          </TabsContent>

          <TabsContent value="bulk" className="space-y-3 pt-3">
            <div className="grid gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-text-muted">
                Paste handles (one per line)
              </Label>
              <Textarea
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                rows={6}
                className="font-mono text-[12px]"
                placeholder={"@DrUroOnc\n@RoboticPelvis\n@JUrology"}
              />
            </div>
            <div className="flex items-center gap-2 text-[11px] text-text-muted">
              <span>or upload CSV:</span>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onCsvFile(f);
                }}
                className="text-[11px] file:mr-2 file:py-0.5 file:px-2 file:rounded-sm file:border file:border-border file:bg-panel-elevated file:text-text-primary"
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={tab === "single" ? submitSingle : submitBulk}
            disabled={add.isPending}
          >
            {add.isPending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}