"use client";

/**
 * PdfStudioUploadDrawer — sidebar `+ Add` button → bottom drawer with the
 * shared `PdfStudioUpload` UI inside.
 *
 * Closes itself once the user has finished extracting (when the parent
 * passes `closeOnComplete=true`). The studio shell is responsible for
 * refreshing the doc list and auto-selecting the first new doc.
 */

import React, { useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { PdfStudioUpload } from "./PdfStudioUpload";
import type { usePdfExtractor } from "../hooks/usePdfExtractor";

interface PdfStudioUploadDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractor: ReturnType<typeof usePdfExtractor>;
  onUploadComplete?: (newDocIds: string[]) => void;
  onFirstDocReady?: (docId: string) => void;
  /** Auto-close once the batch run completes (default: true). */
  closeOnComplete?: boolean;
}

export function PdfStudioUploadDrawer({
  open,
  onOpenChange,
  extractor,
  onUploadComplete,
  onFirstDocReady,
  closeOnComplete = true,
}: PdfStudioUploadDrawerProps) {
  const handleComplete = (ids: string[]) => {
    onUploadComplete?.(ids);
    if (closeOnComplete) {
      // Brief delay so the user sees the green ✓ rows before the drawer closes.
      window.setTimeout(() => onOpenChange(false), 700);
    }
  };

  // Reset selection when the drawer is closed externally so re-opening
  // is a fresh canvas.
  useEffect(() => {
    if (!open && extractor.batchStatus === "idle") {
      extractor.clearFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[80dvh]">
        <DrawerHeader>
          <DrawerTitle>Add documents</DrawerTitle>
          <DrawerDescription>
            Drop one or many PDFs (or images). Each file streams through the
            extractor and appears in the sidebar as soon as it's ready.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <PdfStudioUpload
            extractor={extractor}
            variant="compact"
            onUploadComplete={handleComplete}
            onFirstDocReady={onFirstDocReady}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
