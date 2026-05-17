"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CategorySelect } from "@/features/agent-shortcuts/components/CategorySelect";
import { useAgentShortcutCrud } from "@/features/agent-shortcuts/hooks/useAgentShortcutCrud";
import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import type {
  AgentShortcutCategory,
  CategoryFormData,
} from "@/features/agent-shortcuts/types";

/**
 * Category dropdown + inline "+ New" button. The dialog stays tight to
 * the essentials: label, optional parent. Placement is fixed to
 * ai-action so new categories show up next to the existing shortcut
 * categories without forcing the user to learn what "placement" means.
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  disabled,
}: {
  categories: AgentShortcutCategory[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const [openCreate, setOpenCreate] = useState(false);

  return (
    <>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <CategorySelect
            categories={categories}
            value={value}
            onValueChange={onChange}
            placeholder="Pick a category"
            disabled={disabled}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpenCreate(true)}
          disabled={disabled}
          className="h-9 gap-1 shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>

      {openCreate && (
        <NewCategoryDialog
          categories={categories}
          onClose={() => setOpenCreate(false)}
          onCreated={(id) => {
            setOpenCreate(false);
            onChange(id);
          }}
        />
      )}
    </>
  );
}

function NewCategoryDialog({
  categories,
  onClose,
  onCreated,
}: {
  categories: AgentShortcutCategory[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  // Quick category creation lives in the user's personal scope by
  // default. The crud hook scope drives where the row lands; everything
  // else gets safe defaults so this stays a 2-field dialog.
  const crud = useAgentShortcutCrud({ scope: "user" });
  const [label, setLabel] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const ROOT_VALUE = "__root__";

  const onSubmit = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error("Label is required");
      return;
    }
    setBusy(true);
    try {
      const payload: CategoryFormData = {
        label: trimmed,
        placementType: PLACEMENT_TYPES.AI_ACTION,
        parentCategoryId:
          parentCategoryId && parentCategoryId !== ROOT_VALUE
            ? parentCategoryId
            : null,
        description: "",
        iconName: "Folder",
        color: "",
        sortOrder: 0,
        isActive: true,
        enabledFeatures: [],
        metadata: {},
      };
      const newId = await crud.createCategory(payload);
      toast.success("Category created");
      onCreated(newId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1 pb-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Label
            </Label>
            <Input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Editing Tools"
              disabled={busy}
              className="h-9 text-sm"
              style={{ fontSize: "16px" }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) {
                  e.preventDefault();
                  void onSubmit();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Nest under (optional)
            </Label>
            <CategorySelect
              categories={categories}
              value={parentCategoryId || ROOT_VALUE}
              onValueChange={(v) =>
                setParentCategoryId(v === ROOT_VALUE ? "" : v)
              }
              placeholder="Top level"
              disabled={busy}
              placementFilter={PLACEMENT_TYPES.AI_ACTION}
              rootOption={{ value: ROOT_VALUE, label: "Top level" }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void onSubmit()}
            disabled={busy || !label.trim()}
            className="gap-1.5"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
