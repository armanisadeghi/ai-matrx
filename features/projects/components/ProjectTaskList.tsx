"use client";

/**
 * ProjectTaskList — the heart of the Project Workspace.
 *
 * A clean Things/Linear-style list of a project's tasks: grouped Open / Done,
 * with nested subtasks (parent_task_id) drawn with the same rounded-elbow
 * connectors as OrgScopeTree. Each row: status checkbox, title (→ /tasks/[id]),
 * priority pill, due date (red if overdue). Inline quick-add per group + per
 * task (subtask). Self-fetches via taskService (no global slice coupling).
 */

import React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  ChevronRight,
  CircleCheck,
  Circle,
  CornerDownRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getProjectTasks,
  createTask,
  updateTask,
} from "@/features/tasks/services/taskService";
import type { DatabaseTask } from "@/features/tasks/types/database";

const PRIORITY_STYLE: Record<string, string> = {
  high: "text-red-600 dark:text-red-400 border-red-300 dark:border-red-800",
  medium: "text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-800",
  low: "text-sky-600 dark:text-sky-400 border-sky-300 dark:border-sky-800",
};

function isDone(t: DatabaseTask): boolean {
  return t.status === "completed";
}
function isOverdue(t: DatabaseTask): boolean {
  return !isDone(t) && !!t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
}

