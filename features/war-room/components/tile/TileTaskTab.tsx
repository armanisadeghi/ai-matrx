"use client";

// features/war-room/components/tile/TileTaskTab.tsx
//
// Minimal Task view: the tile's anchor. Editable name, description, subtasks,
// attachments, and a comment popover — just enough to take the key actions.
// Priority / due date / advanced settings live in the full task UI (expand).

import { useEffect, useState } from "react";
import { Plus, Loader2, ListChecks, Check, X } from "lucide-react";
import EditableTaskTitle from "@/features/tasks/components/EditableTaskTitle";
import TaskAttachments from "@/features/tasks/components/TaskAttachments";
import { TaskCommentPopover } from "@/features/tasks/components/TaskCommentPopover";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectSubtasksByParent,
  selectTaskById,
} from "@/features/agent-context/redux/tasksSlice";
import {
  createSubtaskThunk,
  deleteTaskThunk,
  toggleTaskCompleteThunk,
  updateTaskFieldThunk,
} from "@/features/tasks/redux/thunks";
import { selectTileById } from "@/features/war-room/redux/selectors";
import { createTileTask, loadTileSubtasks } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";

export function TileTaskTab({ tileId }: { tileId: string; sessionId?: string }) {
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

  if (!task) {
    return (
      <div className="h-full grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <TaskBody tileId={tileId} taskId={taskId} />;
}

function TaskBody({ tileId, taskId }: { tileId: string; taskId: string }) {
  const dispatch = useAppDispatch();
  const task = useAppSelector((s) => selectTaskById(s, taskId));
  const subtasks = useAppSelector((s) => selectSubtasksByParent(s, taskId));
  const [desc, setDesc] = useState(task?.description ?? "");
  const [newSubtask, setNewSubtask] = useState("");

  useEffect(() => {
    setDesc(task?.description ?? "");
  }, [taskId, task?.description]);

  // Ensure subtasks are loaded into the slice (survives fresh room loads).
  useEffect(() => {
    dispatch(loadTileSubtasks(taskId));
  }, [taskId, dispatch]);

  if (!task) return null;

  async function addSubtask() {
    const title = newSubtask.trim();
    if (!title) return;
    setNewSubtask("");
    await dispatch(createSubtaskThunk({ parentTaskId: taskId, title }));
  }

  return (
    <div className="h-full overflow-y-auto p-2.5 flex flex-col gap-2.5">
      {/* Name */}
      <EditableTaskTitle
        title={task.title}
        completed={task.status === "completed"}
        onSave={async (next) => {
          await dispatch(updateTaskFieldThunk({ taskId, patch: { title: next } }));
        }}
        onToggleComplete={() => dispatch(toggleTaskCompleteThunk({ taskId }))}
      />

      {/* Description */}
      <ProTextarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={() => {
          if ((task?.description ?? "") !== desc) {
            dispatch(updateTaskFieldThunk({ taskId, patch: { description: desc } }));
          }
        }}
        floatingLabel="Description"
        showCopyButton={false}
        autoGrow
        minHeight={48}
        maxHeight={140}
        className="text-sm"
      />

      {/* Subtasks */}
      <div className="flex flex-col gap-1">
        {subtasks.map((st) => (
          <div key={st.id} className="group/sub flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => dispatch(toggleTaskCompleteThunk({ taskId: st.id }))}
              className={cn(
                "grid place-items-center size-4 shrink-0 rounded border transition-colors",
                st.status === "completed"
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-border hover:border-primary",
              )}
              aria-label="Toggle subtask"
            >
              {st.status === "completed" ? <Check className="size-3" /> : null}
            </button>
            <span
              className={cn(
                "text-xs flex-1 min-w-0 truncate",
                st.status === "completed"
                  ? "line-through text-muted-foreground"
                  : "text-foreground",
              )}
            >
              {st.title}
            </span>
            <button
              type="button"
              onClick={() =>
                dispatch(
                  deleteTaskThunk({ taskId: st.id, projectId: st.project_id ?? "" }),
                )
              }
              className="grid place-items-center size-5 rounded text-muted-foreground opacity-0 group-hover/sub:opacity-100 hover:text-destructive transition-all"
              aria-label="Delete subtask"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <Plus className="size-3.5 text-muted-foreground shrink-0" />
          <input
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addSubtask();
              }
            }}
            placeholder="Add subtask"
            className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none py-0.5"
          />
        </div>
      </div>

      {/* Attachments */}
      <TaskAttachments taskId={taskId} />

      {/* Footer actions */}
      <div className="mt-auto pt-1 border-t border-border/60 flex items-center">
        <TaskCommentPopover taskId={taskId} />
      </div>
    </div>
  );
}
