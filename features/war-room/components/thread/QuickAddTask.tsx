"use client";

// features/war-room/components/thread/QuickAddTask.tsx
//
// Feature 67a282c8 — capture a task into the room WITHOUT leaving the thread
// you're on. The task analog of QuickAddThread: same keyboard-first interaction
// (click → auto-focused title → Enter creates + stays + re-arms; Shift/Cmd+Enter
// creates and opens; Escape collapses), so a user can fire off a list of tasks
// rapid-fire while never changing the staged thread.
//
// Two targets (segmented, like QuickAddThread's flavor picker):
//   • Room   (default) — create a NEW task-flavored sibling thread holding the
//     task. The staged thread is untouched; "Create" stays put, "Create & open"
//     stages the new thread.
//   • Thread — add the task INTO the current staged thread: as a SUBTASK when it
//     already has a task, else as the thread's anchor task. Never stages away.
//
// Reuses the real writers — `createTile` + `createThreadTask` (new thread),
// `createSubtaskThunk` / `createThreadTask` (current thread) — so Redux + every
// surface update live; nothing is reimplemented.

import { useRef, useState } from "react";
import { Loader2, Check, ArrowRight, ListChecks, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import {
  createThread,
  createThreadTask,
} from "@/features/war-room/redux/thunks";
import {
  createSubtaskThunk,
  updateTaskFieldThunk,
} from "@/features/tasks/redux/thunks";
import { selectThreadTaskId } from "@/features/war-room/redux/selectors";
import { cn } from "@/lib/utils";

export type QuickAddTaskTarget = "room" | "thread";

export function QuickAddTask({
  sessionId,
  nextPosition,
  /** The currently-staged thread — the "Thread" target. Omit to force Room-only. */
  stagedThreadId,
  /** Promote a freshly-created task thread to the Stage ("Create and Open"). */
  onOpen,
  variant = "rail",
}: {
  sessionId: string;
  nextPosition: number;
  stagedThreadId?: string | null;
  onOpen?: (threadId: string) => void;
  variant?: "rail" | "card";
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  // Room is the default target — the new capability is "capture into the room
  // without leaving the thread". Thread is only offered when one is staged.
  const [target, setTarget] = useState<QuickAddTaskTarget>("room");

  const titleRef = useRef<HTMLInputElement>(null);
  const canTargetThread = !!stagedThreadId;
  const effectiveTarget: QuickAddTaskTarget =
    target === "thread" && canTargetThread ? "thread" : "room";

  function open() {
    setEditing(true);
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  function collapse() {
    setEditing(false);
    setTitle("");
  }

  /**
   * Create the task. mode 'open' stages the new thread (Room target only — a
   * Thread-target add never stages away, so it always behaves as 'stay').
   */
  async function create(mode: "stay" | "open") {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      if (effectiveTarget === "thread" && stagedThreadId) {
        // Add to the staged thread: subtask of its task, else its anchor task.
        const existingTaskId = selectThreadTaskId(stagedThreadId)(
          store.getState(),
        );
        if (existingTaskId) {
          await dispatch(
            createSubtaskThunk({
              parentTaskId: existingTaskId,
              title: trimmed,
            }),
          ).unwrap();
        } else {
          const newTaskId = await dispatch(createThreadTask(stagedThreadId));
          if (typeof newTaskId === "string" && newTaskId) {
            await dispatch(
              updateTaskFieldThunk({
                taskId: newTaskId,
                patch: { title: trimmed },
              }),
            );
          }
        }
        // Stay put — never re-stage; re-arm for the next capture.
        setTitle("");
        requestAnimationFrame(() => titleRef.current?.focus());
        return;
      }

      // Room target: a new task-flavored sibling thread holding the task.
      const thread = await dispatch(
        createThread({
          roomId: sessionId,
          position: nextPosition,
          title: trimmed,
          anchorType: "task",
          activeTab: "task",
        }),
      );
      if (!thread?.id) return; // thunk surfaced the failure
      const newTaskId = await dispatch(createThreadTask(thread.id));
      if (typeof newTaskId === "string" && newTaskId) {
        await dispatch(
          updateTaskFieldThunk({
            taskId: newTaskId,
            patch: { title: trimmed },
          }),
        );
      }

      if (mode === "open") {
        onOpen?.(thread.id);
        collapse();
      } else {
        // Stay on the current thread; re-arm for the next quick task.
        setTitle("");
        requestAnimationFrame(() => titleRef.current?.focus());
      }
    } catch {
      toast.error("Couldn't add the task");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void create(e.shiftKey || e.metaKey || e.ctrlKey ? "open" : "stay");
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      collapse();
    }
  }

  // ── Collapsed trigger ──────────────────────────────────────────────
  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        className={cn(
          "group/qt flex items-center gap-2.5 rounded-xl border border-dashed border-border/70 bg-transparent px-3 py-2 text-left transition-all",
          "hover:border-success/50 hover:bg-success/[0.03]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40",
          variant === "card" && "h-full w-full flex-col justify-center",
        )}
      >
        <span className="grid place-items-center size-5 shrink-0 rounded-full bg-muted/60 text-muted-foreground transition-colors group-hover/qt:text-success">
          <ListPlus className="size-3.5" />
        </span>
        <span className="text-[13px] font-medium text-muted-foreground group-hover/qt:text-success">
          Quick task
        </span>
      </button>
    );
  }

  // ── Inline composer ────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm">
      {/* Target selector — only useful when a thread is staged. */}
      {canTargetThread ? (
        <div
          role="group"
          aria-label="Add task to"
          className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5"
        >
          {[
            { value: "room" as const, label: "New thread" },
            { value: "thread" as const, label: "This thread" },
          ].map((opt) => {
            const active = effectiveTarget === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTarget(opt.value)}
                disabled={busy}
                aria-pressed={active}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <span className="grid place-items-center size-5 shrink-0 text-success">
          {busy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <ListChecks className="size-3.5" />
          )}
        </span>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          placeholder={
            effectiveTarget === "thread"
              ? "Add a task to this thread…"
              : "Capture a task as a new thread…"
          }
          aria-label="New task name"
          // 16px to avoid iOS zoom.
          style={{ fontSize: "16px" }}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/70",
            "focus-visible:outline-none disabled:opacity-60",
          )}
        />
      </div>

      <div className="flex items-center justify-end gap-1.5">
        {effectiveTarget === "room" ? (
          <button
            type="button"
            onClick={() => void create("open")}
            disabled={busy}
            title="Create and open this task thread on the Stage"
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border border-border bg-transparent px-2 py-1 text-[12px] font-medium text-muted-foreground transition-all",
              "hover:border-primary/40 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              "disabled:opacity-60 disabled:pointer-events-none",
            )}
          >
            <ArrowRight className="size-3.5" />
            Create &amp; open
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void create("stay")}
          disabled={busy}
          title="Create (Enter) — stay on this thread for the next task"
          className={cn(
            "inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[12px] font-semibold text-primary-foreground transition-all",
            "hover:bg-primary/90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
            "disabled:opacity-60 disabled:pointer-events-none",
          )}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Create
        </button>
      </div>
    </div>
  );
}
