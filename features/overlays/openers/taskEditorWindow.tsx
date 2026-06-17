"use client";

/**
 * Opener for the `taskEditorWindow` overlay — the canonical way to open any
 * task or subtask in a floating `WindowPanel` + `TaskEditor`.
 *
 * One stable instance per task id (`task-${taskId}`) so re-opening focuses the
 * existing window instead of stacking duplicates.
 */

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";

const OVERLAY_ID = "taskEditorWindow" as const;

export interface OpenTaskEditorWindowOptions {
  taskId: string;
  /** Defaults to `task-${taskId}` — one window per task. */
  instanceId?: string;
}

export interface TaskEditorWindowHandle {
  instanceId: string;
  close: () => void;
}

export function taskEditorInstanceId(taskId: string): string {
  return `task-${taskId}`;
}

export function useOpenTaskEditorWindow() {
  const dispatch = useAppDispatch();
  return useCallback(
    (opts: OpenTaskEditorWindowOptions): TaskEditorWindowHandle => {
      const instanceId = opts.instanceId ?? taskEditorInstanceId(opts.taskId);
      dispatch(
        openOverlay({
          overlayId: OVERLAY_ID,
          instanceId,
          data: { taskId: opts.taskId },
        }),
      );
      return {
        instanceId,
        close: () =>
          dispatch(closeOverlay({ overlayId: OVERLAY_ID, instanceId })),
      };
    },
    [dispatch],
  );
}
