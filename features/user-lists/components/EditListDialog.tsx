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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { updateListAction } from "../actions/list-actions";
import { useToastManager } from "@/hooks/useToastManager";
import type { UserListWithItems } from "../types";

interface EditListDialogProps {
  list: UserListWithItems;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** Surface this dialog is opened from, so ProTextarea's "…" menu offers the
   *  same bound agents as the page's context menu. */
  surfaceName?: string;
}

function EditListForm({
  list,
  onSuccess,
  onCancel,
  surfaceName,
}: {
  list: UserListWithItems;
  onSuccess: () => void;
  onCancel: () => void;
  surfaceName?: string;
}) {
  const [name, setName] = useState(list.list_name);
  const [description, setDescription] = useState(list.description ?? "");
  const [isPublic, setIsPublic] = useState(list.is_public);
  const [publicRead, setPublicRead] = useState(list.public_read);
  const [isPending, startTransition] = useTransition();
  const toast = useToastManager("user-lists");

  useEffect(() => {
    setName(list.list_name);
    setDescription(list.description ?? "");
    setIsPublic(list.is_public);
    setPublicRead(list.public_read);
  }, [list]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        await updateListAction({
          list_id: list.list_id,
          list_name: name.trim(),
          description: description.trim() || undefined,
          is_public: isPublic,
          public_read: publicRead,
        });
        toast.success("List updated");
        onSuccess();
      } catch (err) {
        toast.error(err);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-0.5">
      <div className="space-y-1.5">
        <Label htmlFor="edit-list-name" className="text-sm font-medium">
          List name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="edit-list-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          disabled={isPending}
          className="text-base"
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="edit-list-desc" className="text-sm font-medium">
          Description
        </Label>
        {/* THE LENGTH RULE: stats OFF. A list description is a one-line
            explainer (typicalCharCount 300 in the manifest), not long-form
            authoring, and the dialog is already tight. */}
        <ProTextarea
          id="edit-list-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={isPending}
          surfaceName={surfaceName}
          className="resize-none text-base leading-relaxed"
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Public list</p>
            <p className="text-xs text-muted-foreground">
              Anyone can view this list
            </p>
          </div>
          <Switch
            checked={isPublic}
            onCheckedChange={setIsPublic}
            disabled={isPending}
          />
        </div>

        {!isPublic && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Authenticated users</p>
              <p className="text-xs text-muted-foreground">
                Signed-in users can read this list
              </p>
            </div>
            <Switch
              checked={publicRead}
              onCheckedChange={setPublicRead}
              disabled={isPending}
            />
          </div>
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
          disabled={isPending || !name.trim()}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Changes
        </Button>
      </div>
    </form>
  );
}

export function EditListDialog({
  list,
  open,
  onOpenChange,
  onSuccess,
  surfaceName,
}: EditListDialogProps) {
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
            Edit List
          </DrawerTitle>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-safe">
            <EditListForm
              list={list}
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
          <DialogTitle>Edit List</DialogTitle>
        </DialogHeader>
        <EditListForm
          list={list}
          onSuccess={handleSuccess}
          onCancel={() => onOpenChange(false)}
          surfaceName={surfaceName}
        />
      </DialogContent>
    </Dialog>
  );
}
