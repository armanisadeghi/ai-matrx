"use client";

/**
 * @deprecated Inline War Room subtask windows — use `useOpenTaskEditorWindow`
 * from `@/features/overlays/openers/taskEditorWindow` instead. Kept as a thin
 * shim for any legacy call sites; new code must go through OverlayController.
 */

import { useEffect } from "react";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";

export function SubtaskWindow({
  subtaskId,
  onClose,
}: {
  subtaskId: string;
  onClose: () => void;
}) {
  const openTaskEditor = useOpenTaskEditorWindow();

  useEffect(() => {
    const handle = openTaskEditor({ taskId: subtaskId });
    return () => {
      handle.close();
      onClose();
    };
  }, [openTaskEditor, subtaskId, onClose]);

  return null;
}
