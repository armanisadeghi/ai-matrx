"use client";

import React, { useState } from "react";
import { CircleDot, Save, Loader2 } from "lucide-react";
import { useAppSelector, useAppDispatch } from "../store/hooks";
import {
  selectSessionHasUnsavedChanges,
  selectDirtyMessages,
} from "./_legacy-stubs";
import { editMessage } from "./_legacy-stubs";
import { buildContentBlocksForSave } from "./utils/buildContentBlocksForSave";
import { Button } from "@ai-matrx/design-system/controls";

interface UnsavedChangesIndicatorProps {
  sessionId: string;
}

export function UnsavedChangesIndicator({
  sessionId,
}: UnsavedChangesIndicatorProps) {
  const dispatch = useAppDispatch();
  const [saving, setSaving] = useState(false);

  const hasUnsavedChanges = useAppSelector((state) =>
    selectSessionHasUnsavedChanges(state, sessionId),
  );

  const dirtyMessages = useAppSelector((state) =>
    selectDirtyMessages(state, sessionId),
  );

  if (!hasUnsavedChanges) return null;

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await Promise.all(
        dirtyMessages.map((msg) => {
          const contentBlocks = buildContentBlocksForSave(
            msg.content,
            msg.rawContent as unknown[] | undefined,
          );
          return dispatch(
            editMessage({
              sessionId,
              messageId: msg.id,
              newContent: contentBlocks,
            }),
          ).unwrap();
        }),
      );
    } catch {
      /* toast handled by thunk */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed top-12 right-4 z-40 flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-card/90 backdrop-blur-sm shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-1.5 pl-3 py-1.5">
        <CircleDot className="w-3 h-3 text-amber-500 animate-pulse" />
        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
          Unsaved changes
        </span>
      </div>
      <Button variant="quiet" tone="primary" icon={saving ? <Loader2 className="animate-spin" /> : <Save />} onClick={handleSaveAll} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
    </div>
  );
}
