"use client";

/**
 * Task drawer body — fully editable, full height. Mounts the canonical
 * `TaskEditor` (embedded/compact, self-persists). Reports the task title to the
 * drawer title bar; no duplicate header.
 */

import { useEffect } from "react";
import TaskEditor from "@/features/tasks/components/TaskEditor";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectTaskById,
  type TaskRecord,
} from "@/features/agent-context/redux/tasksSlice";
import type { ContextItemBodyProps } from "../types";

export function TaskBody({ item, setTitle }: ContextItemBodyProps) {
  const taskId = item.refs.taskIds?.[0] ?? null;
  const task = useAppSelector((s) =>
    taskId
      ? (selectTaskById(s as Parameters<typeof selectTaskById>[0], taskId) as
          | TaskRecord
          | undefined)
      : undefined,
  );

  useEffect(() => {
    if (task?.title?.trim()) setTitle?.(task.title.trim());
  }, [task?.title, setTitle]);

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
