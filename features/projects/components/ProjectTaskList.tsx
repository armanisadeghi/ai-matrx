"use client";

/**
 * ProjectTaskList — the heart of the Project Workspace.
 *
 * A compact, scannable TABLE of a project's tasks (Task / Priority / Due),
 * grouped Open / Done, with nested subtasks (parent_task_id) as indented rows.
 * Status checkbox + clickable title (→ /tasks/[id]); inline quick-add for tasks
 * and per-task subtasks. Self-fetches via taskService (no global slice coupling).
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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
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

const isDone = (t: DatabaseTask) => t.status === "completed";
const isOverdue = (t: DatabaseTask) =>
  !isDone(t) && !!t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());

export function ProjectTaskList({
  projectId,
  organizationId,
  onCountsChange,
}: {
  projectId: string;
  organizationId: string | null;
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
  const [addingSubFor, setAddingSubFor] = React.useState<string | null>(null);
  const [subTitle, setSubTitle] = React.useState("");

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

  async function addSubtask(parentId: string) {
    const t = subTitle.trim();
    setSubTitle("");
    setAddingSubFor(null);
    if (!t) return;
    // project_id set so getProjectTasks (filters by project_id) returns it.
    const res = await createTask({
      title: t,
      parent_task_id: parentId,
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

  const renderRows = (list: DatabaseTask[]) =>
    list.flatMap((t) => {
      const subs = childrenOf(t.id);
      const rows: React.ReactNode[] = [
        <TaskTableRow
          key={t.id}
          task={t}
          busyId={busyId}
          onToggle={toggle}
          onOpen={(id) => router.push(`/tasks/${id}`)}
          onAddSubtask={() => {
            setAddingSubFor(t.id);
            setSubTitle("");
          }}
        />,
      ];
      for (const st of subs) {
        rows.push(
          <TaskTableRow
            key={st.id}
            task={st}
            isSub
            busyId={busyId}
            onToggle={toggle}
            onOpen={(id) => router.push(`/tasks/${id}`)}
          />,
        );
      }
      if (addingSubFor === t.id) {
        rows.push(
          <TableRow key={`${t.id}-add`} className="hover:bg-transparent">
            <TableCell className="py-1.5">
              <div className="flex items-center gap-2 pl-7">
                <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                <Input
                  autoFocus
                  value={subTitle}
                  onChange={(e) => setSubTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addSubtask(t.id);
                    if (e.key === "Escape") {
                      setAddingSubFor(null);
                      setSubTitle("");
                    }
                  }}
                  onBlur={() => addSubtask(t.id)}
                  placeholder="Subtask title…"
                  className="h-7 text-[13px]"
                />
              </div>
            </TableCell>
            <TableCell />
            <TableCell />
          </TableRow>,
        );
      }
      return rows;
    });

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9">Task</TableHead>
              <TableHead className="h-9 w-28">Priority</TableHead>
              <TableHead className="h-9 w-28">Due</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {open.length === 0 && !adding ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="text-sm text-muted-foreground italic py-3">
                  No open tasks.
                </TableCell>
              </TableRow>
            ) : (
              renderRows(open)
            )}

            {/* Inline quick-add row */}
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={3} className="py-1.5">
                {adding ? (
                  <div className="flex items-center gap-2">
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
                      className="h-8 max-w-md"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setAdding(true)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" />
                    Add task
                  </button>
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Done section */}
      {done.length > 0 && (
        <div>
          <button
            onClick={() => setShowDone((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-1"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showDone ? "rotate-90" : ""}`} />
            Done · {done.length}
          </button>
          {showDone && (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableBody>{renderRows(done)}</TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskTableRow({
  task,
  isSub,
  busyId,
  onToggle,
  onOpen,
  onAddSubtask,
}: {
  task: DatabaseTask;
  isSub?: boolean;
  busyId: string | null;
  onToggle: (t: DatabaseTask) => void;
  onOpen: (id: string) => void;
  onAddSubtask?: () => void;
}) {
  const done = task.status === "completed";
  return (
    <TableRow className="group">
      <TableCell className="py-1.5">
        <div className={`flex items-center gap-2 ${isSub ? "pl-7" : ""}`}>
          {isSub && <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
          <button
            onClick={() => onToggle(task)}
            disabled={busyId === task.id}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title={done ? "Mark incomplete" : "Mark complete"}
          >
            {busyId === task.id ? (
              <Loader2 className={`${isSub ? "h-4 w-4" : "h-[18px] w-[18px]"} animate-spin`} />
            ) : done ? (
              <CircleCheck className={`${isSub ? "h-4 w-4" : "h-[18px] w-[18px]"} text-emerald-500`} />
            ) : (
              <Circle className={isSub ? "h-4 w-4" : "h-[18px] w-[18px]"} />
            )}
          </button>
          <button
            onClick={() => onOpen(task.id)}
            className={`flex-1 min-w-0 text-left ${isSub ? "text-[13px]" : "text-sm"} truncate ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
            title={task.title}
          >
            {task.title}
          </button>
          {!isSub && onAddSubtask && (
            <button
              onClick={onAddSubtask}
              className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground transition-all"
              title="Add subtask"
            >
              <CornerDownRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </TableCell>
      <TableCell className="py-1.5">
        {task.priority ? (
          <Badge variant="outline" className={`text-[10px] ${PRIORITY_STYLE[task.priority] ?? ""}`}>
            {task.priority}
          </Badge>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </TableCell>
      <TableCell className="py-1.5">
        {task.due_date ? (
          <span className={`text-[12px] ${isOverdue(task) ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
            {new Date(task.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
