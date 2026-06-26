"use client";

// Task window CHROME units — the slot-mapped presentation of a task inside a
// WindowPanel. Each reads the shared TaskEditorController from context and takes
// no props (zero prop-drilling), so they drop into WindowPanel's header / footer
// / body slots — descendants of the controller provider even across the portal.
//
//   TaskTitleBand     → body hero: big editable name + Status / Parent fields
//   TaskWindowBreadcrumb → header titleNode: compact project/type context
//   TaskHeaderActions → actionsRight: save/discard (dirty) + copy + reference +
//                       open-full-page + delete (all at the uniform ~24px height)
//   TaskMetadataFooter→ footer bar: priority + due vitals + save status
//
// Completeness is a clearly-labeled "Status" FIELD here (not a circle glued to
// the title) — inside a task you set status deliberately, you don't toggle a
// list checkbox. Subtask-ness shows as a "Parent task" field, like every other
// labeled field, never as floating text.

import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  CheckSquare,
  Circle,
  ExternalLink,
  Flag,
  ListTodo,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { ProInput } from "@/components/official/ProInput";
import { cn } from "@/utils/cn";
import { formatDateOnly } from "@/utils/dateOnly";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { TASK_PRIORITY_META } from "@/features/tasks/components/TaskPriorityPicker";
import { TaskCopyForAiButton } from "@/features/tasks/components/TaskCopyForAiButton";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";
import { useTaskEditorControllerCtx } from "./TaskEditorControllerContext";

// Uniform compact header-control heights (match NoteViewControls / ReferenceCopyButton):
const ICON_BTN =
  "grid h-6 w-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5";
const TEXT_BTN =
  "inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors disabled:opacity-50";

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

/** A label/value row in the title band — matches the body's PropertyRow width. */
function BandField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}

/**
 * The body hero — a deliberate title band. The name gets room to breathe (not
 * crammed into the WindowPanel header, whose centered title collides with wide
 * action clusters). Completeness and parent are LABELED FIELDS below the title,
 * consistent with the body's property rows.
 */
export function TaskTitleBand() {
  const { task, completed, isOperating, handleToggleComplete } =
    useTaskEditorControllerCtx();
  const parentId = task?.parent_task_id ?? null;
  const parent = useAppSelector((s) =>
    parentId ? selectTaskById(s, parentId) : undefined,
  );
  const openTaskEditor = useOpenTaskEditorWindow();

  return (
    <div className="shrink-0 space-y-3 border-b border-border/60 bg-card/30 px-5 py-4">
      <TaskTitleField />

      <div className="space-y-2">
        <BandField label="Status">
          <button
            type="button"
            onClick={handleToggleComplete}
            disabled={isOperating}
            title={completed ? "Mark incomplete" : "Mark complete"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
              completed
                ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {completed ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <Circle className="size-3.5" />
            )}
            {completed ? "Completed" : "Mark complete"}
          </button>
        </BandField>

        {parentId && (
          <BandField label="Parent task">
            <button
              type="button"
              onClick={() => openTaskEditor({ taskId: parentId })}
              title={parent?.title ?? "Open parent task"}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <CheckSquare className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {parent?.title ?? "Open parent task"}
              </span>
            </button>
          </BandField>
        )}
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

/** actionsRight cluster — utility + save/discard when dirty, at uniform height. */
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
          <button
            type="button"
            onClick={handleDiscard}
            disabled={isSaving}
            className={cn(
              TEXT_BTN,
              "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              TEXT_BTN,
              "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Save
          </button>
        </>
      )}
      <TaskCopyForAiButton
        taskId={taskId}
        taskTitle={effective.title}
        location="Tasks — task window"
        compact
        icon={CopyForAiIcon}
      />
      <ReferenceCopyButton
        referenceType="task"
        id={taskId}
        label={effective.title}
        toastLabel={effective.title || "Task"}
        size="sm"
      />
      <Link
        href={`/tasks/${taskId}`}
        target="_blank"
        rel="noopener noreferrer"
        title="Open in full page"
        className={ICON_BTN}
      >
        <ExternalLink />
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting || isOperating}
        title="Delete task"
        className={cn(ICON_BTN, "hover:text-destructive")}
      >
        {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </button>
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
