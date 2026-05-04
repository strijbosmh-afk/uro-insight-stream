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
import { recordAudit } from "@/services/auditService";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

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
  const [displayNameTouched, setDisplayNameTouched] = React.useState(false);
  const [lookupAvatar, setLookupAvatar] = React.useState<string | null>(null);
  const [lookupVerified, setLookupVerified] = React.useState(false);
  const [lookingUp, setLookingUp] = React.useState(false);
  const [lookupError, setLookupError] = React.useState<string | null>(null);

  const reset = () => {
    setHandle("");
    setDisplayName("");
    setRole(DEFAULT_ROLE);
    setBulk("");
    setTab("single");
    setDisplayNameTouched(false);
    setLookupAvatar(null);
    setLookupVerified(false);
    setLookingUp(false);
    setLookupError(null);
  };

  // Debounced auto-lookup of display name from handle
  React.useEffect(() => {
    const h = normalizeHandle(handle);
    if (!isValidHandle(handle)) {
      setLookingUp(false);
      setLookupError(null);
      return;
    }
    let cancelled = false;
    setLookingUp(true);
    setLookupError(null);
    const t = setTimeout(async () => {
      try {
        const sessionRes = await supabase.auth.getSession();
        const accessToken = sessionRes.data.session?.access_token;
        const res = await fetch("/api/lookup-handle", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ handles: [h] }),
        });
        if (cancelled) return;
        if (!res.ok) {
          setLookupError("Could not look up handle");
          return;
        }
        const body = (await res.json()) as {
          results: Array<{
            handle: string;
            found: boolean;
            source?: { display_name: string; avatar_url: string; verified: boolean };
          }>;
        };
        const r = body.results[0];
        if (!r?.found || !r.source) {
          setLookupError("Handle not found on X");
          return;
        }
        if (!displayNameTouched) setDisplayName(r.source.display_name);
        setLookupAvatar(r.source.avatar_url || null);
        setLookupVerified(r.source.verified);
      } catch {
        if (!cancelled) setLookupError("Lookup failed");
      } finally {
        if (!cancelled) setLookingUp(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
      setLookingUp(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

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
      for (const s of added) {
        void recordAudit({
          action: "source.create",
          target_type: "source",
          target_id: s.id,
          summary: `Added @${s.handle}`,
          after: { handle: s.handle, role: s.role },
        });
      }
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
        avatarUrl: lookupAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${h}`,
        role,
        specialty: [],
        verified: lookupVerified,
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
              <div className="relative">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted font-mono text-[13px]">
                  @
                </span>
                <Input
                  value={handle}
                  onChange={(e) => {
                    // Strip any leading @ the user types/pastes
                    setHandle(e.target.value.replace(/^@+/, ""));
                  }}
                  placeholder="DrUroOnc"
                  className="font-mono pl-6"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {lookingUp ? (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-text-muted" />
                ) : null}
              </div>
              {lookupError ? (
                <span className="text-[11px] text-destructive">{lookupError}</span>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-text-muted">Display name</Label>
              <Input
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setDisplayNameTouched(true);
                }}
                placeholder={lookingUp ? "Looking up…" : "Dr. Alex Moreno"}
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