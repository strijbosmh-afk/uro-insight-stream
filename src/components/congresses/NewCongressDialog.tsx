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
import { recordAudit } from "@/services/auditService";
import { useCongressSuggest, type CongressSuggestion } from "@/hooks/useCongressSuggest";
import { CongressSuggestionCard } from "./CongressSuggestionCard";
import { Sparkles } from "lucide-react";

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
  const [aiFields, setAiFields] = React.useState<Record<string, { confidence: string }>>({});
  const [suggestionDismissed, setSuggestionDismissed] = React.useState(false);

  const { data: suggest, isFetching, debounced } = useCongressSuggest(name, !suggestionDismissed);
  const showLoading = isFetching && debounced.length >= 3;
  const matches = suggest?.matches ?? [];

  const markAi = (fields: string[], conf: Record<string, string>) => {
    const m: Record<string, { confidence: string }> = {};
    for (const f of fields) m[f] = { confidence: conf[f] ?? "medium" };
    setAiFields(m);
  };

  const applySuggestion = (s: CongressSuggestion) => {
    setName(s.name);
    setShortCode(s.short_code);
    setCity(s.city);
    setCountry(s.country);
    setStartDate(s.start_date);
    setEndDate(s.end_date);
    setHashtags((s.primary_hashtags ?? []).map((t) => "#" + t.replace(/^#/, "")).join(", "));
    setStatus(s.status);
    markAi(
      ["name", "shortCode", "city", "country", "startDate", "endDate", "hashtags"],
      {
        name: s.confidence,
        shortCode: s.confidence,
        city: s.field_confidence?.city ?? s.confidence,
        country: s.field_confidence?.city ?? s.confidence,
        startDate: s.field_confidence?.dates ?? s.confidence,
        endDate: s.field_confidence?.dates ?? s.confidence,
        hashtags: s.field_confidence?.hashtags ?? s.confidence,
      },
    );
    setSuggestionDismissed(true);
  };

  const clearAi = (key: string) =>
    setAiFields((prev) => {
      if (!prev[key]) return prev;
      const n = { ...prev };
      delete n[key];
      return n;
    });

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
    setAiFields({});
    setSuggestionDismissed(false);
  };

  const create = useMutation({
    mutationFn: (input: Omit<Congress, "id">) => feedService.addCongress(input),
    onSuccess: (c) => {
      toast.success(`${c.shortCode} created`);
      qc.invalidateQueries({ queryKey: ["congresses"] });
      void recordAudit({
        action: "congress.create",
        target_type: "congress",
        target_id: c.id,
        summary: `Created ${c.shortCode} — ${c.name}`,
        after: { shortCode: c.shortCode, status: c.status },
      });
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
        {(showLoading || matches.length > 0) && !suggestionDismissed && (
          <div className="mb-2">
            <CongressSuggestionCard
              matches={matches}
              loading={showLoading && matches.length === 0}
              fromCache={!!suggest?.from_cache}
              onApply={applySuggestion}
              onDismiss={() => setSuggestionDismissed(true)}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" full ai={aiFields.name}>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearAi("name");
                setSuggestionDismissed(false);
              }}
              placeholder="EAU27 — Annual Meeting"
              className={aiFields.name ? "border-l-2 border-l-cyan-400 italic" : ""}
            />
          </Field>
          <Field label="Short code" ai={aiFields.shortCode}>
            <Input
              value={shortCode}
              onChange={(e) => { setShortCode(e.target.value); clearAi("shortCode"); }}
              placeholder="EAU27"
              className={"font-mono uppercase " + (aiFields.shortCode ? "border-l-2 border-l-cyan-400" : "")}
            />
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
          <Field label="City" ai={aiFields.city}>
            <Input value={city} onChange={(e) => { setCity(e.target.value); clearAi("city"); }} placeholder="Madrid" className={aiFields.city ? "border-l-2 border-l-cyan-400 italic" : ""} />
          </Field>
          <Field label="Country" ai={aiFields.country}>
            <Input value={country} onChange={(e) => { setCountry(e.target.value); clearAi("country"); }} placeholder="Spain" className={aiFields.country ? "border-l-2 border-l-cyan-400 italic" : ""} />
          </Field>
          <Field label="Start date" ai={aiFields.startDate}>
            <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); clearAi("startDate"); }} className={aiFields.startDate ? "border-l-2 border-l-cyan-400" : ""} />
          </Field>
          <Field label="End date" ai={aiFields.endDate}>
            <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); clearAi("endDate"); }} className={aiFields.endDate ? "border-l-2 border-l-cyan-400" : ""} />
          </Field>
          <Field label="Primary hashtags" full ai={aiFields.hashtags}>
            <Input
              value={hashtags}
              onChange={(e) => { setHashtags(e.target.value); clearAi("hashtags"); }}
              placeholder="#EAU27, #UroSoMe"
              className={"font-mono " + (aiFields.hashtags ? "border-l-2 border-l-cyan-400" : "")}
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
  ai,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  ai?: { confidence: string };
}) {
  return (
    <div className={"grid gap-1.5 " + (full ? "col-span-2" : "")}>
      <Label className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1">
        {label}
        {ai && (
          <span
            title={`AI confidence: ${ai.confidence}${ai.confidence === "low" ? " · verify against official source" : " · safe to use"}`}
            className={
              ai.confidence === "high"
                ? "text-cyan-400"
                : ai.confidence === "low"
                  ? "text-red-400"
                  : "text-amber-400"
            }
          >
            <Sparkles className="h-3 w-3 inline" />
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}

export default NewCongressDialog;