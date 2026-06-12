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
import type { CodeFile } from "../redux/code-files.types";
import {
  QuickSaveCodeCore,
  type CodePostSaveAction,
} from "./QuickSaveCodeCore";

export interface QuickSaveCodeDialogProps {
  /** Legacy: shadcn-style `open`. Use `isOpen` for the unified overlay surface. */
  open?: boolean;
  /** Unified overlay surface convention: `isOpen` + `onClose`. */
  isOpen?: boolean;
  /** Legacy: shadcn-style change handler. */
  onOpenChange?: (open: boolean) => void;
  /** Unified overlay surface convention. */
  onClose?: () => void;
  initialContent: string;
  initialLanguage?: string;
  suggestedName?: string;
  defaultFolderId?: string | null;
  onSaved?: (file?: CodeFile, action?: CodePostSaveAction) => void;
}

export function QuickSaveCodeDialog({
  open,
  isOpen,
  onOpenChange,
  onClose,
  initialContent,
  initialLanguage,
  suggestedName,
  defaultFolderId = null,
  onSaved,
}: QuickSaveCodeDialogProps) {
  const isMobile = useIsMobile();

  // Normalize the two prop styles to a single source of truth so both
  // the legacy `open` / `onOpenChange` callers and the unified
  // `isOpen` / `onClose` overlay surface render correctly.
  const dialogOpen = isOpen ?? open ?? false;
  const setDialogOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (!next) onClose?.();
  };

  const handleSaved = (file: CodeFile, action: CodePostSaveAction) => {
    onSaved?.(file, action);
    setDialogOpen(false);
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
