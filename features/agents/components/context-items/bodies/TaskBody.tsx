"use client";

/**
 * Task drawer body — fully editable. Mounts the canonical `TaskEditor` in
 * embedded/compact mode (self-persists to the tasks slice). For already-sent
 * attachments, the drawer footer offers re-attaching the updated task.
 */

import TaskEditor from "@/features/tasks/components/TaskEditor";
import type { ContextItemBodyProps } from "../types";

export function TaskBody({ item }: ContextItemBodyProps) {
  const taskId = item.refs.taskIds?.[0] ?? null;

  if (!taskId) {
    return (
      <p className="p-4 text-xs text-muted-foreground italic">
        No task reference on this item.
      </p>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <TaskEditor taskId={taskId} embedded compact />
    </div>
  );
}
