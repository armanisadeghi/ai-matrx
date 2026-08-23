"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { ProInput } from "@/components/official/ProInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { createListAction } from "../actions/list-actions";
import { useToastManager } from "@/hooks/useToastManager";

interface CreateListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Override the post-create navigation. Receives the new list id. */
  onSuccess?: (id: string) => void;
}

function CreateListForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isPending, startTransition] = useTransition();
  const toast = useToastManager("user-lists");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        const result = await createListAction({
          list_name: name.trim(),
          description: description.trim() || undefined,
          is_public: isPublic,
          public_read: true,
        });
        toast.success(`"${name}" created`);
        onSuccess(result.list_id);
      } catch (err) {
        toast.error(err);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-0.5">
      <div className="space-y-1.5">
        <Label htmlFor="list-name" className="text-sm font-medium">
          List name <span className="text-destructive">*</span>
        </Label>
        <ProInput
          id="list-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Resume Checklist"
          required
          autoFocus
          disabled={isPending}
          className="text-base"
          style={{ fontSize: "16px" }}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="list-desc" className="text-sm font-medium">
          Description
        </Label>
        {/* THE LENGTH RULE: stats OFF — a list description is a one-line
            explainer, not long-form authoring. */}
        <ProTextarea
          id="list-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description…"
          rows={3}
          disabled={isPending}
          className="resize-none text-base leading-relaxed"
          style={{ fontSize: "16px" }}
        />
      </div>

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
          Create List
        </Button>
      </div>
    </form>
  );
}

export function CreateListDialog({
  open,
  onOpenChange,
  onSuccess: onSuccessProp,
}: CreateListDialogProps) {
  const isMobile = useIsMobile();
  const router = useRouter();

  const handleSuccess = (id: string) => {
    onOpenChange(false);
    if (onSuccessProp) {
      onSuccessProp(id);
    } else {
      router.push(`/lists/${id}`);
    }
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh]">
          <DrawerTitle className="px-4 pt-4 text-base font-semibold">
            New List
          </DrawerTitle>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-safe">
            <CreateListForm
              onSuccess={handleSuccess}
              onCancel={() => onOpenChange(false)}
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
          <DialogTitle>New List</DialogTitle>
        </DialogHeader>
        <CreateListForm
          onSuccess={handleSuccess}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
