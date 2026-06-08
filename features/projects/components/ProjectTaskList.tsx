"use client";

/**
 * ProjectTaskList — the heart of the Project Workspace.
 *
 * A compact, scannable TABLE of a project's tasks (Task / Priority / Due),
 * grouped Open / Done, with nested subtasks (parent_task_id) as indented rows.
 * EVERY field is editable inline (Linear / Things style): click the title to
 * rename, change priority via an inline picker, set/clear the due date via an
 * inline calendar — on existing rows AND subtasks. The quick-add row lets you
 * set name + priority + due (and, behind Advanced, a description) BEFORE adding.
 * The trailing actions column opens the full task editor at /tasks/[id].
 *
 * All edits go through taskService.updateTask / createTask with optimistic
 * updates, revert-on-failure, and toast.error feedback. Self-fetches via
 * taskService (no global slice coupling).
 */

import React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  ChevronRight,
  ChevronDown,
  CircleCheck,
  Circle,
  CornerDownRight,
  ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/utils/cn";
import { toast } from "sonner";
import {
  getProjectTasks,
  createTask,
  updateTask,
  type UpdateTaskInput,
} from "@/features/tasks/services/taskService";
import type { DatabaseTask } from "@/features/tasks/types/database";
import {
  TaskPriorityPicker,
  type TaskPriority,
} from "@/features/tasks/components/TaskPriorityPicker";
import { TaskDueDatePicker } from "@/features/tasks/components/TaskDueDatePicker";
import { isDateOnlyOverdue } from "@/utils/dateOnly";

