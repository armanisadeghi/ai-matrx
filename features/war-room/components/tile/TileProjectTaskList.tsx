"use client";

/**
 * TileProjectTaskList
 *
 * The Task tab for a PROJECT-flavored War Room tile. Where a thread/task tile's
 * Task tab anchors on a SINGLE task (`TileTaskTab` → `TaskEditor`), a project
 * tile represents a whole project, so its Task tab is the project's task LIST:
 * browse, fast-create, and open any task in the REAL `TaskEditor`.
 *
 *   • A compact list (title + completion checkbox + priority dot) with a
 *     rapid-entry input that chains create-on-Enter.
 *   • Click a row → `useOpenTaskEditorWindow({ taskId })` via OverlayController.
 *
 * Everything persists through the canonical tasks primitives — no War Room
 * task store, no fakes:
 *   • list load → `loadProjectTasks` (parents + subtasks, agent-context slice)
 *   • list read → `selectTopLevelTasksByProjectId` (parents) +
 *                 `selectSubtasksByParent` (nested children per parent)
 *   • create    → `createTaskThunk({ title, projectId })`
 *   • toggle    → `toggleTaskCompleteThunk`
 *
 * The effective project is resolved from the foundation:
 * `selectEffectiveTileProjectId` (the tile's own project_id ?? the room's).
 */

import { useEffect, useRef, useState } from "react";
import {
  CornerDownRight,
  Eye,
  EyeOff,
  ListTodo,
  Loader2,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  loadProjectTasks,
  selectSubtasksByParent,
  selectTaskById,
  selectTopLevelTasksByProjectId,
} from "@/features/agent-context/redux/tasksSlice";
import { selectProjectById } from "@/features/agent-context/redux/projectsSlice";
import {
  createTaskThunk,
  toggleTaskCompleteThunk,
} from "@/features/tasks/redux/thunks";
import {
  selectShowCompleted,
  setShowCompleted,
} from "@/features/tasks/redux/taskUiSlice";
import { selectEffectiveTileProjectId } from "@/features/war-room/redux/selectors";
import { cn } from "@/lib/utils";

