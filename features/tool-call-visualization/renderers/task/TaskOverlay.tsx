"use client";

import { useMemo } from "react";
import TaskEditor from "@/features/tasks/components/TaskEditor";
import type { ToolRendererProps } from "../../types";
import { parseSingleTask } from "./parseTask";

/**
 * Overlay renderer for the `task` tool — the canonical `TaskEditor` (the same
 * full editor the `/tasks/[id]` route and the task window use), self-loading by
 * id in embedded mode.
 */
export function TaskOverlay({ entry }: ToolRendererProps) {
  const parsed = useMemo(() => parseSingleTask(entry), [entry]);

  if (!parsed.id) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        No task to display
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <TaskEditor taskId={parsed.id} embedded key={parsed.id} />
    </div>
  );
}