const isDone = (t: DatabaseTask) => t.status === "completed";
const isOverdue = (t: DatabaseTask) => !isDone(t) && isDateOnlyOverdue(t.due_date);

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
  const childrenOf = (id: string) =>
    tasks.filter((t) => t.parent_task_id === id);
  const open = topLevel.filter((t) => !isDone(t));
  const done = topLevel.filter((t) => isDone(t));

  React.useEffect(() => {
    onCountsChange?.({
      open: tasks.filter((t) => !isDone(t)).length,
      done: tasks.filter((t) => isDone(t)).length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  /**
   * Optimistic field patch shared by every inline editor. Applies `patch`
   * immediately, calls updateTask, and reverts + toasts on failure.
   */
  async function patchField(
    task: DatabaseTask,
    patch: Pick<UpdateTaskInput, "title" | "status" | "due_date" | "priority">,
  ) {
    const prev = { ...task };
    setBusyId(task.id);
    setTasks((cur) =>
      cur.map((x) => (x.id === task.id ? { ...x, ...patch } : x)),
    );
    const res = await updateTask(task.id, patch);
    setBusyId(null);
    if (!res) {
      setTasks((cur) => cur.map((x) => (x.id === task.id ? prev : x)));
      toast.error("Couldn't update the task.");
    }
  }

  async function toggle(t: DatabaseTask) {
    await patchField(t, {
      status: isDone(t) ? "incomplete" : "completed",
    });
  }

  async function renameTask(t: DatabaseTask, title: string) {
    const next = title.trim();
    if (!next || next === t.title) return;
    await patchField(t, { title: next });
  }

  async function setPriority(t: DatabaseTask, priority: TaskPriority) {
    if (priority === (t.priority ?? null)) return;
    await patchField(t, { priority });
  }

  async function setDueDate(t: DatabaseTask, due: string | null) {
    if (due === (t.due_date ?? null)) return;
    await patchField(t, { due_date: due });
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
          onRename={renameTask}
          onPriority={setPriority}
          onDueDate={setDueDate}
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
            onRename={renameTask}
            onPriority={setPriority}
            onDueDate={setDueDate}
            onOpen={(id) => router.push(`/tasks/${id}`)}
          />,
        );
      }
      if (addingSubFor === t.id) {
        rows.push(
          <TableRow key={`${t.id}-add`} className="hover:bg-transparent">
            <TableCell className="py-1.5" colSpan={4}>
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
                  className="h-7 text-[13px] max-w-md"
                  style={{ fontSize: "16px" }}
                />
              </div>
            </TableCell>
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
              <TableHead className="h-9 w-32">Priority</TableHead>
              <TableHead className="h-9 w-28">Due</TableHead>
              <TableHead className="h-9 w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {open.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={4}
                  className="text-sm text-muted-foreground italic py-3"
                >
                  No open tasks.
                </TableCell>
              </TableRow>
            ) : (
              renderRows(open)
            )}

            {/* Inline quick-add row — set name + priority + due before adding */}
            <QuickAddRow
              projectId={projectId}
              organizationId={organizationId}
              onAdded={reload}
            />
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
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                showDone && "rotate-90",
              )}
            />
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

/* ─── Task row ──────────────────────────────────────────────────────────── */

function TaskTableRow({
  task,
  isSub,
  busyId,
  onToggle,
  onRename,
  onPriority,
  onDueDate,
  onOpen,
  onAddSubtask,
}: {
  task: DatabaseTask;
  isSub?: boolean;
  busyId: string | null;
  onToggle: (t: DatabaseTask) => void;
  onRename: (t: DatabaseTask, title: string) => void;
  onPriority: (t: DatabaseTask, p: TaskPriority) => void;
  onDueDate: (t: DatabaseTask, due: string | null) => void;
  onOpen: (id: string) => void;
  onAddSubtask?: () => void;
}) {
  const done = task.status === "completed";
  return (
    <TableRow className="group">
      <TableCell className="py-1.5">
        <div className={cn("flex items-center gap-2", isSub && "pl-7")}>
          {isSub && (
            <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
          )}
          <button
            onClick={() => onToggle(task)}
            disabled={busyId === task.id}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title={done ? "Mark incomplete" : "Mark complete"}
          >
            {busyId === task.id ? (
              <Loader2
                className={cn(
                  isSub ? "h-4 w-4" : "h-[18px] w-[18px]",
                  "animate-spin",
                )}
              />
            ) : done ? (
              <CircleCheck
                className={cn(
                  isSub ? "h-4 w-4" : "h-[18px] w-[18px]",
                  "text-emerald-500",
                )}
              />
            ) : (
              <Circle className={isSub ? "h-4 w-4" : "h-[18px] w-[18px]"} />
            )}
          </button>
          <InlineTitle
            value={task.title}
            done={done}
            isSub={isSub}
            onCommit={(next) => onRename(task, next)}
          />
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
        <TaskPriorityPicker
          value={(task.priority ?? null) as TaskPriority}
          onChange={(p) => onPriority(task, p)}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <TaskDueDatePicker
          value={task.due_date}
          overdue={isOverdue(task)}
          onChange={(due) => onDueDate(task, due)}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <button
          onClick={() => onOpen(task.id)}
          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground transition-all"
          title="Open task"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </TableCell>
    </TableRow>
  );
}

/* ─── Inline title (click to edit) ──────────────────────────────────────── */

function InlineTitle({
  value,
  done,
  isSub,
  onCommit,
}: {
  value: string;
  done: boolean;
  isSub?: boolean;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  // Keep the draft in sync when the underlying value changes and we're not
  // actively editing (e.g. an optimistic update from elsewhere landed).
  React.useEffect(() => {
    if (!editing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(value);
    }
  }, [value, editing]);

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onCommit(draft);
            setEditing(false);
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        onBlur={() => {
          onCommit(draft);
          setEditing(false);
        }}
        className={cn("h-7 flex-1 min-w-0", isSub ? "text-[13px]" : "text-sm")}
        style={{ fontSize: "16px" }}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={cn(
        "flex-1 min-w-0 text-left truncate rounded px-1 -mx-1 hover:bg-accent/50",
        isSub ? "text-[13px]" : "text-sm",
        done ? "text-muted-foreground line-through" : "text-foreground",
      )}
      title={value}
    >
      {value}
    </button>
  );
}

/* ─── Quick-add row ─────────────────────────────────────────────────────── */

function QuickAddRow({
  projectId,
  organizationId,
  onAdded,
}: {
  projectId: string;
  organizationId: string | null;
  onAdded: () => void;
}) {
  const [active, setActive] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [priority, setPriority] = React.useState<TaskPriority>(null);
  const [due, setDue] = React.useState<string | null>(null);
  const [advanced, setAdvanced] = React.useState(false);
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function resetAll() {
    setTitle("");
    setPriority(null);
    setDue(null);
    setDescription("");
    setAdvanced(false);
    setActive(false);
  }

  async function submit() {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    const res = await createTask({
      title: t,
      project_id: projectId,
      organization_id: organizationId,
      status: "incomplete",
      priority,
      due_date: due,
      description: description.trim() || null,
    });
    setBusy(false);
    if (res) {
      resetAll();
      onAdded();
    } else {
      toast.error("Couldn't add the task.");
    }
  }

  if (!active) {
    return (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={4} className="py-1.5">
          <button
            onClick={() => setActive(true)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Add task
          </button>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell className="py-1.5">
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") resetAll();
              }}
              placeholder="Task title, then Enter…"
              className="h-8 max-w-md"
              style={{ fontSize: "16px" }}
              disabled={busy}
            />
          </div>
        </TableCell>
        <TableCell className="py-1.5">
          <TaskPriorityPicker value={priority} onChange={setPriority} />
        </TableCell>
        <TableCell className="py-1.5">
          <TaskDueDatePicker value={due} overdue={false} onChange={setDue} />
        </TableCell>
        <TableCell className="py-1.5">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={submit}
              disabled={busy || !title.trim()}
              className="h-7 px-2 text-[11px]"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Advanced disclosure — description (createTask supports it) */}
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={4} className="py-1.5">
          <div className="space-y-2">
            <button
              onClick={() => setAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              disabled={busy}
            >
              {advanced ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Advanced
              <span className="font-normal">description</span>
            </button>
            {advanced && (
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description…"
                className="text-sm min-h-[72px] resize-y max-w-2xl"
                style={{ fontSize: "16px" }}
                disabled={busy}
              />
            )}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={resetAll}
                disabled={busy}
                className="h-7 px-2 text-[11px]"
              >
                Cancel
              </Button>
            </div>
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}
