"use client";

// TaskEditor — the canonical task editor used on the /tasks route, the
// /tasks/[id] page, and embedded in War Room tiles / agent context / scopes.
//
// COMPOSITION ROOT: it hoists all shared task-edit state into
// `useTaskEditorController`, provides it to the subtree, and composes the
// title/footer chrome around the shared `TaskEditorBody` content unit. The two
// chrome layouts (embedded icon-strip vs full editor) are kept verbatim here so
// every existing consumer is byte-identical; the floating Tasks window reuses
// the SAME controller + body but presents its own slot-based chrome.

import type { ReactNode } from "react";
import Link from "next/link";
import {
  CheckSquare,
  CircleDashed,
  CheckCircle2,
  Loader2,
  Save,
  Trash2,
  X,
  ExternalLink,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectSelectedTaskId } from "@/features/tasks/redux/taskUiSlice";
import { Button } from "@/components/ui/button";
import { ProInput } from "@/components/official/ProInput";
import { cn } from "@/utils/cn";
import { TaskCopyForAiButton } from "@/features/tasks/components/TaskCopyForAiButton";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
import { useTaskEditorController } from "./editor/useTaskEditorController";
import { TaskEditorControllerProvider } from "./editor/TaskEditorControllerContext";
import { TaskEditorBody } from "./editor/TaskEditorBody";

/** Icon-only control for embedded tile chrome — no label padding. */
function EmbeddedToolbarButton({
  onClick,
  disabled,
  title,
  variant = "ghost",
  pressed,
  className,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  variant?: "ghost" | "secondary" | "default";
  pressed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={pressed ? "secondary" : variant}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn("h-6 w-6 shrink-0 p-0", className)}
    >
      {children}
    </Button>
  );
}

export default function TaskEditor({
  taskId: taskIdProp,
  embedded,
  compact,
  footerAppend,
  onOpenLinkedTask,
}: {
  /** When provided, edit this task directly (e.g. embedded in a War Room tile).
   *  Falls back to the global selected task (the /tasks/[id] route) when omitted. */
  taskId?: string;
  /** Embedded surfaces (tiles) hide the redundant "open in full page" link. */
  embedded?: boolean;
  /** Dense tile hosts (grid / combined) — flush to edges, no interior gutter. */
  compact?: boolean;
  /** Extra controls merged into the sticky bottom bar (e.g. War Room subtasks). */
  footerAppend?: ReactNode;
  /** In-tile drill-down: open a linked task (subtask) without leaving the tile. */
  onOpenLinkedTask?: (taskId: string) => void;
} = {}) {
  const selectedTaskId = useAppSelector(selectSelectedTaskId);
  const taskId = taskIdProp ?? selectedTaskId;

  if (!taskId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6">
        <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
          <CheckSquare className="w-7 h-7 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium text-foreground">No task selected</p>
        <p className="text-xs mt-1 text-muted-foreground">
          Select a task from the list to view and edit.
        </p>
      </div>
    );
  }

  return (
    <TaskEditorInner
      taskId={taskId}
      embedded={embedded}
      compact={compact}
      footerAppend={footerAppend}
      onOpenLinkedTask={onOpenLinkedTask}
      key={taskId}
    />
  );
}