export function TileProjectTaskList({
  tileId,
  compact,
  hideProjectHeader,
  onOpenTask,
}: {
  tileId: string;
  compact?: boolean;
  /** When embedded in TileProjectTab, the overview owns project identity. */
  hideProjectHeader?: boolean;
  /** In-tile drill-down; falls back to taskEditorWindow when omitted. */
  onOpenTask?: (taskId: string) => void;
}) {
  const projectId = useAppSelector((s) =>
    selectEffectiveTileProjectId(tileId)(s),
  );

  if (!projectId) {
    return (
      <div
        className={cn(
          "grid h-full place-items-center text-center",
          !compact && "px-6",
        )}
      >
        <div className="flex max-w-[18rem] flex-col items-center gap-2">
          <span className="grid size-10 place-items-center rounded-full bg-muted/60">
            <ListTodo className="size-5 text-muted-foreground" />
          </span>
          <p className="text-xs font-medium text-muted-foreground">
            No project linked
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            Link this tile (or the room) to a project to browse and create its
            tasks here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ProjectTaskBody
      projectId={projectId}
      compact={compact}
      hideProjectHeader={hideProjectHeader}
      onOpenTask={onOpenTask}
    />
  );
}

function ProjectTaskBody({
  projectId,
  compact,
  hideProjectHeader,
  onOpenTask,
}: {
  projectId: string;
  compact?: boolean;
  hideProjectHeader?: boolean;
  onOpenTask?: (taskId: string) => void;
}) {
  const dispatch = useAppDispatch();
  const openTaskEditor = useOpenTaskEditorWindow();
  const tasks = useAppSelector((s) =>
    selectTopLevelTasksByProjectId(s, projectId),
  );
  const projectName = useAppSelector(
    (s) => selectProjectById(s, projectId)?.name ?? null,
  );
  const showCompleted = useAppSelector(selectShowCompleted);
  const [loading, setLoading] = useState(true);

  const openTask = (taskId: string) => {
    if (onOpenTask) onOpenTask(taskId);
    else openTaskEditor({ taskId });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void dispatch(loadProjectTasks({ projectId })).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch, projectId]);

  const completed = tasks.filter((t) => t.status === "completed").length;
  const visibleTasks = showCompleted
    ? tasks
    : tasks.filter((t) => t.status !== "completed");

  return (
    <div className="flex h-full min-h-0 flex-col @container/proj">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 border-b border-border/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
              compact ? "px-0" : "px-2.5",
            )}
          >
            <ListTodo className="size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate normal-case tracking-normal">
              {hideProjectHeader ? "Tasks" : (projectName ?? "Project tasks")}
            </span>
            {tasks.length > 0 && (
              <span className="shrink-0 tabular-nums text-muted-foreground/60">
                {completed}/{tasks.length}
              </span>
            )}
            {tasks.length > 0 && completed > 0 && (
              <button
                type="button"
                onClick={() => dispatch(setShowCompleted(!showCompleted))}
                title={
                  showCompleted
                    ? "Hide completed tasks"
                    : "Show completed tasks"
                }
                aria-label={
                  showCompleted
                    ? "Hide completed tasks"
                    : "Show completed tasks"
                }
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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

          <ProjectTaskCreate projectId={projectId} compact={compact} />

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && tasks.length === 0 ? (
              <div className="grid place-items-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : tasks.length === 0 ? (
              <p
                className={cn(
                  "py-3 text-xs italic text-muted-foreground",
                  compact ? "px-0" : "px-2.5",
                )}
              >
                No tasks in this project yet. Type above to add the first.
              </p>
            ) : visibleTasks.length === 0 ? (
              <p
                className={cn(
                  "py-3 text-xs italic text-muted-foreground",
                  compact ? "px-0" : "px-2.5",
                )}
              >
                All tasks completed. Use the eye icon above to show them.
              </p>
            ) : (
              <ul>
                {visibleTasks.map((task) => (
                  <ProjectTaskRow
                    key={task.id}
                    taskId={task.id}
                    onOpen={openTask}
                    showCompletedStyle={showCompleted}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectTaskCreate({
  projectId,
  compact,
}: {
  projectId: string;
  compact?: boolean;
}) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState("");
  const [inFlight, setInFlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const title = draft.trim();
    if (!title || inFlight > 0) return;
    setDraft("");
    inputRef.current?.focus();
    setInFlight((n) => n + 1);
    void dispatch(createTaskThunk({ title, projectId }))
      .unwrap()
      .then((newId) => {
        if (!newId) {
          setDraft((cur) => (cur.length === 0 ? title : cur));
        }
      })
      .catch(() => {
        setDraft((cur) => (cur.length === 0 ? title : cur));
      })
      .finally(() => {
        setInFlight((n) => n - 1);
        inputRef.current?.focus();
      });
  };

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-b border-border/40 bg-muted/20 py-1.5",
        compact ? "px-0" : "px-2.5",
      )}
    >
      <Plus className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          } else if (e.key === "Escape") {
            setDraft("");
          }
        }}
        onBlur={() => {
          if (draft.trim()) add();
        }}
        placeholder="Add task, press Enter…"
        className="h-6 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
        style={{ fontSize: "16px" }}
        aria-label="Add task to project"
      />
      {inFlight > 0 && (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-sky-500",
};

function ProjectTaskRow({
  taskId,
  onOpen,
  showCompletedStyle,
}: {
  taskId: string;
  onOpen: (taskId: string) => void;
  showCompletedStyle: boolean;
}) {
  const task = useAppSelector((s) => selectTaskById(s, taskId));
  const subtasks = useAppSelector((s) => selectSubtasksByParent(s, taskId));
  if (!task) return null;

  const visibleSubtasks = showCompletedStyle
    ? subtasks
    : subtasks.filter((t) => t.status !== "completed");

  return (
    <>
      <TaskRowBody
        taskId={taskId}
        onOpen={() => onOpen(taskId)}
        showCompletedStyle={showCompletedStyle}
      />
      {visibleSubtasks.map((sub) => (
        <TaskRowBody
          key={sub.id}
          taskId={sub.id}
          isSub
          onOpen={() => onOpen(sub.id)}
          showCompletedStyle={showCompletedStyle}
        />
      ))}
    </>
  );
}

function TaskRowBody({
  taskId,
  isSub = false,
  onOpen,
  showCompletedStyle,
}: {
  taskId: string;
  isSub?: boolean;
  onOpen: () => void;
  showCompletedStyle: boolean;
}) {
  const dispatch = useAppDispatch();
  const task = useAppSelector((s) => selectTaskById(s, taskId));
  if (!task) return null;

  const isDone = task.status === "completed";
  const dot = task.priority ? PRIORITY_DOT[task.priority] : null;

  return (
    <li
      className={cn(
        "group flex items-center gap-2 border-b border-border/30 py-1.5 pr-2.5 transition-colors hover:bg-accent/40",
        isSub ? "pl-7" : "pl-2.5",
      )}
    >
      {isSub && (
        <CornerDownRight
          className="size-3.5 shrink-0 text-muted-foreground/40"
          aria-hidden
        />
      )}
      <Checkbox
        checked={isDone}
        onCheckedChange={() =>
          dispatch(toggleTaskCompleteThunk({ taskId: task.id }))
        }
        aria-label={isDone ? "Mark incomplete" : "Mark complete"}
      />
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isSub ? "text-[13px]" : "text-sm",
          isDone && showCompletedStyle
            ? "text-muted-foreground line-through"
            : "text-foreground hover:text-primary",
        )}
        title={task.title}
      >
        {dot && (
          <span
            className={cn("size-1.5 shrink-0 rounded-full", dot)}
            aria-hidden
          />
        )}
        <span className="truncate">{task.title}</span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 data-[state=open]:opacity-100"
            title="Task options"
            aria-label="Task options"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onOpen}>
            <ListTodo className="size-3.5" />
            Open task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
