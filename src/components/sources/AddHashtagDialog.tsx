import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { feedService } from "@/services/feedService";
import { isValidHashtag, normalizeHashtag } from "@/lib/validation";
import type { Congress, Hashtag } from "@/types";
import { recordAudit } from "@/services/auditService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  congresses: Congress[];
}

const NONE = "__none__";

export function AddHashtagDialog({ open, onOpenChange, congresses }: Props) {
  const qc = useQueryClient();
  const [tag, setTag] = React.useState("");
  const [congressId, setCongressId] = React.useState<string>(NONE);

  const reset = () => {
    setTag("");
    setCongressId(NONE);
  };

  const add = useMutation({
    mutationFn: (input: Omit<Hashtag, "id">) => feedService.addHashtag(input),
    onSuccess: (h) => {
      toast.success(`Added ${h.tag}`);
      qc.invalidateQueries({ queryKey: ["hashtags"] });
      void recordAudit({
        action: "hashtag.create",
        target_type: "hashtag",
        target_id: h.id,
        summary: `Added ${h.tag}`,
        after: { tag: h.tag, congressId: h.congressId },
      });
      reset();
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to add hashtag"),
  });

  const submit = () => {
    if (!isValidHashtag(tag)) {
      toast.error("Invalid hashtag.");
      return;
    }
    add.mutate({
      tag: "#" + normalizeHashtag(tag),
      congressId: congressId === NONE ? undefined : congressId,
      active: true,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="bg-panel border-border text-text-primary max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[12px] uppercase tracking-[0.12em]">
            Add hashtag
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-text-muted">Tag</Label>
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="#EAU26"
              className="font-mono"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-text-muted">
              Linked congress (optional)
            </Label>
            <Select value={congressId} onValueChange={setCongressId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {congresses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.shortCode} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={add.isPending}>
            {add.isPending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}