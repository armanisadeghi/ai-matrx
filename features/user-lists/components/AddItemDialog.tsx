"use client";

import React, { useState, useTransition } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { ProInput } from "@/components/official/ProInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Loader2 } from "lucide-react";
import { addItemAction } from "../actions/list-actions";
import { useToastManager } from "@/hooks/useToastManager";

interface AddItemDialogProps {
  listId: string;
  defaultGroupName?: string;
  existingGroups?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Surface this dialog is opened from, so ProTextarea's "…" menu offers the
   *  same bound agents as the page's context menu. */
  surfaceName?: string;
}

function AddItemForm({
  listId,
  defaultGroupName,
  existingGroups,
  onSuccess,
  onCancel,
  surfaceName,
}: {
  listId: string;
  defaultGroupName?: string;
  existingGroups?: string[];
  onSuccess: () => void;
  onCancel: () => void;
  surfaceName?: string;
}) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [helpText, setHelpText] = useState("");
  const [groupName, setGroupName] = useState(defaultGroupName ?? "");
  const [isPending, startTransition] = useTransition();
  const toast = useToastManager("user-lists");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    startTransition(async () => {
      try {
        await addItemAction({
          listId,
          label: label.trim(),
          description: description.trim() || undefined,
          helpText: helpText.trim() || undefined,
          groupName: groupName.trim() || undefined,
        });
        toast.success(`Item "${label}" added`);
        onSuccess();
      } catch (err) {
        toast.error(err);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-0.5">
      <div className="space-y-1.5">
        <Label htmlFor="item-label" className="text-sm font-medium">
          Label <span className="text-destructive">*</span>
        </Label>
        <ProInput
          id="item-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Full Name"
          required
          autoFocus
          disabled={isPending}
          className="text-base"
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="item-description" className="text-sm font-medium">
          Description
        </Label>
        {/* THE LENGTH RULE: stats OFF. An item description is a short
            explainer (typicalCharCount 500 in the manifest), well under the
            ~1,000-char threshold where length starts to matter. */}
        <ProTextarea
          id="item-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this item represent?"
          rows={2}
          disabled={isPending}
          surfaceName={surfaceName}
          className="resize-none text-base"
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="item-help" className="text-sm font-medium">
          Help text
        </Label>
        <ProInput
          id="item-help"
          value={helpText}
          onChange={(e) => setHelpText(e.target.value)}
          placeholder="Short hint shown in secondary line"
          disabled={isPending}
          className="text-base"
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="item-group" className="text-sm font-medium">
          Group
        </Label>
        <ProInput
          id="item-group"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Leave blank for Ungrouped"
          list="existing-groups"
          disabled={isPending}
          className="text-base"
          style={{ fontSize: "16px" }}
        />
        {existingGroups && existingGroups.length > 0 && (
          <datalist id="existing-groups">
            {existingGroups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        )}
        <p className="text-xs text-muted-foreground">
          Type a group name or pick from existing groups
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={isPending || !label.trim()}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Add Item
        </Button>
      </div>
    </form>
  );
}

export function AddItemDialog({
  listId,
  defaultGroupName,
  existingGroups,
  open,
  onOpenChange,
  onSuccess,
  surfaceName,
}: AddItemDialogProps) {
  const isMobile = useIsMobile();

  const handleSuccess = () => {
    onOpenChange(false);
    onSuccess?.();
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerTitle className="px-4 pt-4 text-base font-semibold">
            Add Item
          </DrawerTitle>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-safe">
            <AddItemForm
              listId={listId}
              defaultGroupName={defaultGroupName}
              existingGroups={existingGroups}
              onSuccess={handleSuccess}
              onCancel={() => onOpenChange(false)}
              surfaceName={surfaceName}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Item</DialogTitle>
        </DialogHeader>
        <AddItemForm
          listId={listId}
          defaultGroupName={defaultGroupName}
          existingGroups={existingGroups}
          onSuccess={handleSuccess}
          onCancel={() => onOpenChange(false)}
          surfaceName={surfaceName}
        />
      </DialogContent>
    </Dialog>
  );
}
