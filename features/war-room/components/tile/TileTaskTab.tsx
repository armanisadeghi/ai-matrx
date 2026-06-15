"use client";

// features/war-room/components/tile/TileTaskTab.tsx
//
// The Task tab IS the real task editor — `features/tasks/components/TaskEditor`
// bound to the tile's task_id (embedded mode). No bespoke layout: the tile gets
// the same name / description / subtasks / attachments / comments / priority /
// due / assignee / tags / advanced editor the /tasks route uses, properly
// spaced (it fills the tile column and scrolls internally). The only
// tile-specific chrome is the "create a task" empty state.

import { useState } from "react";
import { Loader2, ListChecks } from "lucide-react";
import TaskEditor from "@/features/tasks/components/TaskEditor";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { selectTileById } from "@/features/war-room/redux/selectors";
import { createTileTask } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";

export function TileTaskTab({ tileId }: { tileId: string }) {
  const dispatch = useAppDispatch();
  const tile = useAppSelector((s) => selectTileById(tileId)(s));
  const taskId = tile?.task_id ?? null;
  const task = useAppSelector((s) => (taskId ? selectTaskById(s, taskId) : undefined));
  const [creating, setCreating] = useState(false);

  // No task yet → offer to create one (the tile's anchor).
  if (!taskId) {
    return (
      <div className="h-full grid place-items-center px-4">
        <button
          type="button"
          disabled={creating}
          onClick={async () => {
            setCreating(true);
            await dispatch(createTileTask(tileId));
            setCreating(false);
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg px-4 py-3 text-muted-foreground transition-colors",
            "hover:text-primary disabled:opacity-60",
          )}
        >
          <span className="grid place-items-center size-10 rounded-full bg-muted/60">
            {creating ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ListChecks className="size-5" />
            )}
          </span>
          <span className="text-xs font-medium">Add a task to this tile</span>
        </button>
      </div>
    );
  }

  // Task linked but not yet hydrated into the slice → brief loading.
  if (!task) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // The REAL editor, bound to this tile's task.
  return <TaskEditor taskId={taskId} embedded />;
}