function TaskEditorInner({
  taskId,
  embedded,
  compact,
  footerAppend,
  onOpenLinkedTask,
}: {
  taskId: string;
  embedded?: boolean;
  compact?: boolean;
  footerAppend?: ReactNode;
  onOpenLinkedTask?: (taskId: string) => void;
}) {
  const controller = useTaskEditorController(taskId);
  const {
    task,
    effective,
    completed,
    isDirty,
    isSaving,
    isDeleting,
    isOperating,
    patch,
    handleSave,
    handleDiscard,
    handleDelete,
    handleToggleComplete,
  } = controller;

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6">
        <CircleDashed className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-xs">Task not found</p>
      </div>
    );
  }

  return (
    <TaskEditorControllerProvider value={controller}>
      <div className="flex flex-col h-full min-h-0 bg-background">
        {/* Title row — tiles get a thinner icon-only strip; full editor keeps labels. */}
        {embedded ? (
          <div
            className={cn(
              "flex h-7 shrink-0 items-center gap-1 border-b border-border/50 bg-card/40",
              compact ? "px-0" : "px-2",
            )}
          >
            <button
              type="button"
              onClick={handleToggleComplete}
              disabled={isOperating}
              className="grid size-6 shrink-0 place-items-center text-muted-foreground transition-colors hover:text-primary"
              title={completed ? "Mark incomplete" : "Mark complete"}
              aria-label={completed ? "Mark incomplete" : "Mark complete"}
            >
              {completed ? (
                <CheckCircle2 className="size-3.5 text-green-500" />
              ) : (
                <CircleDashed className="size-3.5" />
              )}
            </button>

            <ProInput
              value={effective.title}
              onChange={(e) => patch("title", e.target.value)}
              placeholder="Untitled task"
              showCopyButton={false}
              aria-label="Task title"
              className={cn(
                "h-6 min-w-0 flex-1 border-none bg-transparent text-sm font-medium text-foreground shadow-none outline-none placeholder:text-muted-foreground/50",
                completed && "text-muted-foreground line-through",
              )}
              wrapperClassName="min-w-0 flex-1"
            />

            <EmbeddedToolbarButton
              onClick={handleDelete}
              disabled={isDeleting || isOperating}
              title="Delete task"
              className="text-muted-foreground hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
            </EmbeddedToolbarButton>

            <TaskCopyForAiButton
              taskId={taskId}
              taskTitle={effective.title}
              location={embedded ? "War Room — task tile" : "Tasks — task editor"}
              size="icon"
            />

            <ReferenceCopyButton
              referenceType="task"
              id={taskId}
              label={effective.title}
              toastLabel={effective.title || "Task"}
              size="sm"
              className="h-6 w-6"
            />
          </div>
        ) : (
          <div className="shrink-0 border-b border-border/50 bg-card/40 px-3 h-9 flex items-center gap-1.5">
            <button
              onClick={handleToggleComplete}
              disabled={isOperating}
              className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
              title={completed ? "Mark incomplete" : "Mark complete"}
            >
              {completed ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <CircleDashed className="w-4 h-4" />
              )}
            </button>

            <ProInput
              value={effective.title}
              onChange={(e) => patch("title", e.target.value)}
              placeholder="Untitled task"
              showCopyButton={false}
              aria-label="Task title"
              className={cn(
                "flex-1 min-w-0 h-7 bg-transparent border-none shadow-none outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground/50",
                completed && "line-through text-muted-foreground",
              )}
              wrapperClassName="flex-1 min-w-0"
            />

            <div className="flex items-center gap-0.5 shrink-0">
              <TaskCopyForAiButton
                taskId={taskId}
                taskTitle={effective.title}
                location="Tasks — task editor"
                size="sm"
              />
              <ReferenceCopyButton
                referenceType="task"
                id={taskId}
                label={effective.title}
                toastLabel={effective.title || "Task"}
                size="sm"
              />
              {isDirty && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDiscard}
                    disabled={isSaving}
                    className="h-7 px-2 text-[11px]"
                  >
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="h-7 px-2 text-[11px]"
                  >
                    {isSaving ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Save className="w-3 h-3 mr-1" />
                    )}
                    Save
                  </Button>
                </>
              )}
              {!embedded ? (
                <Button
                  size="sm"
                  variant="ghost"
                  asChild
                  className="h-7 w-7 p-0"
                  title="Open in full page"
                >
                  <Link
                    href={`/tasks/${taskId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDelete}
                disabled={isDeleting || isOperating}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                title="Delete task"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </Button>
            </div>
          </div>
        )}

        <TaskEditorBody compact={compact} onOpenLinkedTask={onOpenLinkedTask} />

        {/* Sticky bottom bar — embedded tiles: thin icon-only strip; full page keeps labels. */}
        {embedded ? (
          <div
            className={cn(
              "flex h-7 shrink-0 items-center gap-0.5 border-t border-border/60 bg-card/60",
              compact ? "px-0" : "px-2",
            )}
          >
            <EmbeddedToolbarButton
              onClick={handleToggleComplete}
              disabled={isOperating}
              pressed={completed}
              title={completed ? "Mark incomplete" : "Mark complete"}
            >
              {completed ? (
                <CircleDashed className="size-3.5" />
              ) : (
                <CheckCircle2 className="size-3.5 text-green-500" />
              )}
            </EmbeddedToolbarButton>

            <EmbeddedToolbarButton
              onClick={handleDelete}
              disabled={isDeleting || isOperating}
              title="Delete task"
              className="text-muted-foreground hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
            </EmbeddedToolbarButton>

            {footerAppend}

            {isDirty ? (
              <div className="ml-auto flex items-center gap-0.5">
                <EmbeddedToolbarButton
                  onClick={handleDiscard}
                  disabled={isSaving}
                  title="Discard changes"
                >
                  <X className="size-3.5" />
                </EmbeddedToolbarButton>
                <EmbeddedToolbarButton
                  onClick={handleSave}
                  disabled={isSaving}
                  title="Save changes"
                  variant="default"
                >
                  {isSaving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                </EmbeddedToolbarButton>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="shrink-0 border-t border-border/60 bg-card/60 backdrop-blur-sm px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center gap-1.5">
            <Button
              size="sm"
              variant={completed ? "secondary" : "ghost"}
              onClick={handleToggleComplete}
              disabled={isOperating}
              className="h-8 text-[11px] gap-1.5"
            >
              {completed ? (
                <>
                  <CircleDashed className="w-3.5 h-3.5" />
                  Mark incomplete
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  Mark complete
                </>
              )}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={isDeleting || isOperating}
              className="h-8 text-[11px] gap-1.5 text-muted-foreground hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Delete
            </Button>

            {footerAppend}

            <div className="ml-auto flex items-center gap-1.5">
              {isDirty && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDiscard}
                  disabled={isSaving}
                  className="h-8 text-[11px]"
                >
                  Discard
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                className="h-8 text-[11px] gap-1.5 min-w-[80px]"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {isDirty ? "Save" : "Saved"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </TaskEditorControllerProvider>
  );
}
