"use client";

import React from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import type {
  PostSaveAction,
  TaskPrePopulate,
  TaskSourceInput,
} from "@/features/tasks/widgets/quick-create/TaskQuickCreateCore";
import { TaskCreatePanel } from "@/features/tasks/widgets/quick-create/TaskCreatePanel";
import { emitTaskQuickCreateSaved } from "@/features/overlays/openers/taskQuickCreateWindow";

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
 * Mirrors QuickNoteSaveWindow's shape. The window is excluded from the local
 * refresh workspace because each invocation is a one-shot capture with a
 * different source/prePopulate payload.
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
  // Footer slot: the core portals its window-level actions (Cancel /
  // Create & attach / post-save row) into the WindowPanel footer.
  const [footerHost, setFooterHost] = React.useState<HTMLElement | null>(null);
  const windowId = instanceId
    ? `${BASE_WINDOW_ID}-${instanceId}`
    : BASE_WINDOW_ID;

  const handleSaved = (taskId: string, _action: PostSaveAction) => {
    emitTaskQuickCreateSaved(taskId);
    onClose();
  };

  const title = source ? "Create task from source" : "Create task";

  // Match the QuickNoteSaveWindow footprint: near-fullscreen with a 24px
  // viewport pad so the refine editor (split view, trim rows) has room.
  const viewportPad = 24;
  const maxWidth =
    typeof window !== "undefined" ? window.innerWidth - viewportPad : 1600;
  const maxHeight =
    typeof window !== "undefined" ? window.innerHeight - viewportPad : 1000;

  return (
    <WindowPanel
      title={title}
      id={windowId}
      overlayId={OVERLAY_ID}
      minWidth={520}
      minHeight={480}
      width="90vw"
      height="85dvh"
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      position="center"
      onClose={onClose}
      footerRight={<div ref={setFooterHost} className="flex items-center" />}
    >
      <div className="h-full min-h-0 p-3">
        <TaskCreatePanel
          source={source}
          prePopulate={prePopulate}
          onSaved={handleSaved}
          onCancel={onClose}
          footerHost={footerHost}
        />
      </div>
    </WindowPanel>
  );
}
