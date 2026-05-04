import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Check, X, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { feedService } from "@/services/feedService";
import type { SourceList } from "@/types";

const PALETTE = [
  "#60a5fa",
  "#34d399",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#f87171",
  "#22d3ee",
  "#94a3b8",
];

export function ManageListsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: lists = [], isLoading } = useQuery({
    queryKey: ["source-lists"],
    queryFn: () => feedService.listSourceLists(),
  });

  const [newName, setNewName] = React.useState("");
  const [newColor, setNewColor] = React.useState(PALETTE[0]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editColor, setEditColor] = React.useState<string>(PALETTE[0]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["source-lists"] });
  };

  const add = useMutation({
    mutationFn: () =>
      feedService.addSourceList({ name: newName.trim(), color: newColor }),
    onSuccess: () => {
      toast.success(`List "${newName.trim()}" created`);
      setNewName("");
      invalidate();
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "Name already used" : "Couldn't create list"),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SourceList> }) =>
      feedService.updateSourceList(id, patch),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
    },
    onError: () => toast.error("Couldn't update list"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => feedService.removeSourceList(id),
    onSuccess: () => {
      toast.success("List deleted");
      invalidate();
      qc.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: () => toast.error("Couldn't delete list"),
  });

  const startEdit = (l: SourceList) => {
    setEditingId(l.id);
    setEditName(l.name);
    setEditColor(l.color ?? PALETTE[0]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage your lists</DialogTitle>
          <DialogDescription>
            Create folders to group the sources you follow. Lists are private to you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="border border-border rounded-sm p-2 bg-panel-elevated/40 space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New list name"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) add.mutate();
                }}
                className="h-8 text-[12px]"
              />
              <Button
                size="sm"
                className="h-8"
                onClick={() => add.mutate()}
                disabled={!newName.trim() || add.isPending}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
            <ColorPicker value={newColor} onChange={setNewColor} />
          </div>

          <div className="border border-border rounded-sm divide-y divide-border max-h-[320px] overflow-auto">
            {isLoading && (
              <div className="p-3 text-[11px] text-text-muted">Loading…</div>
            )}
            {!isLoading && lists.length === 0 && (
              <div className="p-3 text-[11px] text-text-muted">
                No lists yet. Create your first one above.
              </div>
            )}
            {lists.map((l) => {
              const isEditing = editingId === l.id;
              return (
                <div key={l.id} className="px-2 py-1.5 flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-sm flex-shrink-0 border border-border"
                    style={{ background: (isEditing ? editColor : l.color) ?? "transparent" }}
                  />
                  {isEditing ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-[12px] flex-1"
                        autoFocus
                      />
                      <ColorPicker value={editColor} onChange={setEditColor} compact />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          update.mutate({
                            id: l.id,
                            patch: { name: editName.trim(), color: editColor },
                          })
                        }
                        disabled={!editName.trim() || update.isPending}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-[12px]">{l.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-text-muted"
                        onClick={() => startEdit(l)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-text-muted hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Delete list "${l.name}"?`)) remove.mutate(l.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ColorPicker({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "flex gap-0.5" : "flex gap-1 flex-wrap"}>
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={
            "h-5 w-5 rounded-sm border " +
            (value === c ? "border-text-primary" : "border-border")
          }
          style={{ background: c }}
          aria-label={`color ${c}`}
        />
      ))}
    </div>
  );
}