"use client";

import React, { useState, useTransition, useEffect } from "react";
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
import { updateItemAction } from "../actions/list-actions";
import { useToastManager } from "@/hooks/useToastManager";
import type { GroupedItem } from "../types";

interface EditItemDialogProps {
  item: GroupedItem | null;
  listId: string;
  existingGroups?: string[];
  /**
   * The group the item currently sits under, so the Group field opens on the
   * truth. `GroupedItem` carries no group of its own — the grouping lives in
   * the key of `items_grouped` — so the opener passes it in.
   */
  currentGroup?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Surface this dialog is opened from, so ProTextarea's "…" menu offers the
   *  same bound agents as the page's context menu. */
  surfaceName?: string;
}

function EditItemForm({
  item,
  listId,
  existingGroups,
  currentGroup,
  onSuccess,
  onCancel,
  surfaceName,
}: {
  item: GroupedItem;
  listId: string;
  existingGroups?: string[];
  currentGroup?: string;
  onSuccess: () => void;
  onCancel: () => void;
  surfaceName?: string;
}) {
  const normalizeGroup = (g?: string) => (!g || g === "Ungrouped" ? "" : g);
  const [label, setLabel] = useState(item.label);
  const [description, setDescription] = useState(item.description ?? "");
  const [helpText, setHelpText] = useState(item.help_text ?? "");
  const [groupName, setGroupName] = useState(normalizeGroup(currentGroup));
  const [isPending, startTransition] = useTransition();
  const toast = useToastManager("user-lists");

  useEffect(() => {
    setLabel(item.label);
    setDescription(item.description ?? "");
    setHelpText(item.help_text ?? "");
    setGroupName(normalizeGroup(currentGroup));
  }, [item, currentGroup]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    startTransition(async () => {
      try {
        await updateItemAction({
          itemId: item.id,
          listId,
          label: label.trim(),
          description: description.trim() || null,
          helpText: helpText.trim() || null,
          groupName: groupName.trim() || null,
        });
        toast.success("Item updated");
        onSuccess();
      } catch (err) {
        toast.error(err);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-0.5">
      <div className="space-y-1.5">
        <Label htmlFor="edit-item-label" className="text-sm font-medium">
          Label <span className="text-destructive">*</span>
        </Label>
        <ProInput
          id="edit-item-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          autoFocus
          disabled={isPending}
          className="text-base"
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-item-description" className="text-sm font-medium">
          Description
        </Label>
        {/* THE LENGTH RULE: stats OFF — same short item description as
            AddItemDialog (typicalCharCount 500). */}
        <ProTextarea
          id="edit-item-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          disabled={isPending}
          surfaceName={surfaceName}
          className="resize-none text-base"
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-item-help" className="text-sm font-medium">
          Help text
        </Label>
        <ProInput
          id="edit-item-help"
          value={helpText}
          onChange={(e) => setHelpText(e.target.value)}
          disabled={isPending}
          className="text-base"
          style={{ fontSize: "16px" }}
        />
      </div>

      {/* Group — `existingGroups` was threaded into this dialog and never
          rendered, so an item could be filed under a heading at creation and
          then never moved from the UI, while the agent write target
          (update_list_item) could move it. Same control as AddItemDialog. */}
      <div className="space-y-1.5">
        <Label htmlFor="edit-item-group" className="text-sm font-medium">
          Group
        </Label>
        <ProInput
          id="edit-item-group"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Leave blank for Ungrouped"
          list="edit-item-existing-groups"
          disabled={isPending}
          className="text-base"
          style={{ fontSize: "16px" }}
        />
        {existingGroups && existingGroups.length > 0 && (
          <datalist id="edit-item-existing-groups">
            {existingGroups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        )}
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
          Save
        </Button>
      </div>
    </form>
  );
}

export function EditItemDialog({
  item,
  listId,
  existingGroups,
  currentGroup,
  open,
  onOpenChange,
  onSuccess,
  surfaceName,
}: EditItemDialogProps) {
  const isMobile = useIsMobile();

  if (!item) return null;

  const handleSuccess = () => {
    onOpenChange(false);
    onSuccess?.();
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerTitle className="px-4 pt-4 text-base font-semibold">
            Edit Item
          </DrawerTitle>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-safe">
            <EditItemForm
              item={item}
              listId={listId}
              existingGroups={existingGroups}
              currentGroup={currentGroup}
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
          <DialogTitle>Edit Item</DialogTitle>
        </DialogHeader>
        <EditItemForm
          item={item}
          listId={listId}
          existingGroups={existingGroups}
          currentGroup={currentGroup}
          onSuccess={handleSuccess}
          onCancel={() => onOpenChange(false)}
          surfaceName={surfaceName}
        />
      </DialogContent>
    </Dialog>
  );
}
