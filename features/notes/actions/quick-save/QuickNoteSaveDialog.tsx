"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Note } from "@/features/notes/types";
import { QuickNoteSaveCore, type PostSaveAction } from "./QuickNoteSaveCore";

export interface QuickNoteSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContent: string;
  defaultFolder?: string;
  onSaved?: (note?: Note, action?: PostSaveAction) => void;
}

export function QuickNoteSaveDialog({
  open,
  onOpenChange,
  initialContent,
  defaultFolder = "Scratch",
  onSaved,
}: QuickNoteSaveDialogProps) {
  const isMobile = useIsMobile();

  const handleSaved = (note: Note, action: PostSaveAction) => {
    onSaved?.(note, action);
    onOpenChange(false);
  };

  const handleCancel = () => onOpenChange(false);

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[92dvh] flex flex-col">
          <DrawerHeader className="px-3 pt-3 pb-2 shrink-0">
            <DrawerTitle className="text-sm">Quick Save to Notes</DrawerTitle>
            <DrawerDescription className="sr-only">
              Save or append captured text to a note.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 min-h-0 px-3 pb-3">
            <QuickNoteSaveCore
              initialContent={initialContent}
              defaultFolder={defaultFolder}
              onSaved={handleSaved}
              onCancel={handleCancel}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[min(80dvh,720px)] p-3 flex flex-col gap-2">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm">Quick Save to Notes</DialogTitle>
          <DialogDescription className="sr-only">
            Save or append captured text to a note.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <QuickNoteSaveCore
            initialContent={initialContent}
            defaultFolder={defaultFolder}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
