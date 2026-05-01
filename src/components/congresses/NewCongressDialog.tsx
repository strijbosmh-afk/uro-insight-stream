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
import type { Congress, SourceList } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: SourceList[];
}

export function NewCongressDialog({ open, onOpenChange, lists }: Props) {
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [shortCode, setShortCode] = React.useState("");
  const [city, setCity] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [hashtags, setHashtags] = React.useState("");
  const [status, setStatus] = React.useState<Congress["status"]>("upcoming");
  const [listIds, setListIds] = React.useState<string[]>([]);

  const reset = () => {
    setName("");
    setShortCode("");
    setCity("");
    setCountry("");
    setStartDate("");
    setEndDate("");
    setHashtags("");
    setStatus("upcoming");
    setListIds([]);
  };

  const create = useMutation({
    mutationFn: (input: Omit<Congress, "id">) => feedService.addCongress(input),
    onSuccess: (c) => {
      toast.success(`${c.shortCode} created`);
      qc.invalidateQueries({ queryKey: ["congresses"] });
      reset();
      onOpenChange(false);
    },
    onError: () => toast.error("Failed to create congress"),
  });

  const submit = () => {
    if (!name.trim() || !shortCode.trim()) {
      toast.error("Name and short code are required");
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Both dates are required");
      return;
    }
    const tags = hashtags
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    for (const t of tags) {
      if (!isValidHashtag(t)) {
        toast.error(`Invalid hashtag: ${t}`);
        return;
      }
    }
    create.mutate({
      name: name.trim(),
      shortCode: shortCode.trim().toUpperCase(),
      city: city.trim(),
      country: country.trim(),
      startDate,
      endDate,
      status,
      primaryHashtags: tags.map((t) => "#" + normalizeHashtag(t)),
      sourceListIds: listIds.length ? listIds : undefined,
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
      <DialogContent className="bg-panel border-border text-text-primary max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[12px] uppercase tracking-[0.12em]">
            New congress
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" full>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="EAU27 — Annual Meeting" />
          </Field>
          <Field label="Short code">
            <Input value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder="EAU27" className="font-mono uppercase" />
          </Field>
          <Field label="Status">
            <Select value={status} onValueChange={(v) => setStatus(v as Congress["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Madrid" />
          </Field>
          <Field label="Country">
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Spain" />
          </Field>
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="Primary hashtags" full>
            <Input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#EAU27, #UroSoMe"
              className="font-mono"
            />
          </Field>
          <Field label="Linked source lists" full>
            <div className="flex flex-wrap gap-1.5">
              {lists.length === 0 && (
                <span className="text-[11px] text-text-muted">No lists yet.</span>
              )}
              {lists.map((l) => {
                const on = listIds.includes(l.id);
                return (
                  <button
                    type="button"
                    key={l.id}
                    onClick={() =>
                      setListIds((cur) =>
                        cur.includes(l.id) ? cur.filter((x) => x !== l.id) : [...cur, l.id],
                      )
                    }
                    className={
                      "h-6 px-2 text-[11px] font-mono border rounded-[2px] " +
                      (on
                        ? "border-accent text-accent bg-accent/10"
                        : "border-border text-text-muted hover:text-text-primary")
                    }
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={"grid gap-1.5 " + (full ? "col-span-2" : "")}>
      <Label className="text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </Label>
      {children}
    </div>
  );
}

export default NewCongressDialog;