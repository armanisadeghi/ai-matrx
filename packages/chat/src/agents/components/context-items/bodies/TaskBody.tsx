"use client";

/**
 * Task drawer body — fully editable, full height. Mounts the canonical
 * `TaskEditor` (embedded/compact, self-persists). Reports the task title to the
 * drawer title bar; no duplicate header.
 */

import { useEffect } from "react";
import TaskEditor from "@host/features/tasks/components/TaskEditor";
import { useAppSelector } from "../../../../store/hooks";
import {
  selectTaskById,
  type TaskRecord,
} from "../../../../context/sources/scopes";
import type { ContextItemBodyProps } from "../types";
import { TaskPreviewContent } from "@host/features/agents/components/previews/TaskHoverPreview";
import { ResourceSnapshotView } from "./ResourceSnapshotView";

export function TaskBody({ item, setTitle }: ContextItemBodyProps) {
  const taskId = item.refs.taskIds?.[0] ?? null;
  const snapshot = item.refs.resourceSnapshot;
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

  if (snapshot) {
    return <ResourceSnapshotView snapshot={snapshot} />;
  }

  if (!taskId) {
    return (
      <p className="p-4 text-xs text-muted-foreground italic">
        No task reference on this item.
      </p>
    );
  }

  if (!item.editable) {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-4">
        <TaskPreviewContent taskId={taskId} />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <TaskEditor taskId={taskId} embedded compact />
    </div>
  );
}
