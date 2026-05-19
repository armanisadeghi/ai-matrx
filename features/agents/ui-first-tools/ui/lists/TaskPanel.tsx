"use client";

/**
 * TaskPanel — drawer-style panel showing the active conversation's plan,
 * agent tasks, and user todos. Opens via TaskPanelChip in the chat header.
 *
 * Each section is read-write: clicking a status icon cycles task status;
 * clicking a todo checkbox marks it done; inline-edit titles persist on
 * blur. Destructive ops use the global confirm dialog host (per CLAUDE.md
 * no `window.confirm`).
 */

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  CircleDashed,
  CircleOff,
  Trash2,
  Plus,
  ChevronRight,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentPlan,
  selectAgentTasks,
  selectUserTodosForConversation,
} from "../../redux/agent-lists.selectors";
import {
  hydrateAgentLists,
  subscribeAgentLists,
  unsubscribeAgentLists,
} from "../../redux/agent-lists.thunks";
import type {
  CxAgentTaskRow,
  CxAgentTaskStatus,
  CxUserTodoRow,
} from "../../tools/types";
import {
  updateTask,
  addTasks,
  removeTask,
} from "../../service/agent-task.service";
import {
  addUserTodo,
  updateUserTodo,
  removeUserTodo,
} from "../../service/user-todo.service";
import { setPlanStatus } from "../../service/agent-plan.service";
import { confirm as confirmDialog } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

