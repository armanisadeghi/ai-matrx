"use client";

// TaskEditorWindow — the floating, single-task editor window.
//
// COMPOSITION ROOT: hoists the shared task-edit state via useTaskEditorController,
// provides it to the subtree, and maps the canonical task window chrome onto
// WindowPanel SLOTS — instead of the old anti-pattern (long name dumped into the
// header `title` + a checkmark icon, no header controls, and the embedded
// TaskEditor rendering the name a SECOND time in the body).
//
//   header titleNode → <TaskWindowBreadcrumb>  (compact project/type context)
//   actionsRight     → <TaskHeaderActions>      (save/discard + copy + delete …)
//   footer (bar)     → <TaskMetadataFooter>     (priority/due vitals + save status)
//   body             → <TaskTitleBand> hero + <TaskEditorBody> (content only)
//
// `title` (string) still carries the real task name so the tray / window-manager
// identity is meaningful; `titleNode` overrides the header bar with the short
// breadcrumb so a long name never sprawls across the header.

import { Loader2 } from "lucide-react";
import { useEnsureTaskLoaded } from "@/features/tasks/hooks/useEnsureTaskLoaded";
import { useTaskEditorController } from "@/features/tasks/components/editor/useTaskEditorController";
import { TaskEditorControllerProvider } from "@/features/tasks/components/editor/TaskEditorControllerContext";
import { TaskEditorBody } from "@/features/tasks/components/editor/TaskEditorBody";
import {
  TaskTitleBand,
  TaskWindowBreadcrumb,
  TaskHeaderActions,
  TaskMetadataFooter,
} from "@/features/tasks/components/editor/TaskWindowChrome";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

const OVERLAY_ID = "taskEditorWindow";

export interface TaskEditorWindowProps {
  taskId: string;
  onClose: () => void;
  /** Stable per-task instance id from the overlay slice. */
  instanceId: string;
}

export default function TaskEditorWindow({
  taskId,
  onClose,
  instanceId,
}: TaskEditorWindowProps) {
  const { loading, missing } = useEnsureTaskLoaded(taskId);
  const controller = useTaskEditorController(taskId);
  const offset = (hashCode(taskId) % 6) * 28;
  const ready = !loading && !missing && !!controller.task;

  return (
    <TaskEditorControllerProvider value={controller}>
      <WindowPanel
        id={`task-editor-${instanceId}`}
        title={controller.effective.title || "Task"}
        titleNode={ready ? <TaskWindowBreadcrumb /> : undefined}
        actionsRight={ready ? <TaskHeaderActions /> : undefined}
        footer={ready ? <TaskMetadataFooter /> : undefined}
        footerVariant="bar"
        onClose={onClose}
        overlayId={OVERLAY_ID}
        width={520}
        height={640}
        minWidth={380}
        minHeight={380}
        initialRect={{ x: 120 + offset, y: 96 + offset }}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >
        {loading ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : missing ? (
          <div className="grid h-full place-items-center px-6 text-center text-xs text-muted-foreground">
            Task not found
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <TaskTitleBand />
            <TaskEditorBody />
          </div>
        )}
      </WindowPanel>
    </TaskEditorControllerProvider>
  );
}

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
