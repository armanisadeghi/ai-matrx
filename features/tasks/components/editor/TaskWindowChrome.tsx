"use client";

// Task window CHROME units — the slot-mapped presentation of a task inside a
// WindowPanel. Each unit reads the shared TaskEditorController from context and
// takes NO props (zero prop-drilling), so they drop straight into WindowPanel's
// header/footer/body slots — which are descendants of the controller provider
// even across the WindowPanel portal.
//
//   TaskTitleBand     → body hero: status circle + big editable name + context
//   TaskHeaderActions → actionsRight: save/discard (dirty) + copy + reference +
//                       open-full-page + delete
//   TaskMetadataFooter→ footer bar: priority + due vitals + save status
//
// These are the canonical window chrome reused by both the single-task window
// and (Wave 2) the unified TasksWindow. They import NO WindowPanel themselves
// (bundle invariant) — the window composes them onto its slots.

import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  CheckSquare,
  CircleDashed,
  ExternalLink,
  Flag,
  ListTodo,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProInput } from "@/components/official/ProInput";
import { cn } from "@/utils/cn";
import { formatDateOnly } from "@/utils/dateOnly";
import { TASK_PRIORITY_META } from "@/features/tasks/components/TaskPriorityPicker";
import { TaskCopyForAiButton } from "@/features/tasks/components/TaskCopyForAiButton";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
import { useTaskEditorControllerCtx } from "./TaskEditorControllerContext";

const TOGGLE_SIZE = {
  sm: "size-3.5",
  md: "w-4 h-4",
  lg: "size-5",
} as const;

/** The status circle — toggles complete/incomplete. */
export function TaskCompleteToggle({
  size = "md",
  className,
}: {
  size?: keyof typeof TOGGLE_SIZE;
  className?: string;
}) {
  const { completed, isOperating, handleToggleComplete } =
    useTaskEditorControllerCtx();
  return (
    <button
      type="button"
      onClick={handleToggleComplete}
      disabled={isOperating}
      className={cn(
        "shrink-0 text-muted-foreground transition-colors hover:text-primary disabled:opacity-60",
        className,
      )}
      title={completed ? "Mark incomplete" : "Mark complete"}
      aria-label={completed ? "Mark incomplete" : "Mark complete"}
    >
      {completed ? (
        <CheckCircle2 className={cn(TOGGLE_SIZE[size], "text-green-500")} />
      ) : (
        <CircleDashed className={TOGGLE_SIZE[size]} />
      )}
    </button>
  );
}

/** The big editable task name (window/display treatment). */
export function TaskTitleField({ className }: { className?: string }) {
  const { effective, completed, patch } = useTaskEditorControllerCtx();
  return (
    <ProInput
      value={effective.title}
      onChange={(e) => patch("title", e.target.value)}
      placeholder="Untitled task"
      showCopyButton={false}
      aria-label="Task title"
      className={cn(
        "h-auto min-w-0 border-none bg-transparent px-0 text-lg font-semibold leading-snug text-foreground shadow-none outline-none placeholder:text-muted-foreground/40",
        completed && "text-muted-foreground line-through",
        className,
      )}
      wrapperClassName="w-full min-w-0"
    />
  );
}

/**
 * The body hero — a deliberate, prominent title band. Lifts the name OUT of the
 * cramped editor strip and OUT of the WindowPanel header (whose absolute-centered
 * title collides with wide action clusters and truncates long names). Here the
 * full name gets room to breathe, with the status circle and a context line
 * (project · task/subtask).
 */
export function TaskTitleBand() {
  const { task, project } = useTaskEditorControllerCtx();
  const isSubtask = !!task?.parent_task_id;
  return (
    <div className="shrink-0 border-b border-border/60 bg-card/30 px-5 py-3.5">
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <TaskCompleteToggle size="lg" />
        </div>
        <div className="min-w-0 flex-1">
          <TaskTitleField />
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {isSubtask ? (
              <CheckSquare className="size-3 shrink-0" />
            ) : (
              <ListTodo className="size-3 shrink-0" />
            )}
            <span className="truncate">
              {project?.name ? project.name : isSubtask ? "Subtask" : "Task"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small contextual breadcrumb for the WindowPanel header `titleNode`. */
export function TaskWindowBreadcrumb() {
  const { task, project } = useTaskEditorControllerCtx();
  const isSubtask = !!task?.parent_task_id;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {isSubtask ? (
        <CheckSquare className="size-3.5 shrink-0 text-primary" />
      ) : (
        <ListTodo className="size-3.5 shrink-0 text-primary" />
      )}
      <span className="truncate">
        {project?.name ? project.name : isSubtask ? "Subtask" : "Task"}
      </span>
    </span>
  );
}

/** actionsRight cluster — utility + save/discard when dirty. */
export function TaskHeaderActions() {
  const {
    taskId,
    effective,
    isDirty,
    isSaving,
    isDeleting,
    isOperating,
    handleSave,
    handleDiscard,
    handleDelete,
  } = useTaskEditorControllerCtx();
  return (
    <div className="flex items-center gap-0.5">
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
      <TaskCopyForAiButton
        taskId={taskId}
        taskTitle={effective.title}
        location="Tasks — task window"
        size="sm"
      />
      <ReferenceCopyButton
        referenceType="task"
        id={taskId}
        label={effective.title}
        toastLabel={effective.title || "Task"}
        size="sm"
      />
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
  );
}

/**
 * footer (bar variant) — at-a-glance vitals + save status. Renders inside
 * WindowPanel's compact footer chrome (text-xs, tiny icons), so it stays a thin
 * status row, not a second action bar.
 */
export function TaskMetadataFooter() {
  const { effective, isDirty, isSaving } = useTaskEditorControllerCtx();
  return (
    <>
      {effective.priority && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 font-medium",
            TASK_PRIORITY_META[effective.priority].fill,
            TASK_PRIORITY_META[effective.priority].text,
          )}
        >
          <Flag />
          {TASK_PRIORITY_META[effective.priority].label}
        </span>
      )}
      {effective.dueDate && (
        <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 font-medium text-foreground">
          <Calendar />
          {formatDateOnly(effective.dueDate, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      )}
      <span className="ml-auto text-muted-foreground">
        {isSaving ? "Saving…" : isDirty ? "Unsaved changes" : "Saved"}
      </span>
    </>
  );
}
