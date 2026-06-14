"use client";

// features/scopes/components/context-assignment/UploadContextPrompt.tsx
//
// The upload-time context nudge. When files start uploading WITHOUT context,
// the host opens this dialog immediately — the user picks context WHILE the
// upload runs. Both races are handled by one rule:
//
//     Save = (await the uploaded file ids) → write assignments.
//
//   • Fast upload: `awaitFileIds()` is already resolved — Save writes at once.
//   • Slow upload: Save's spinner runs until the upload lands, then writes.
//   • Dismissed: nothing is written; files stay context-less (and the file
//     UI's amber status icons keep nudging).
//
// Writes go file-by-file through the canonical setEntityScopes chokepoint —
// the same path every other assignment surface uses.

import React from "react";
import { UploadCloud } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useIsMobile } from "@/hooks/use-mobile";
import { setEntityScopes } from "@/features/scopes/redux/thunks/setEntityScopes";
import {
  ContextAssignmentField,
  type ContextSelection,
} from "./ContextAssignmentField";
import { ContextSheet } from "./ContextSheet";
import { invalidateAssignableData } from "./data";

export interface UploadContextPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names of the files being uploaded (display only). */
  fileNames: string[];
  /** Resolves with the uploaded cloud-file ids when the upload completes.
   *  May already be resolved (fast upload) — Save awaits it either way. */
  awaitFileIds: () => Promise<string[]>;
  defaultOrganizationId?: string | null;
  /** Called after assignments were written successfully. */
  onAssigned?: (fileIds: string[], selection: ContextSelection) => void;
}

export function UploadContextPrompt({
  open,
  onOpenChange,
  fileNames,
  awaitFileIds,
  defaultOrganizationId,
  onAssigned,
}: UploadContextPromptProps) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const count = fileNames.length;
  const title = count === 1 ? fileNames[0] : `${count} files`;

  async function submit(
    sel: ContextSelection,
  ): Promise<{ ok: boolean; error?: string }> {
    if (
      sel.scopeIds.length === 0 &&
      sel.projectIds.length === 0 &&
      sel.taskIds.length === 0
    ) {
      return { ok: true }; // explicit opt-out is allowed — close quietly
    }
    // THE race rule: wait for the upload (instant when already done).
    const fileIds = await awaitFileIds();
    if (fileIds.length === 0)
      return { ok: false, error: "Upload failed — nothing to assign" };
    const realScopeIds = sel.scopeIds.filter((id) => !id.startsWith("new:"));
    for (const fileId of fileIds) {
      const res = await dispatch(
        setEntityScopes({
          entityType: "file",
          entityId: fileId,
          scopeIds: realScopeIds,
        }),
      );
      if (!res.ok) return { ok: false, error: res.error };
    }
    if (sel.projectIds.length > 0 || sel.taskIds.length > 0) {
      console.warn(
        "[upload-context] project/task associations await the ctx_associations migration — logged only",
        {
          fileIds,
          projectIds: sel.projectIds,
          taskIds: sel.taskIds,
        },
      );
    }
    invalidateAssignableData("bulk");
    onAssigned?.(fileIds, sel);
    return { ok: true };
  }

  const subject = {
    entityType: "file" as const,
    entityId: "",
    title: count === 1 ? title : `${count} files uploading`,
    subtitle: "Where does this belong? Assign now — the upload keeps running.",
    icon: UploadCloud,
  };

  if (isMobile) {
    return (
      <ContextSheet
        open={open}
        onOpenChange={onOpenChange}
        title={count === 1 ? title : `${count} files`}
      >
        {open && (
          <ContextAssignmentField
            mode="assignment"
            writeMode="live"
            fill
            subject={subject}
            defaultOrganizationId={defaultOrganizationId}
            onSubmitSelection={submit}
            onSaved={(r) => {
              if (r.ok) onOpenChange(false);
            }}
            className="rounded-none border-0"
          />
        )}
      </ContextSheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[680px] max-w-[94vw] p-0">
        <DialogTitle className="sr-only">Assign context to {title}</DialogTitle>
        {open && (
          <ContextAssignmentField
            mode="assignment"
            writeMode="live"
            subject={subject}
            defaultOrganizationId={defaultOrganizationId}
            onSubmitSelection={submit}
            onSaved={(r) => {
              if (r.ok) onOpenChange(false);
            }}
            className="border-0"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
