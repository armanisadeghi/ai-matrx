"use client";

/**
 * TileProjectTaskList
 *
 * The Task tab for a PROJECT-flavored War Room tile. Where a thread/task tile's
 * Task tab anchors on a SINGLE task (`TileTaskTab` → `TaskEditor`), a project
 * tile represents a whole project, so its Task tab is the project's task LIST:
 * browse, fast-create, and open any task in the REAL `TaskEditor`.
 *
 * Layout mirrors the subtask experience (`SubtaskRail` + `SubtaskDetailPane` +
 * `SubtaskWindow`) so the two surfaces feel identical:
 *   • A compact list (title + completion checkbox + priority dot) with a
 *     rapid-entry input that chains create-on-Enter.
 *   • Click a row → the canonical `TaskEditor` opens in a detail pane BESIDE
 *     the list on wide tiles (@[34rem]) / OVER it on narrow tiles.
 *   • "⋯ → Open in window" pops the same editor into a floating `SubtaskWindow`
 *     (a generic TaskEditor-in-a-window, not subtask-specific). Several coexist.
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

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  CornerDownRight,
  Eye,
  EyeOff,
  ListTodo,
  Loader2,
  MoreHorizontal,
  PanelRightOpen,
  Plus,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TaskEditor from "@/features/tasks/components/TaskEditor";
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
import { SubtaskWindow } from "./SubtaskWindow";

export function TileProjectTaskList({ tileId }: { tileId: string }) {
  const projectId = useAppSelector((s) =>
    selectEffectiveTileProjectId(tileId)(s),
  );

  if (!projectId) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
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

  return <ProjectTaskBody projectId={projectId} />;
}

function ProjectTaskBody({ projectId }: { projectId: string }) {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector((s) =>
    selectTopLevelTasksByProjectId(s, projectId),
  );
  const projectName = useAppSelector(
    (s) => selectProjectById(s, projectId)?.name ?? null,
  );
  const showCompleted = useAppSelector(selectShowCompleted);

  // The task selected for the in-tile detail pane (null → list only).
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // Floating task windows — multiple may coexist.
  const [windowIds, setWindowIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Load ALL of the project's tasks (parents + subtasks) into the slice on
  // mount / project change so the list can render the nested subtask tree.
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

  const openWindow = (taskId: string) => {
    setWindowIds((ids) => (ids.includes(taskId) ? ids : [...ids, taskId]));
    // Opening a window supersedes the in-tile pane for that task.
    setOpenTaskId((cur) => (cur === taskId ? null : cur));
  };
  const closeWindow = (taskId: string) =>
    setWindowIds((ids) => ids.filter((id) => id !== taskId));

  const completed = tasks.filter((t) => t.status === "completed").length;
  const visibleTasks = showCompleted
    ? tasks
    : tasks.filter((t) => t.status !== "completed");

  return (
    <div className="flex h-full min-h-0 flex-col @container/proj">
      <div className="flex min-h-0 flex-1 @[34rem]/proj:flex-row">
        {/* List column. On narrow tiles it yields to the detail pane; on wide
            tiles list + detail sit side-by-side. */}
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            openTaskId !== null && "hidden @[34rem]/proj:flex",
          )}
        >
          {/* Header — project name + completion count. */}
          <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border/60 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <ListTodo className="size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate normal-case tracking-normal">
              {projectName ?? "Project tasks"}
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

          <ProjectTaskCreate projectId={projectId} />

          {/* List */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && tasks.length === 0 ? (
              <div className="grid place-items-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : tasks.length === 0 ? (
              <p className="px-2.5 py-3 text-xs italic text-muted-foreground">
                No tasks in this project yet. Type above to add the first.
              </p>
            ) : visibleTasks.length === 0 ? (
              <p className="px-2.5 py-3 text-xs italic text-muted-foreground">
                All tasks completed. Use the eye icon above to show them.
              </p>
            ) : (
              <ul>
                {visibleTasks.map((task) => (
                  <ProjectTaskRow
                    key={task.id}
                    taskId={task.id}
                    isOpen={openTaskId === task.id}
                    openTaskId={openTaskId}
                    onOpen={() => setOpenTaskId(task.id)}
                    onOpenWindow={() => openWindow(task.id)}
                    onOpenTask={(id) => setOpenTaskId(id)}
                    onOpenTaskWindow={(id) => openWindow(id)}
                    showCompletedStyle={showCompleted}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Detail pane — beside the list on wide tiles; full stacked area on
            narrow tiles (list hidden). Mirrors SubtaskDetailPane chrome. */}
        {openTaskId !== null && (
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col border-t border-border/60",
              "@[34rem]/proj:w-80 @[34rem]/proj:flex-none @[34rem]/proj:shrink-0 @[34rem]/proj:border-l @[34rem]/proj:border-t-0",
            )}
          >
            <ProjectTaskDetailPane
              taskId={openTaskId}
              onClose={() => setOpenTaskId(null)}
              onOpenInWindow={() => openWindow(openTaskId)}
            />
          </div>
        )}
      </div>

      {/* Floating, draggable task windows — independent of tile bounds. */}
      {windowIds.map((id) => (
        <SubtaskWindow
          key={id}
          subtaskId={id}
          onClose={() => closeWindow(id)}
        />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Rapid task creation — type + Enter chains; new task lands in the list.
 * ──────────────────────────────────────────────────────────────────────── */

function ProjectTaskCreate({ projectId }: { projectId: string }) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const add = async (): Promise<boolean> => {
    const title = draft.trim();
    if (!title || adding) return false;
    setAdding(true);
    try {
      const newId = await dispatch(
        createTaskThunk({ title, projectId }),
      ).unwrap();
      if (newId) {
        setDraft("");
        return true;
      }
      return false;
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-muted/20 px-2.5 py-1.5">
      <Plus className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            await add();
          } else if (e.key === "Escape") {
            setDraft("");
          }
        }}
        onBlur={() => {
          if (draft.trim()) void add();
        }}
        placeholder="Add task, press Enter…"
        className="h-6 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
        // 16px prevents the iOS focus-zoom on responsive web.
        style={{ fontSize: "16px" }}
        disabled={adding}
        aria-label="Add task to project"
      />
      {adding && (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * A single list row — checkbox + priority dot + title + ⋯ menu.
 * ──────────────────────────────────────────────────────────────────────── */

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-sky-500",
};

function ProjectTaskRow({
  taskId,
  isOpen,
  openTaskId,
  onOpen,
  onOpenWindow,
  onOpenTask,
  onOpenTaskWindow,
  showCompletedStyle,
}: {
  taskId: string;
  isOpen: boolean;
  openTaskId: string | null;
  onOpen: () => void;
  onOpenWindow: () => void;
  onOpenTask: (id: string) => void;
  onOpenTaskWindow: (id: string) => void;
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
        isOpen={isOpen}
        onOpen={onOpen}
        onOpenWindow={onOpenWindow}
        showCompletedStyle={showCompletedStyle}
      />
      {visibleSubtasks.map((sub) => (
        <TaskRowBody
          key={sub.id}
          taskId={sub.id}
          isSub
          isOpen={openTaskId === sub.id}
          onOpen={() => onOpenTask(sub.id)}
          onOpenWindow={() => onOpenTaskWindow(sub.id)}
          showCompletedStyle={showCompletedStyle}
        />
      ))}
    </>
  );
}

function TaskRowBody({
  taskId,
  isSub = false,
  isOpen,
  onOpen,
  onOpenWindow,
  showCompletedStyle,
}: {
  taskId: string;
  isSub?: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onOpenWindow: () => void;
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
        isOpen && "bg-accent/50",
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
            Open detail
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenWindow}>
            <PanelRightOpen className="size-3.5" />
            Open in window
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * In-tile detail pane — the REAL TaskEditor bound to the selected task.
 * Mirrors SubtaskDetailPane chrome (back / title / open-in-window / close).
 * ──────────────────────────────────────────────────────────────────────── */

function ProjectTaskDetailPane({
  taskId,
  onClose,
  onOpenInWindow,
}: {
  taskId: string;
  onClose: () => void;
  onOpenInWindow: () => void;
}) {
  const title = useAppSelector(
    (s) => selectTaskById(s, taskId)?.title || "Task",
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 bg-card/50 pl-1 pr-1.5">
        <button
          type="button"
          onClick={onClose}
          title="Back to tasks"
          aria-label="Back to tasks"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <ListTodo className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{title}</span>
        </span>
        <button
          type="button"
          onClick={onOpenInWindow}
          title="Open in floating window"
          aria-label="Open in floating window"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PanelRightOpen className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          aria-label="Close task"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* The REAL editor, bound to this task. */}
      <div className="min-h-0 flex-1">
        <TaskEditor taskId={taskId} embedded key={taskId} />
      </div>
    </div>
  );
}
