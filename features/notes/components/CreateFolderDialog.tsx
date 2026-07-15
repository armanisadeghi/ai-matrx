"use client";

import React, { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { FOLDER_CATEGORIES } from "../constants/folderCategories";
import { cn } from "@/lib/utils";

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (folderName: string) => void | Promise<void>;
  existingFolders?: string[];
  /** Describes the follow-up so creation feels connected to the current task. */
  description?: string;
  confirmLabel?: string;
}

export function CreateFolderDialog({
  open,
  onOpenChange,
  onConfirm,
  existingFolders = [],
  description = "Enter a custom name or choose a popular category.",
  confirmLabel = "Create Folder",
}: CreateFolderDialogProps) {
  const isMobile = useIsMobile();
  const [folderName, setFolderName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setFolderName("");
    setSelectedCategory(null);
    setError("");
    setBusy(false);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (busy) return;
      if (!nextOpen) reset();
      onOpenChange(nextOpen);
    },
    [busy, onOpenChange, reset],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const trimmedName = folderName.trim();
    if (!trimmedName) {
      setError("Folder name cannot be empty");
      return;
    }

    const duplicate = existingFolders.some(
      (folder) =>
        folder.localeCompare(trimmedName, undefined, {
          sensitivity: "accent",
        }) === 0,
    );
    if (duplicate) {
      setError("A folder with this name already exists");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await onConfirm(trimmedName);
      reset();
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create the folder",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCategorySelect = (
    category: (typeof FOLDER_CATEGORIES)[number],
  ) => {
    setSelectedCategory(category.id);
    setFolderName(category.label);
    setError("");
  };

  const formBody = (
    <>
      <div className="grid gap-2">
        <Label htmlFor="note-folder-name">Folder name</Label>
        <Input
          id="note-folder-name"
          value={folderName}
          onChange={(event) => {
            setFolderName(event.target.value);
            setSelectedCategory(null);
            setError("");
          }}
          placeholder="e.g., Work, Personal, Ideas"
          autoFocus
          disabled={busy}
          className="text-base"
          aria-invalid={!!error}
          aria-describedby={error ? "note-folder-name-error" : undefined}
        />
        {error ? (
          <p id="note-folder-name-error" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 gap-2 overflow-hidden">
        <Label>Popular categories</Label>
        <ScrollArea className="min-h-0 flex-1 pr-3">
          <div className="grid grid-cols-1 gap-2 pb-1 sm:grid-cols-2">
            {FOLDER_CATEGORIES.map((category) => {
              const Icon = category.icon;
              const isSelected = selectedCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => handleCategorySelect(category)}
                  disabled={busy}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent disabled:opacity-50",
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-border",
                  )}
                >
                  <Icon
                    className={cn("mt-0.5 h-5 w-5 shrink-0", category.color)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {category.label}
                    </span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {category.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </>
  );

  const actions = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => handleOpenChange(false)}
        disabled={busy}
      >
        Cancel
      </Button>
      <Button type="submit" disabled={busy || !folderName.trim()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {confirmLabel}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent className="flex max-h-[88dvh] flex-col pb-safe">
          <DrawerHeader>
            <DrawerTitle>Create new folder</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4"
          >
            {formBody}
            <DrawerFooter className="shrink-0 flex-row justify-end gap-2 px-0">
              {actions}
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create new folder</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden"
        >
          {formBody}
          <DialogFooter className="shrink-0">{actions}</DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
