"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Flag,
  User as UserIcon,
  CheckSquare,
  Loader2,
  Plus,
  Save,
  Trash2,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  CircleDashed,
  CheckCircle2,
  Tag,
  Info,
  Clock,
  X,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectSelectedTaskId,
  selectTaskEdit,
  selectTaskIsDirty,
  selectOperatingTaskId,
  patchTaskEdit,
  clearTaskEdit,
} from "@/features/tasks/redux/taskUiSlice";
import {
  saveTaskEditsThunk,
  toggleTaskCompleteThunk,
  deleteTaskThunk,
  createSubtaskThunk,
} from "@/features/tasks/redux/thunks";
import {
  selectTaskById,
  selectSubtasksByParent,
  upsertTaskWithLevel,
} from "@/features/agent-context/redux/tasksSlice";
import { selectProjectById } from "@/features/agent-context/redux/projectsSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import * as taskService from "@/features/tasks/services/taskService";
import { TASK_LABEL_OPTIONS } from "@/features/tasks/services/taskService";
import type { TaskLabel } from "@/features/tasks/services/taskService";
import { TaskContextPicker } from "./TaskContextSection";
import TaskAssigneePicker from "./TaskAssigneePicker";
import TaskAttachmentsPanel from "./TaskAttachmentsPanel";
import { TaskAssociatedResources } from "./TaskAssociatedResources";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ProInput } from "@/components/official/ProInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  TaskPriorityPicker,
  TASK_PRIORITY_META,
  type TaskPriority,
} from "./TaskPriorityPicker";
import { TaskDueDatePicker } from "./TaskDueDatePicker";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";
import { formatDateOnly } from "@/utils/dateOnly";
import { cn } from "@/utils/cn";
import { useEnsureTaskLoaded } from "@/features/tasks/hooks/useEnsureTaskLoaded";
import { useRefocusInputAfterAsync } from "@/features/tasks/hooks/useRefocusInputAfterAsync";
import { TaskCopyForAiButton } from "@/features/tasks/components/TaskCopyForAiButton";
import { ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
import {
  buildTasksContextData,
  createTasksExtraSections,
  TASKS_CONTEXT_MENU_PROPS,
} from "@/features/tasks/agent-context/buildTasksContextData";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v2/utils/build-application-scope";

// Universal v3 context menu — the SAME menu everywhere. The wrappers are the
// lightweight shell (imported statically); MenuContent lazy-loads on first open.
// The editable Description uses EditableContextMenu; the read-only comment
// thread uses NonEditableContextMenu.
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

type Priority = TaskPriority;

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
  children: React.ReactNode;
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
  footerAppend?: React.ReactNode;
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
  footerAppend?: React.ReactNode;
  onOpenLinkedTask?: (taskId: string) => void;
}) {
  const dispatch = useAppDispatch();
  const openTaskEditor = useOpenTaskEditorWindow();
  const { metadataPending } = useEnsureTaskLoaded(taskId);
  const task = useAppSelector((s) => selectTaskById(s, taskId));
  const draft = useAppSelector(selectTaskEdit(taskId));
  const isDirty = useAppSelector(selectTaskIsDirty(taskId));
  const operatingTaskId = useAppSelector(selectOperatingTaskId);
  const orgId = useAppSelector(selectOrganizationId);
  const project = useAppSelector((s) =>
    task?.project_id ? selectProjectById(s, task.project_id) : undefined,
  );

  // Live selection inside the description editor (read from the DOM at trigger
  // time, mirrored to state so contextData refreshes for menu/agent runs).
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const [descSelectionStart, setDescSelectionStart] = useState(0);
  const [descSelectionEnd, setDescSelectionEnd] = useState(0);

  const syncDescriptionSelection = useCallback(() => {
    const el = descriptionRef.current;
    if (!el) return;
    setDescSelectionStart(el.selectionStart);
    setDescSelectionEnd(el.selectionEnd);
  }, []);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [comments, setComments] = useState<
    { id: string; content: string; user_id: string; created_at: string }[]
  >([]);
  const [newComment, setNewComment] = useState("");
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [isAddingComment, setIsAddingComment] = useState(false);

  // Subtasks live in the global tasks slice — derive them via selector so any
  // component (TaskListPane counts, mobile views, sidebar) stays in sync.
  const subtasks = useAppSelector((s) => selectSubtasksByParent(s, taskId));
  const [newSubtask, setNewSubtask] = useState("");
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const { inputRef: subtaskInputRef, scheduleRefocus: scheduleSubtaskRefocus } =
    useRefocusInputAfterAsync(isAddingSubtask);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingComments(true);
    taskService.getTaskComments(taskId).then((data) => {
      if (cancelled) return;
      setComments(data);
      setIsLoadingComments(false);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // One-shot freshness fetch — Redux is the source of truth, but the user
  // may have created subtasks elsewhere or RLS scope changed. Upsert any
  // missing rows into the slice so the selector reflects the DB.
  useEffect(() => {
    let cancelled = false;
    taskService.getSubtasks(taskId).then((data) => {
      if (cancelled) return;
      for (const row of data) {
        dispatch(
          upsertTaskWithLevel({
            record: {
              id: row.id,
              title: row.title,
              status: row.status,
              priority: row.priority,
              due_date: row.due_date,
              assignee_id: row.assignee_id,
              project_id: row.project_id,
              parent_task_id: row.parent_task_id,
              organization_id: row.organization_id ?? orgId ?? "",
              description: row.description,
              settings:
                (row as { settings?: Record<string, unknown> }).settings ??
                null,
              created_at: row.created_at ?? null,
              user_id: row.user_id,
            },
            level: "full-data",
          }),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, dispatch, orgId]);

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6">
        <CircleDashed className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-xs">Task not found</p>
      </div>
    );
  }

  const effective = {
    title: draft.title ?? task.title,
    description:
      draft.description !== undefined
        ? draft.description
        : (task.description ?? ""),
    dueDate: draft.due_date !== undefined ? draft.due_date : task.due_date,
    priority: (draft.priority !== undefined
      ? draft.priority
      : (task.priority as Priority)) as Priority,
    projectId:
      draft.project_id !== undefined ? draft.project_id : task.project_id,
    assigneeId:
      draft.assignee_id !== undefined ? draft.assignee_id : task.assignee_id,
    labels:
      draft.labels !== undefined
        ? draft.labels
        : ((task.settings as { labels?: string[] } | null)?.labels ?? []),
  };

  const completed = task.status === "completed";
  const isOperating = operatingTaskId === taskId;

  // ── Surface scope (`matrx-user/tasks`) ────────────────────────────────────
  // Pure map of the active task's live state → the manifest's scope helper.
  const contextData = buildTasksContextData({
    taskId,
    title: effective.title,
    description: effective.description,
    selectionStart: descSelectionStart,
    selectionEnd: descSelectionEnd,
    status: task.status,
    priority: effective.priority ?? null,
    dueDate: effective.dueDate ?? null,
    projectId: task.project_id ?? null,
    projectName: project?.name ?? null,
    subtasks: subtasks.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
    })),
  });

  // Plain function (NOT useCallback): it sits after the `if (!task)` early
  // return, so a hook here would violate rules-of-hooks; React Compiler
  // memoizes it anyway. Reads the live selection from the DOM at call time,
  // not from render state.
  const getApplicationScope = () => {
    const el = descriptionRef.current;
    const start = el?.selectionStart ?? descSelectionStart;
    const end = el?.selectionEnd ?? descSelectionEnd;
    const selectedText =
      start !== end
        ? effective.description.slice(
            Math.min(start, end),
            Math.max(start, end),
          )
        : "";
    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange: el
        ? { type: "editable", element: el, start, end }
        : null,
      contextData,
    });
  };

  const patch = <K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) => {
    dispatch(patchTaskEdit({ taskId, patch: { [key]: value } }));
  };

  const handleSave = async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    try {
      await dispatch(saveTaskEditsThunk({ taskId }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    dispatch(clearTaskEdit(taskId));
  };

  const handleDelete = () => {
    if (isDeleting) return;
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await dispatch(
        deleteTaskThunk({
          taskId,
          projectId: task.project_id ?? "__unassigned__",
        }),
      );
      setDeleteConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleComplete = () => {
    dispatch(toggleTaskCompleteThunk({ taskId }));
  };

  // Task-specific menu items (Save / toggle complete / Delete) wired to the
  // live task — the core menu renders them; we only describe + supply handlers.
  const tasksExtras = createTasksExtraSections({
    onSave: () => void handleSave(),
    onToggleComplete: handleToggleComplete,
    onDelete: handleDelete,
    completed,
  });

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(taskId);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 1500);
  };

  const handleAddSubtask = async (): Promise<boolean> => {
    if (!newSubtask.trim() || isAddingSubtask) return false;
    setIsAddingSubtask(true);
    try {
      const newId = await dispatch(
        createSubtaskThunk({
          parentTaskId: taskId,
          title: newSubtask.trim(),
        }),
      ).unwrap();
      if (newId) {
        setNewSubtask("");
        scheduleSubtaskRefocus();
        return true;
      }
      return false;
    } finally {
      setIsAddingSubtask(false);
    }
  };

  const handleToggleSubtask = (subtaskId: string) => {
    dispatch(toggleTaskCompleteThunk({ taskId: subtaskId }));
  };

  const handleDeleteSubtask = (subtaskId: string) => {
    dispatch(
      deleteTaskThunk({
        taskId: subtaskId,
        projectId: task.project_id ?? "__unassigned__",
      }),
    );
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || isAddingComment) return;
    setIsAddingComment(true);
    try {
      const created = await taskService.createTaskComment(
        taskId,
        newComment.trim(),
      );
      if (created) {
        setComments((prev) => [...prev, created]);
        setNewComment("");
      }
    } finally {
      setIsAddingComment(false);
    }
  };

  const toggleLabel = (label: TaskLabel) => {
    const next = effective.labels.includes(label)
      ? effective.labels.filter((l) => l !== label)
      : [...effective.labels, label];
    patch("labels", next);
  };

  const completedSubtasks = subtasks.filter(
    (s) => s.status === "completed",
  ).length;

  return (
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

      {/* Scrollable body — left-aligned so content tracks the panel edge
          regardless of the editor column width. max-w-3xl just caps the
          reading width on ultra-wide displays so lines don't sprawl. */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div
          className={cn(
            compact ? "space-y-3 py-1" : "max-w-3xl space-y-5 px-4 py-4",
          )}
        >
          {/* Quick meta pills — at-a-glance task vitals, moved out of the
              compact title row so the row stays single-line. */}
          {(effective.priority || effective.dueDate || subtasks.length > 0) && (
            <div className="flex items-center gap-1.5 flex-wrap -mt-1">
              {effective.priority && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 h-5 px-1.5 rounded-md border text-[10px] font-medium",
                    TASK_PRIORITY_META[effective.priority].fill,
                    TASK_PRIORITY_META[effective.priority].text,
                  )}
                >
                  <Flag className="w-2.5 h-2.5" />
                  {TASK_PRIORITY_META[effective.priority].label}
                </span>
              )}
              {effective.dueDate && (
                <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-muted/60 text-[10px] font-medium text-foreground">
                  <Calendar className="w-2.5 h-2.5" />
                  {formatDateOnly(effective.dueDate, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
              {subtasks.length > 0 && (
                <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-md bg-muted/60 text-[10px] font-medium text-foreground">
                  <CheckSquare className="w-2.5 h-2.5" />
                  {completedSubtasks}/{subtasks.length}
                </span>
              )}
            </div>
          )}
          {/* Core properties — compact tiles: thin inline rows; full editor: grouped card */}
          <section
            className={cn(
              compact
                ? "space-y-0"
                : "overflow-hidden rounded-xl border border-border/60 bg-card/40",
            )}
          >
            <PropertyRow
              icon={UserIcon}
              label="Assignee"
              first
              compact={compact}
            >
              <TaskAssigneePicker
                assigneeId={effective.assigneeId ?? null}
                onChange={(id) => patch("assignee_id", id)}
                size={compact ? "sm" : "md"}
                className={
                  compact
                    ? "h-6 border-0 bg-transparent px-1 shadow-none hover:bg-accent/40"
                    : undefined
                }
              />
            </PropertyRow>

            <PropertyRow icon={Tag} label="Context" compact={compact}>
              <TaskContextPicker
                taskId={taskId}
                className={
                  compact
                    ? "h-6 border-0 bg-transparent px-1 py-0 shadow-none hover:bg-accent/40"
                    : undefined
                }
              />
            </PropertyRow>

            <PropertyRow icon={Flag} label="Priority" compact={compact}>
              <TaskPriorityPicker
                variant={compact ? "pill" : "segmented"}
                value={effective.priority ?? null}
                onChange={(v) => patch("priority", v)}
                className={
                  compact
                    ? "border-0 bg-transparent px-1 shadow-none hover:bg-accent/40"
                    : undefined
                }
              />
            </PropertyRow>

            <PropertyRow
              icon={Calendar}
              label="Due date"
              last
              compact={compact}
            >
              <TaskDueDatePicker
                variant={compact ? "pill" : "field"}
                value={effective.dueDate ?? null}
                onChange={(v) => patch("due_date", v)}
              />
            </PropertyRow>
          </section>

          {/* Description — ProTextarea: floating label + voice dictation +
              the canonical agent context menu (right-click → run a bound agent
              on the active task with full `matrx-user/tasks` scope). */}
          <EditableContextMenu
            {...TASKS_CONTEXT_MENU_PROPS}
            extraSections={tasksExtras}
            getTextarea={() => descriptionRef.current}
            getApplicationScope={getApplicationScope}
            onTextReplace={(next) => patch("description", next)}
            onTextInsertBefore={(text) => {
              const el = descriptionRef.current;
              const at = el?.selectionStart ?? 0;
              patch(
                "description",
                effective.description.slice(0, at) +
                  text +
                  "\n\n" +
                  effective.description.slice(at),
              );
            }}
            onTextInsertAfter={(text) => {
              const el = descriptionRef.current;
              const at = el?.selectionEnd ?? effective.description.length;
              patch(
                "description",
                effective.description.slice(0, at) +
                  "\n\n" +
                  text +
                  effective.description.slice(at),
              );
            }}
            contextData={contextData}
          >
            <ProTextarea
              ref={descriptionRef}
              surfaceName={TASKS_CONTEXT_MENU_PROPS.surfaceName}
              getApplicationScope={getApplicationScope}
              value={effective.description}
              onChange={(e) => {
                patch("description", e.target.value);
                setDescSelectionStart(e.target.selectionStart);
                setDescSelectionEnd(e.target.selectionEnd);
              }}
              onSelect={syncDescriptionSelection}
              onKeyUp={syncDescriptionSelection}
              onMouseUp={syncDescriptionSelection}
              floatingLabel="Description"
              autoGrow
              minHeight={compact ? 72 : 120}
              maxHeight={compact ? 220 : 400}
              showCopyButton={!compact}
              className={cn(
                "resize-none border-border/60 bg-card/40 text-sm",
                compact && "rounded-none border-x-0",
              )}
              wrapperClassName="w-full"
              style={{ fontSize: "16px" }}
            />
          </EditableContextMenu>

          {/* Labels — tight text chips; section icon only (no "Labels" header row) */}
          <div className="flex flex-wrap items-center gap-1 pl-1.5">
            <span className="text-[10px] font-medium text-foreground pl-0">
              Tags:
            </span>
            {TASK_LABEL_OPTIONS.map((opt) => {
              const active = effective.labels.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleLabel(opt.value)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center rounded-md border  px-1 py-0.5 text-[10px] font-medium transition-colors",
                    active
                      ? opt.color + " border-current"
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Subtasks */}
          <section>
            <SectionHeader
              icon={CheckSquare}
              label="Subtasks"
              count={subtasks.length}
              className="mb-1"
            />
            <div
              className={cn(
                "overflow-hidden bg-card/40",
                compact
                  ? "border-y border-border/60"
                  : "rounded-xl border border-border/60",
              )}
            >
              {subtasks.length === 0 ? (
                <p
                  className={cn(
                    "py-1.5 text-[11px] italic text-muted-foreground",
                    compact ? "pl-1.5 pr-2" : "px-4",
                  )}
                >
                  No subtasks yet.
                </p>
              ) : (
                subtasks.map((st, i) => (
                  <div
                    key={st.id}
                    className={cn(
                      "group flex h-7 items-center gap-2 transition-colors hover:bg-accent/40",
                      compact ? "pl-1.5 pr-2" : "px-4",
                      i !== 0 && "border-t border-border/40",
                    )}
                  >
                    <Checkbox
                      checked={st.status === "completed"}
                      onCheckedChange={() => handleToggleSubtask(st.id)}
                      className="size-3.5"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onOpenLinkedTask
                          ? onOpenLinkedTask(st.id)
                          : openTaskEditor({ taskId: st.id })
                      }
                      className={cn(
                        "min-w-0 flex-1 truncate rounded-sm text-left text-xs transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        st.status === "completed" &&
                          "line-through text-muted-foreground",
                      )}
                      title={st.title}
                    >
                      {st.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSubtask(st.id)}
                      className="grid size-5 shrink-0 place-items-center opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      aria-label="Delete subtask"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))
              )}
              <div
                className={cn(
                  "border-t border-border/40 bg-muted/20 px-1.5 py-1",
                  compact ? "pl-1.5 pr-2" : "px-3",
                  subtasks.length === 0 && "border-t-0",
                )}
              >
                <ProInput
                  ref={subtaskInputRef}
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onSubmit={() => void handleAddSubtask()}
                  submitOnEnter
                  submitLabel="Add subtask"
                  submitDisabled={!newSubtask.trim() || isAddingSubtask}
                  isSubmitting={isAddingSubtask}
                  showCopyButton={false}
                  onBlur={() => {
                    if (newSubtask.trim()) void handleAddSubtask();
                  }}
                  placeholder="Add subtask, press Enter…"
                  disabled={isAddingSubtask}
                  aria-label="Add subtask"
                  className="h-8 border-0 bg-transparent text-xs shadow-none"
                  wrapperClassName="w-full"
                />
              </div>
            </div>
          </section>

          {/* Attachments — notes, files, messages, conversations, chat blocks */}
          <section>
            <TaskAttachmentsPanel taskId={taskId} />
          </section>

          {/* Associated resources — anything FK-linked to this task (task_id) */}
          <TaskAssociatedResources taskId={taskId} />

          {/* Comments — ProTextarea with floating label + existing thread */}
          <section>
            {isLoadingComments ? (
              <div className="flex items-center gap-2 py-2 pl-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Loading...
              </div>
            ) : comments.length > 0 ? (
              // Presentational region — right-click the read-only comment
              // thread to run an agent over the COMMENTS (no text-replace
              // callbacks; this view is not editable). It must NOT reuse the
              // description-based `getApplicationScope` (that would launch the
              // agent over the description textarea's content/selection, not
              // the comments). Instead the surface scope's `content` is the
              // joined comment thread; the menu captures any live DOM text
              // selection itself at launch.
              <NonEditableContextMenu
                {...TASKS_CONTEXT_MENU_PROPS}
                contextData={{
                  ...contextData,
                  content: comments.map((c) => c.content).join("\n\n"),
                }}
              >
                <div className="mb-2 space-y-1.5 pl-1.5">
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-md border border-border/60 bg-card/40 p-2"
                    >
                      <p className="whitespace-pre-wrap text-xs text-foreground">
                        {c.content}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="size-2.5" />
                        {new Date(c.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </NonEditableContextMenu>
            ) : null}
            <ProTextarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              floatingLabel="Comment"
              autoGrow
              minHeight={compact ? 64 : 88}
              maxHeight={compact ? 160 : 220}
              enableHelpWithThis
              enableCustomAgent
              onSubmit={handleAddComment}
              submitDisabled={!newComment.trim()}
              isSubmitting={isAddingComment}
              submitLabel="Post comment"
              className={cn(
                "resize-none border-border/60 bg-card/40 text-sm",
                compact && "rounded-none border-x-0",
              )}
              wrapperClassName="w-full"
              style={{ fontSize: "16px" }}
            />
          </section>

          {/* Advanced */}
          <section>
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 pl-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              {showAdvanced ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <Info className="w-3 h-3" />
              Advanced
            </button>
            {showAdvanced && (
              <div
                className={cn(
                  "mt-3 overflow-hidden bg-card/40",
                  compact
                    ? "border-y border-border/60"
                    : "rounded-xl border border-border/60",
                )}
              >
                <PropertyRow label="Task ID" first compact={compact}>
                  <div className="flex items-center gap-1 w-full">
                    <code className="flex-1 text-[10px] font-mono bg-muted px-2 py-1 rounded truncate">
                      {taskId}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCopyId}
                      className="h-7 w-7 p-0 shrink-0"
                    >
                      {idCopied ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </PropertyRow>
                <PropertyRow label="Created" compact={compact}>
                  {task.created_at ? (
                    <span className="text-xs text-muted-foreground">
                      {new Date(task.created_at).toLocaleString()}
                    </span>
                  ) : metadataPending ? (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </PropertyRow>
                <PropertyRow label="Owner" last compact={compact}>
                  {task.user_id ? (
                    <code className="text-[10px] font-mono bg-muted px-2 py-1 rounded">
                      {task.user_id}
                    </code>
                  ) : metadataPending ? (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </PropertyRow>
              </div>
            )}
          </section>
        </div>
      </div>

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

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteConfirmOpen(false);
        }}
        title="Delete task"
        description="Delete this task? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        busy={isDeleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function SectionHeader({
  icon: Icon,
  label,
  count,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-2 flex items-center gap-1.5 pl-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon className="w-3 h-3" />}
      <span>{label}</span>
      {typeof count === "number" && (
        <span className="text-muted-foreground/60 tabular-nums">({count})</span>
      )}
    </div>
  );
}

function PropertyRow({
  icon: Icon,
  label,
  children,
  first,
  last,
  compact,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
  first?: boolean;
  last?: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex h-7 items-center gap-1.5 pl-1.5 pr-1">
        {Icon ? (
          <Icon className="size-3 shrink-0 text-muted-foreground" />
        ) : null}
        <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
          {label}
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5",
        !first && "border-t border-border/40",
      )}
    >
      <div className="flex w-20 shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {Icon && <Icon className="w-3 h-3" />}
        <span>{label}</span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