export function ProjectTaskList({
  projectId,
  organizationId,
  onCountsChange,
}: {
  projectId: string;
  organizationId: string | null;
  /** Notifies the parent of {open, done} counts for the hero stats. */
  onCountsChange?: (counts: { open: number; done: number }) => void;
}) {
  const router = useRouter();
  const [tasks, setTasks] = React.useState<DatabaseTask[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reloadTick, setReloadTick] = React.useState(0);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [newTitle, setNewTitle] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [showDone, setShowDone] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows = await getProjectTasks(projectId);
      if (!cancelled) {
        setTasks(rows);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadTick]);

  const reload = () => setReloadTick((t) => t + 1);

  const topLevel = tasks.filter((t) => !t.parent_task_id);
  const childrenOf = (id: string) => tasks.filter((t) => t.parent_task_id === id);
  const open = topLevel.filter((t) => !isDone(t));
  const done = topLevel.filter((t) => isDone(t));

  React.useEffect(() => {
    onCountsChange?.({
      open: tasks.filter((t) => !isDone(t)).length,
      done: tasks.filter((t) => isDone(t)).length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  async function toggle(t: DatabaseTask) {
    setBusyId(t.id);
    const next = isDone(t) ? "incomplete" : "completed";
    // optimistic
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    const res = await updateTask(t.id, { status: next });
    setBusyId(null);
    if (!res) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
      toast.error("Couldn't update the task.");
    }
  }

  async function addTopLevel() {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    const res = await createTask({
      title,
      project_id: projectId,
      organization_id: organizationId,
      status: "incomplete",
    });
    if (res) reload();
    else toast.error("Couldn't add the task.");
  }

  async function addSubtask(parent: DatabaseTask, title: string) {
    const t = title.trim();
    if (!t) return;
    // Set project_id too so the subtask is returned by getProjectTasks (which
    // filters by project_id) — createSubtask alone would leave it null/hidden.
    const res = await createTask({
      title: t,
      parent_task_id: parent.id,
      project_id: projectId,
      organization_id: organizationId,
      status: "incomplete",
    });
    if (res) reload();
    else toast.error("Couldn't add the subtask.");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Open tasks */}
      <ul className="space-y-0.5">
        {open.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            subtasks={childrenOf(t.id)}
            busyId={busyId}
            onToggle={toggle}
            onOpen={(id) => router.push(`/tasks/${id}`)}
            onAddSubtask={addSubtask}
          />
        ))}
      </ul>

      {/* Inline quick-add */}
      {adding ? (
        <div className="flex items-center gap-2 pl-1">
          <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          <Input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTopLevel();
              if (e.key === "Escape") {
                setAdding(false);
                setNewTitle("");
              }
            }}
            onBlur={() => {
              if (newTitle.trim()) addTopLevel();
              else setAdding(false);
            }}
            placeholder="Task title, then Enter…"
            className="h-8"
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground py-1 pl-1"
        >
          <Plus className="h-4 w-4" />
          Add task
        </button>
      )}

      {open.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground italic pl-1">No open tasks.</p>
      )}

      {/* Done section */}
      {done.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowDone((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showDone ? "rotate-90" : ""}`} />
            Done · {done.length}
          </button>
          {showDone && (
            <ul className="space-y-0.5 mt-1">
              {done.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  subtasks={childrenOf(t.id)}
                  busyId={busyId}
                  onToggle={toggle}
                  onOpen={(id) => router.push(`/tasks/${id}`)}
                  onAddSubtask={addSubtask}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  subtasks,
  busyId,
  onToggle,
  onOpen,
  onAddSubtask,
}: {
  task: DatabaseTask;
  subtasks: DatabaseTask[];
  busyId: string | null;
  onToggle: (t: DatabaseTask) => void;
  onOpen: (id: string) => void;
  onAddSubtask: (parent: DatabaseTask, title: string) => void;
}) {
  const [addingSub, setAddingSub] = React.useState(false);
  const [subTitle, setSubTitle] = React.useState("");
  const done = task.status === "completed";

  return (
    <li>
      <div className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/40 transition-colors">
        <button
          onClick={() => onToggle(task)}
          disabled={busyId === task.id}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title={done ? "Mark incomplete" : "Mark complete"}
        >
          {busyId === task.id ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          ) : done ? (
            <CircleCheck className="h-[18px] w-[18px] text-emerald-500" />
          ) : (
            <Circle className="h-[18px] w-[18px]" />
          )}
        </button>
        <button
          onClick={() => onOpen(task.id)}
          className={`flex-1 min-w-0 text-left text-sm truncate ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
          title={task.title}
        >
          {task.title}
        </button>
        {task.priority && (
          <Badge variant="outline" className={`text-[10px] shrink-0 ${PRIORITY_STYLE[task.priority] ?? ""}`}>
            {task.priority}
          </Badge>
        )}
        {task.due_date && (
          <span className={`text-[11px] shrink-0 ${isOverdue(task) ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
            {new Date(task.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        )}
        <button
          onClick={() => setAddingSub((s) => !s)}
          className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground transition-all"
          title="Add subtask"
        >
          <CornerDownRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Subtasks (one level), elbow-connected */}
      {(subtasks.length > 0 || addingSub) && (
        <ul className="ml-[1.4rem] border-l border-border pl-3 mt-0.5 space-y-0.5">
          {subtasks.map((st) => (
            <li key={st.id}>
              <div className="group flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-accent/40">
                <button
                  onClick={() => onToggle(st)}
                  disabled={busyId === st.id}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  {st.status === "completed" ? (
                    <CircleCheck className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => onOpen(st.id)}
                  className={`flex-1 min-w-0 text-left text-[13px] truncate ${st.status === "completed" ? "text-muted-foreground line-through" : "text-foreground"}`}
                >
                  {st.title}
                </button>
              </div>
            </li>
          ))}
          {addingSub && (
            <li>
              <Input
                autoFocus
                value={subTitle}
                onChange={(e) => setSubTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onAddSubtask(task, subTitle);
                    setSubTitle("");
                    setAddingSub(false);
                  }
                  if (e.key === "Escape") {
                    setAddingSub(false);
                    setSubTitle("");
                  }
                }}
                onBlur={() => {
                  if (subTitle.trim()) onAddSubtask(task, subTitle);
                  setAddingSub(false);
                  setSubTitle("");
                }}
                placeholder="Subtask title…"
                className="h-7 text-[13px]"
              />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}