interface TaskPanelProps {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_ORDER: CxAgentTaskStatus[] = [
  "pending",
  "in_progress",
  "done",
  "blocked",
  "skipped",
];

function nextStatus(current: CxAgentTaskStatus): CxAgentTaskStatus {
  const i = STATUS_ORDER.indexOf(current);
  return STATUS_ORDER[(i + 1) % STATUS_ORDER.length];
}

function StatusIcon({ status }: { status: CxAgentTaskStatus }) {
  switch (status) {
    case "pending":
      return <Circle className="w-4 h-4 text-muted-foreground" />;
    case "in_progress":
      return <CircleDot className="w-4 h-4 text-primary" />;
    case "done":
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case "blocked":
      return <CircleOff className="w-4 h-4 text-amber-500" />;
    case "skipped":
      return <CircleDashed className="w-4 h-4 text-muted-foreground" />;
  }
}

export function TaskPanel({
  conversationId,
  open,
  onOpenChange,
}: TaskPanelProps) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!open) return;
    void dispatch(hydrateAgentLists(conversationId));
    dispatch(subscribeAgentLists(conversationId));
    return () => {
      dispatch(unsubscribeAgentLists(conversationId));
    };
  }, [open, conversationId, dispatch]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-md w-[420px] flex flex-col p-0"
      >
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle>Agent lists</SheetTitle>
          <SheetDescription>
            Plan, agent tasks, and items the agent assigned to you for this
            conversation.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-5">
          <PlanSection conversationId={conversationId} />
          <TasksSection conversationId={conversationId} />
          <TodosSection conversationId={conversationId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Plan section ───────────────────────────────────────────────────────────

function PlanSection({ conversationId }: { conversationId: string }) {
  const plan = useAppSelector(selectAgentPlan(conversationId));
  if (!plan) {
    return (
      <section>
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
          Plan
        </h3>
        <div className="text-sm text-muted-foreground italic">
          No plan yet for this conversation.
        </div>
      </section>
    );
  }
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
        Plan ·{" "}
        <span
          className={cn(
            "font-medium",
            plan.status === "approved" && "text-emerald-500",
            plan.status === "rejected" && "text-destructive",
            plan.status === "proposed" && "text-primary",
            plan.status === "superseded" && "text-muted-foreground",
          )}
        >
          {plan.status}
        </span>
      </h3>
      <div className="rounded-md border border-border bg-card p-3 flex flex-col gap-1.5">
        <div className="text-sm font-medium text-foreground">{plan.title}</div>
        {plan.reasoning && (
          <div className="text-xs text-muted-foreground whitespace-pre-wrap">
            {plan.reasoning}
          </div>
        )}
        {plan.steps.length > 0 && (
          <ol className="list-decimal pl-5 space-y-0.5 text-sm">
            {plan.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        )}
        {plan.status === "proposed" && (
          <div className="flex gap-2 mt-1">
            <Button
              size="sm"
              onClick={async () => {
                await setPlanStatus(plan.id, "approved");
              }}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await setPlanStatus(plan.id, "rejected");
              }}
            >
              Reject
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Tasks section ──────────────────────────────────────────────────────────

function TasksSection({ conversationId }: { conversationId: string }) {
  const tasks = useAppSelector(selectAgentTasks(conversationId));
  const userId = useAppSelector(selectUserId);
  const [draft, setDraft] = useState("");

  async function add() {
    if (!draft.trim() || !userId) return;
    await addTasks([
      {
        conversation_id: conversationId,
        user_id: userId,
        title: draft,
        created_by: "user",
      },
    ]);
    setDraft("");
  }

  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
        Agent tasks ({tasks.length})
      </h3>
      <div className="flex flex-col gap-1.5">
        {tasks.length === 0 && (
          <div className="text-sm text-muted-foreground italic">
            No agent tasks for this conversation.
          </div>
        )}
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
        <div className="flex gap-1 mt-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a task…"
            className="text-sm h-8"
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={add}
            disabled={!draft.trim()}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function TaskRow({ task }: { task: CxAgentTaskRow }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  const cycle = useCallback(async () => {
    await updateTask(task.id, { status: nextStatus(task.status) });
  }, [task.id, task.status]);

  const remove = useCallback(async () => {
    const yes = await confirmDialog({
      title: "Remove task?",
      description: task.title,
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!yes) return;
    await removeTask(task.id);
  }, [task.id, task.title]);

  return (
    <div className="group flex items-start gap-1.5 rounded-md hover:bg-muted/50 px-1.5 py-1">
      <button
        type="button"
        onClick={cycle}
        className="mt-0.5 shrink-0"
        title={`Status: ${task.status}. Click to advance.`}
        aria-label={`Toggle status of "${task.title}"`}
      >
        <StatusIcon status={task.status} />
      </button>
      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={async () => {
              if (draft.trim() && draft !== task.title) {
                await updateTask(task.id, { title: draft });
              }
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setDraft(task.title);
                setEditing(false);
              }
            }}
            className="text-sm h-7"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              "text-sm text-left w-full leading-snug",
              task.status === "done" &&
                "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={remove}
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
        title="Remove"
        aria-label={`Remove "${task.title}"`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── User todos section ─────────────────────────────────────────────────────

function TodosSection({ conversationId }: { conversationId: string }) {
  const todos = useAppSelector(selectUserTodosForConversation(conversationId));
  const userId = useAppSelector(selectUserId);
  const [draft, setDraft] = useState("");

  async function add() {
    if (!draft.trim() || !userId) return;
    await addUserTodo({
      conversation_id: conversationId,
      user_id: userId,
      title: draft,
    });
    setDraft("");
  }

  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
        Your todos ({todos.filter((t) => !t.done).length} open)
      </h3>
      <div className="flex flex-col gap-1.5">
        {todos.length === 0 && (
          <div className="text-sm text-muted-foreground italic">
            No todos assigned by the agent yet.
          </div>
        )}
        {todos.map((t) => (
          <TodoRow key={t.id} todo={t} />
        ))}
        <div className="flex gap-1 mt-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a todo for yourself…"
            className="text-sm h-8"
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={add}
            disabled={!draft.trim()}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function TodoRow({ todo }: { todo: CxUserTodoRow }) {
  return (
    <div className="group flex items-start gap-2 rounded-md hover:bg-muted/50 px-1.5 py-1">
      <Checkbox
        checked={todo.done}
        onCheckedChange={async (v) => {
          await updateUserTodo(todo.id, { done: !!v });
        }}
        className="mt-1"
      />
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-sm leading-snug",
            todo.done && "text-muted-foreground line-through",
          )}
        >
          {todo.title}
        </div>
        {todo.context && !todo.done && (
          <div className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">
            {todo.context}
          </div>
        )}
        {todo.due && !todo.done && (
          <div className="text-xs text-muted-foreground mt-0.5">
            Due: {todo.due}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={async () => {
          const yes = await confirmDialog({
            title: "Remove todo?",
            description: todo.title,
            confirmLabel: "Remove",
            variant: "destructive",
          });
          if (!yes) return;
          await removeUserTodo(todo.id);
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
        title="Remove"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export { ChevronRight as _ChevronRightForFutureUse };
