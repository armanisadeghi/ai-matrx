"use client";

/**
 * SubtaskRail
 *
 * The enhanced subtask management surface for a War Room tile's task. It is
 * the fast-entry + navigation layer the bare `TaskEditor` list lacks:
 *
 *   • Rapid entry — the "Add subtask" input is always present and, after
 *     Enter creates a subtask, the cursor stays in a fresh empty line so the
 *     user can chain type → Enter → type → Enter with no extra clicks. When
 *     the rail mounts via the "+" affordance the input auto-focuses.
 *   • Click a subtask → opens it in the in-tile detail pane (via `onOpenPane`).
 *   • Click a subtask → `useOpenTaskEditorWindow({ taskId })` (overlay).
 *   • Checkbox toggles completion; trash deletes — both via existing thunks.
 *
 * All persistence reuses the canonical task thunks unchanged
 * (`createSubtaskThunk` / `toggleTaskCompleteThunk` / `deleteTaskThunk`).
 */

import { useEffect, useState } from "react";
import {
  CheckSquare,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  PanelRightOpen,
  Plus,
  Trash2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectSubtasksByParent } from "@/features/agent-context/redux/tasksSlice";
import {
  createSubtaskThunk,
  deleteTaskThunk,
  toggleTaskCompleteThunk,
} from "@/features/tasks/redux/thunks";
import {
  selectShowCompleted,
  setShowCompleted,
} from "@/features/tasks/redux/taskUiSlice";
import { cn } from "@/lib/utils";
import { useRefocusInputAfterAsync } from "@/features/tasks/hooks/useRefocusInputAfterAsync";

export function SubtaskRail({
  taskId,
  projectId,
  onOpenPane,
  onOpenWindow,
  /** Auto-focus the add input on mount (set when revealed by a "+" click). */
  autoFocus,
}: {
  taskId: string;
  projectId: string | null;
  onOpenPane: (subtaskId: string) => void;
  onOpenWindow: (subtaskId: string) => void;
  autoFocus?: boolean;
}) {
  const dispatch = useAppDispatch();
  const subtasks = useAppSelector((s) => selectSubtasksByParent(s, taskId));
  const showCompleted = useAppSelector(selectShowCompleted);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const { inputRef, scheduleRefocus } = useRefocusInputAfterAsync(adding);

  // Auto-focus the entry line when first revealed so the user types at once.
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const completed = subtasks.filter((s) => s.status === "completed").length;
  const visibleSubtasks = showCompleted
    ? subtasks
    : subtasks.filter((s) => s.status !== "completed");

  const addSubtask = async (): Promise<boolean> => {
    const title = draft.trim();
    if (!title || adding) return false;
    setAdding(true);
    try {
      const newId = await dispatch(
        createSubtaskThunk({ parentTaskId: taskId, title }),
      ).unwrap();
      if (newId) {
        setDraft("");
        scheduleRefocus();
        return true;
      }
      return false;
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-card/30">
      {/* Header */}
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/60 pl-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <CheckSquare className="size-3.5 text-primary" />
        <span>Subtasks</span>
        {subtasks.length > 0 && (
          <span className="tabular-nums text-muted-foreground/60">
            {completed}/{subtasks.length}
          </span>
        )}
        {subtasks.length > 0 && completed > 0 && (
          <button
            type="button"
            onClick={() => dispatch(setShowCompleted(!showCompleted))}
            title={
              showCompleted
                ? "Hide completed subtasks"
                : "Show completed subtasks"
            }
            aria-label={
              showCompleted
                ? "Hide completed subtasks"
                : "Show completed subtasks"
            }
            className={cn(
              "ml-auto grid size-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              showCompleted ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {showCompleted ? (
              <Eye className="size-3.5" />
            ) : (
              <EyeOff className="size-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Rapid entry — always visible, stays focused for chained adds. */}
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/40 bg-muted/20 pl-1.5 pr-2">
        <Plus className="size-3 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addSubtask();
            }
          }}
          onBlur={() => {
            if (draft.trim()) void addSubtask();
          }}
          placeholder="Add subtask, press Enter…"
          className="h-6 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
          style={{ fontSize: "16px" }}
          disabled={adding}
          aria-label="Add subtask"
        />
        {adding && (
          <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {subtasks.length === 0 ? (
          <p className="py-1.5 pl-1.5 pr-2 text-[11px] italic text-muted-foreground">
            No subtasks yet. Type above to add your first.
          </p>
        ) : visibleSubtasks.length === 0 ? (
          <p className="py-1.5 pl-1.5 pr-2 text-[11px] italic text-muted-foreground">
            All subtasks completed. Use the eye icon above to show them.
          </p>
        ) : (
          <ul>
            {visibleSubtasks.map((st) => {
              const isDone = st.status === "completed";
              return (
                <li
                  key={st.id}
                  className="group flex h-7 items-center gap-1.5 border-b border-border/30 pl-1.5 pr-2 transition-colors hover:bg-accent/40"
                >
                  <Checkbox
                    checked={isDone}
                    onCheckedChange={() =>
                      dispatch(toggleTaskCompleteThunk({ taskId: st.id }))
                    }
                    aria-label={isDone ? "Mark incomplete" : "Mark complete"}
                    className="size-3.5"
                  />
                  <button
                    type="button"
                    onClick={() => onOpenPane(st.id)}
                    className={cn(
                      "min-w-0 flex-1 truncate rounded-sm text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isDone && showCompleted
                        ? "text-muted-foreground line-through"
                        : "text-foreground hover:text-primary",
                    )}
                    title={st.title}
                  >
                    {st.title}
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 data-[state=open]:opacity-100"
                        title="Subtask options"
                        aria-label="Subtask options"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => onOpenPane(st.id)}>
                        <CheckSquare className="size-3.5" />
                        Open task
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onOpenWindow(st.id)}>
                        <PanelRightOpen className="size-3.5" />
                        Open in window
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          dispatch(
                            deleteTaskThunk({
                              taskId: st.id,
                              projectId: projectId ?? "__unassigned__",
                            }),
                          )
                        }
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                        Delete subtask
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
