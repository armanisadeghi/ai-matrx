"use client";

import React from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import type {
  PostSaveAction,
  TaskPrePopulate,
  TaskSourceInput,
} from "@/features/tasks/widgets/quick-create/TaskQuickCreateCore";
import { TaskCreatePanel } from "@/features/tasks/widgets/quick-create/TaskCreatePanel";

export interface TaskQuickCreateWindowProps {
  isOpen: boolean;
  onClose: () => void;
  source?: TaskSourceInput;
  prePopulate?: TaskPrePopulate;
  /** Optional instance id so multiple captures can open concurrently. */
  instanceId?: string;
}

const OVERLAY_ID = "taskQuickCreateWindow";
const BASE_WINDOW_ID = "task-quick-create-window";

/**
 * Non-blocking, draggable, resizable OS-style window for creating a task.
 *
 * Mirrors QuickNoteSaveWindow's shape. The window is ephemeral — not
 * persisted to window_sessions — because each invocation is a one-shot
 * capture with a different source/prePopulate payload.
 */
export default function TaskQuickCreateWindow({
  isOpen,
  onClose,
  source,
  prePopulate,
  instanceId,
}: TaskQuickCreateWindowProps) {
  if (!isOpen) return null;
  return (
    <TaskQuickCreateWindowInner
      onClose={onClose}
      source={source}
      prePopulate={prePopulate}
      instanceId={instanceId}
    />
  );
}

function TaskQuickCreateWindowInner({
  onClose,
  source,
  prePopulate,
  instanceId,
}: {
  onClose: () => void;
  source?: TaskSourceInput;
  prePopulate?: TaskPrePopulate;
  instanceId?: string;
}) {
  const windowId = instanceId
    ? `${BASE_WINDOW_ID}-${instanceId}`
    : BASE_WINDOW_ID;

  const handleSaved = (_taskId: string, action: PostSaveAction) => {
    // Close on explicit nav/open actions; leave open if the user hits Done
    // so they can glance at the confirmation before dismissing.
    if (action !== "none") onClose();
    else onClose();
  };

  const title = source ? "Create task from source" : "Create task";

  return (
    <WindowPanel
      title={title}
      id={windowId}
      overlayId={OVERLAY_ID}
      minWidth={520}
      minHeight={480}
      width={720}
      height={560}
      position="center"
      onClose={onClose}
    >
      <div className="h-full min-h-0 p-3">
        <TaskCreatePanel
          source={source}
          prePopulate={prePopulate}
          onSaved={handleSaved}
          onCancel={onClose}
        />
      </div>
    </WindowPanel>
  );
}
