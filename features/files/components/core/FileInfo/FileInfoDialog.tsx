/**
 * features/files/components/core/FileInfo/FileInfoDialog.tsx
 *
 * Read-only "File info" dialog — restores parity with the legacy
 * components/file-system/context-menu File Info modal that exposed size,
 * mime-type, dates, storage path, owner, visibility, and the canonical
 * file id (copyable so devs can paste it into Redux DevTools / API calls).
 *
 * Triggered by the "File info" item inside `FileContextMenu`. Uses Dialog
 * on desktop; a future mobile pass should swap to Drawer (per the
 * iOS-first rules).
 */

"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Globe, Lock, Users } from "lucide-react";
import { FileInfoTab } from "@/features/files/components/surfaces/FileInfoTab";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { selectAllFoldersMap, selectFileById } from "@/features/files/redux/selectors";
import { formatFileSize } from "@/features/files/utils/format";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { EntityScopeTagger } from "@/features/scopes/components/entity-context/EntityScopeTagger";
import { useActiveContext } from "@/features/scopes/hooks/useActiveContext";
import type { Visibility } from "@/features/files/types";

export interface FileInfoDialogProps {
  fileId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FileInfoDialog({
  fileId,
  open,
  onOpenChange,
}: FileInfoDialogProps) {
  // One info implementation everywhere: this dialog is a thin chrome
  // around the canonical FileInfoTab (the single-file page's Info tab).
  // The old dialog re-implemented a compact subset of the same fields,
  // which drifted — converged 2026-06-12.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">File info</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {fileId ? <FileInfoTab fileId={fileId} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
