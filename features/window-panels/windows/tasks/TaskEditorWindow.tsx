"use client";

import { CheckSquare, ListTodo, Loader2 } from "lucide-react";
import TaskEditor from "@/features/tasks/components/TaskEditor";
import { useEnsureTaskLoaded } from "@/features/tasks/hooks/useEnsureTaskLoaded";
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
  const { task, loading, missing } = useEnsureTaskLoaded(taskId);
  const offset = (hashCode(taskId) % 6) * 28;
  const isSubtask = Boolean(task?.parent_task_id);
  const title = task?.title || "Task";
  const Icon = isSubtask ? CheckSquare : ListTodo;

  return (
    <WindowPanel
      id={`task-editor-${instanceId}`}
      title={title}
      titleNode={
        <span className="flex min-w-0 items-center gap-1.5">
          <Icon className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{title}</span>
        </span>
      }
      onClose={onClose}
      overlayId={OVERLAY_ID}
      width={460}
      height={560}
      minWidth={340}
      minHeight={320}
      initialRect={{ x: 120 + offset, y: 96 + offset }}
      bodyClassName="p-0"
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
        <TaskEditor taskId={taskId} embedded key={taskId} />
      )}
    </WindowPanel>
  );
}

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
