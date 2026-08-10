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
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  TASK_CREATE_SURFACE_NAME,
  createTaskCreateScope,
  type TaskCreateDraftScope,
} from "@/features/surfaces/manifests/task-create.manifest";

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

  // Surface emitter (`matrx-user/task-create`): the window's opener payload
  // plus the LIVE form draft. TaskQuickCreateCore owns the form state and
  // publishes it into this ref (and registers the surface's write handlers)
  // — only for this mount, so the /tasks/new route's core stays out of it.
  // Nested provider out-depths the hosting page's surface while the window is
  // open (deepest wins, by design).
  const draftRef = React.useRef<TaskCreateDraftScope | null>(null);

  const getScope = React.useCallback(
    () =>
      createTaskCreateScope({
        has_source: !!source,
        source_entity_type: source?.entity_type,
        source_entity_id: source?.entity_id,
        source_label: source?.label,
        prefill_title: prePopulate?.title,
        prefill_description: prePopulate?.description,
        prefill_priority: prePopulate?.priority,
        // Never absent while mounted: the core publishes on its first commit,
        // and this seeds the same shape for the window between mount and it.
        task_draft: draftRef.current ?? {
          title: prePopulate?.title ?? "",
          description: prePopulate?.description ?? "",
          priority: prePopulate?.priority ?? "",
          due_date: "",
          project_id: "",
          scope_ids: [],
          link_scope: "message",
          saved_task_id: null,
        },
        content: prePopulate?.description,
      }),
    [source, prePopulate],
  );

  const title = source ? "Create task from source" : "Create task";

  // Match the QuickNoteSaveWindow footprint: near-fullscreen with a 24px
  // viewport pad so the refine editor (split view, trim rows) has room.
  const viewportPad = 24;
  const maxWidth =
    typeof window !== "undefined" ? window.innerWidth - viewportPad : 1600;
  const maxHeight =
    typeof window !== "undefined" ? window.innerHeight - viewportPad : 1000;

  return (
    <SurfaceRuntimeProvider
      surfaceName={TASK_CREATE_SURFACE_NAME}
      getScope={getScope}
    >
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
            surfaceDraftRef={draftRef}
          />
        </div>
      </WindowPanel>
    </SurfaceRuntimeProvider>
  );
}
