"use client";
// features/code-files/actions/QuickSaveCodeDialog.tsx
//
// Dialog/Drawer wrapper around QuickSaveCodeCore. Used by both the
// OverlayController (for openSaveToCode) and by direct in-component
// invocations.

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
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { QuickSaveCodeCore } from "./QuickSaveCodeCore";

export interface QuickSaveCodeDialogProps {
  /** Unified overlay surface convention: `isOpen` + `onClose`. */
  isOpen?: boolean;
  /** Unified overlay surface convention. */
  onClose?: () => void;
  initialContent: string;
  initialLanguage?: string;
  suggestedName?: string;
  defaultFolderId?: string | null;
}

export function QuickSaveCodeDialog({
  isOpen,
  onClose,
  initialContent,
  initialLanguage,
  suggestedName,
  defaultFolderId = null,
}: QuickSaveCodeDialogProps) {
  const isMobile = useIsMobile();

  const dialogOpen = isOpen ?? false;
  const setDialogOpen = (next: boolean) => {
    if (!next) onClose?.();
  };

  const handleSaved = () => {
    onClose?.();
  };

  const handleCancel = () => setDialogOpen(false);

  if (isMobile) {
    return (
      <Drawer open={dialogOpen} onOpenChange={setDialogOpen}>
        <DrawerContent className="h-[92dvh] flex flex-col">
          <DrawerHeader className="px-3 pt-3 pb-2 shrink-0">
            <DrawerTitle className="text-sm">Quick Save Code</DrawerTitle>
            <DrawerDescription className="sr-only">
              Save this snippet to your code files, or append/overwrite an
              existing file.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 min-h-0 px-3 pb-3">
            <QuickSaveCodeCore
              initialContent={initialContent}
              initialLanguage={initialLanguage}
              suggestedName={suggestedName}
              defaultFolderId={defaultFolderId}
              onSaved={handleSaved}
              onCancel={handleCancel}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-4xl h-[min(85dvh,780px)] p-3 flex flex-col gap-2">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm">Quick Save Code</DialogTitle>
          <DialogDescription className="sr-only">
            Save this snippet to your code files, or append/overwrite an
            existing file.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <QuickSaveCodeCore
            initialContent={initialContent}
            initialLanguage={initialLanguage}
            suggestedName={suggestedName}
            defaultFolderId={defaultFolderId}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
