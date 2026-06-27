"use client";

// TaskEditorBody — the scrollable CONTENT of a task (everything that is not the
// title strip or the footer): quick-meta pills, core properties, description
// (with the agent context menu), labels, subtasks, attachments, associated
// resources, comments, advanced. It owns the body-local state (comments,
// subtask input, advanced toggle, description selection) and reads the shared
// task-edit state (effective values, patch, save/toggle/delete handlers) from
// the TaskEditorController context.
//
// This is the single content surface reused by BOTH the inline TaskEditor
// (route + embedded tiles) and the floating Tasks window — so the window can be
// pure content in its body while presenting the name + controls in slots. It
// renders NO chrome and imports NO WindowPanel (bundle invariant).
//
// The JSX is moved verbatim from the original TaskEditor body (zero visual
// change for the ~9 existing consumers).

import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  Flag,
  User as UserIcon,
  CheckSquare,
  Loader2,
  Trash2,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Tag,
  Info,
  Clock,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectSubtasksByParent,
  upsertTaskWithLevel,
} from "@/features/agent-context/redux/tasksSlice";
import {
  toggleTaskCompleteThunk,
  deleteTaskThunk,
  createSubtaskThunk,
} from "@/features/tasks/redux/thunks";
import * as taskService from "@/features/tasks/services/taskService";
import { TASK_LABEL_OPTIONS } from "@/features/tasks/services/taskService";
import type { TaskLabel } from "@/features/tasks/services/taskService";
import type { Comment } from "@/features/comments/types";
import { TaskContextPicker } from "../TaskContextSection";
import TaskAssigneePicker from "../TaskAssigneePicker";
import TaskAttachmentsPanel from "../TaskAttachmentsPanel";
import { TaskAssociatedResources } from "../TaskAssociatedResources";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ProInput } from "@/components/official/ProInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TaskPriorityPicker, TASK_PRIORITY_META } from "../TaskPriorityPicker";
import { TaskDueDatePicker } from "../TaskDueDatePicker";
import { useOpenTaskEditorWindow } from "@/features/overlays/openers/taskEditorWindow";
import { formatDateOnly } from "@/utils/dateOnly";
import { cn } from "@/utils/cn";
import { useRefocusInputAfterAsync } from "@/features/tasks/hooks/useRefocusInputAfterAsync";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  buildTasksContextData,
  createTasksExtraSections,
  TASKS_CONTEXT_MENU_PROPS,
} from "@/features/tasks/agent-context/buildTasksContextData";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v2/utils/build-application-scope";
import { useTaskEditorControllerCtx } from "./TaskEditorControllerContext";
import { SectionHeader, PropertyRow } from "./editorPrimitives";

export function TaskEditorBody({
  compact,
  onOpenLinkedTask,
}: {
  /** Dense tile hosts (grid / combined) — flush to edges, no interior gutter. */
  compact?: boolean;
  /** In-tile drill-down: open a linked task (subtask) without leaving the tile. */
  onOpenLinkedTask?: (taskId: string) => void;
}) {
  const {
    taskId,
    task,
    effective,
    completed,
    project,
    orgId,
    metadataPending,
    patch,
    handleSave,
    handleToggleComplete,
    handleDelete,
  } = useTaskEditorControllerCtx();

  const dispatch = useAppDispatch();
  const openTaskEditor = useOpenTaskEditorWindow();

  // Live selection inside the description editor (read from the DOM at trigger
  // time, mirrored to state so contextData refreshes for menu/agent runs).
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const [descSelectionStart, setDescSelectionStart] = useState(0);
  const [descSelectionEnd, setDescSelectionEnd] = useState(0);

  const syncDescriptionSelection = () => {
    const el = descriptionRef.current;
    if (!el) return;
    setDescSelectionStart(el.selectionStart);
    setDescSelectionEnd(el.selectionEnd);
  };

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [idCopied, setIdCopied] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
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
              created_by: row.created_by,
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

  // Defensive: the provider only mounts the body with a loaded task; this keeps
  // TypeScript honest about the nullable controller `task`.
  if (!task) return null;

  const completedSubtasks = subtasks.filter(
    (s) => s.status === "completed",
  ).length;

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

  // Plain function (NOT useCallback): reads the live selection from the DOM at
  // call time, not from render state. React Compiler memoizes it anyway.
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

  // Task-specific menu items (Save / toggle complete / Delete) wired to the
  // live task — the core menu renders them; we only describe + supply handlers.
  const tasksExtras = createTasksExtraSections({
    onSave: () => void handleSave(),
    onToggleComplete: handleToggleComplete,
    onDelete: handleDelete,
    completed: !!completed,
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

  return (
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
          <PropertyRow icon={UserIcon} label="Assignee" first compact={compact}>
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

          <PropertyRow icon={Calendar} label="Due date" last compact={compact}>
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
                content: comments.map((c) => c.body).join("\n\n"),
              }}
            >
              <div className="mb-2 space-y-1.5 pl-1.5">
                {comments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-md border border-border/60 bg-card/40 p-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-foreground">
                      {c.body}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="size-2.5" />
                      {new Date(c.createdAt).toLocaleString()}
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
                {task.created_by ? (
                  <code className="text-[10px] font-mono bg-muted px-2 py-1 rounded">
                    {task.created_by}
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
  );
}
