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
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { selectSelectedTaskId } from "@/features/tasks/redux/taskUiSlice";
import { Button } from "@/components/ui/button";
import { Button as SurfaceButton } from "@ai-matrx/design-system";
import { ProInput } from "@/components/official/ProInput";
import { cn } from "@/utils/cn";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { useTaskEditorController } from "./editor/useTaskEditorController";
import { TaskEditorControllerProvider } from "./editor/TaskEditorControllerContext";
import { TaskEditorBody } from "./editor/TaskEditorBody";
import { TaskEditorCopyButtons } from "./editor/TaskEditorCopyButtons";

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
    <SurfaceButton
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
    </SurfaceButton>
  );
}

export default function TaskEditor({
  taskId: taskIdProp,
  embedded,
  compact,
  footerAppend,
  onOpenLinkedTask,
  routeHeader,
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
  /** Full-page chrome that must share this editor's live draft controller. */
  routeHeader?: ReactNode;
} = {}) {
  const selectedTaskId = useAppSelector(selectSelectedTaskId);
  const taskId = taskIdProp ?? selectedTaskId;

  if (!taskId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6">
        <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
          <CheckSquare className="w-7 h-7 text-muted-foreground/60" />
        </div>
        {/* read-gate-exempt: a selection prompt — no task id is chosen yet, so nothing was read; not an empty list */}
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
      routeHeader={routeHeader}
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
  routeHeader,
}: {
  taskId: string;
  embedded?: boolean;
  compact?: boolean;
  footerAppend?: ReactNode;
  onOpenLinkedTask?: (taskId: string) => void;
  routeHeader?: ReactNode;
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
    if (controller.loading) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      );
    }
    // An empty single-task read has four causes (denied, trashed, missing,
    // signed out) — a `?task=` deep link hits all of them. The gate resolves
    // the true one instead of asserting "not found".
    return (
      <AccessGate
        token="task"
        id={taskId}
        fallbackHref="/tasks"
        fallbackLabel="Back to Tasks"
      />
    );
  }

  return (
    <TaskEditorControllerProvider value={controller}>
      {routeHeader}
      <div
        className="flex flex-col h-full min-h-0 bg-background"
        style={
          routeHeader ? { paddingTop: "var(--shell-header-h)" } : undefined
        }
      >
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

            <TaskEditorCopyButtons
              location={
                embedded ? "War Room — task tile" : "Tasks — task editor"
              }
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
              <TaskEditorCopyButtons location="Tasks — task editor" size="sm" />
              <ReferenceCopyButton
                referenceType="task"
                id={taskId}
                label={effective.title}
                toastLabel={effective.title || "Task"}
                size="sm"
              />
              {/* Sharing — the one capability the unreachable TaskDetailPage had
                  and this editor did not. ShareButton owns its own ShareModal
                  and resolves ownership itself, so no owner gate is needed. */}
              <ShareButton
                resourceType="task"
                resourceId={taskId}
                resourceName={effective.title || "Task"}
                variant="ghost"
                size="icon"
                className="h-7 w-7"
              />
              {isDirty && (
                <>
                  <Button
                    variant="quiet"
                    onClick={handleDiscard}
                    disabled={isSaving}
                  >
                    Discard
                  </Button>
                  <Button
                    icon={isSaving ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Save />
                    )}
                    variant="primary"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    Save
                  </Button>
                </>
              )}
              {!embedded ? (
                <Button
                  variant="quiet"
                  asChild
                  className="w-7"
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
                icon={isDeleting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 />
                )} aria-label="Delete task"
                variant="quiet"
                onClick={handleDelete}
                disabled={isDeleting || isOperating}
                title="Delete task"
              />
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
              variant={completed ? "outline" : "quiet"}
              onClick={handleToggleComplete}
              disabled={isOperating}
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
              icon={isDeleting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 />
              )}
              variant="quiet"
              onClick={handleDelete}
              disabled={isDeleting || isOperating}
            >
              Delete
            </Button>

            {footerAppend}

            <div className="ml-auto flex items-center gap-1.5">
              {isDirty && (
                <Button
                  variant="quiet"
                  onClick={handleDiscard}
                  disabled={isSaving}
                >
                  Discard
                </Button>
              )}
              <Button
                icon={isSaving ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save />
                )}
                variant="primary"
                onClick={handleSave}
                disabled={!isDirty || isSaving}
                className="min-w-[80px]"
              >
                {isDirty ? "Save" : "Saved"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </TaskEditorControllerProvider>
  );
}
