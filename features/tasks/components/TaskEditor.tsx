"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Flag,
  Folder,
  User as UserIcon,
  MessageSquare,
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
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectProjects } from "@/features/tasks/redux/selectors";
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
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import * as taskService from "@/features/tasks/services/taskService";
import { TASK_LABEL_OPTIONS } from "@/features/tasks/services/taskService";
import type { TaskLabel } from "@/features/tasks/services/taskService";
import TaskScopeTags from "./TaskScopeTags";
import TaskAssigneePicker from "./TaskAssigneePicker";
import TaskAttachmentsPanel from "./TaskAttachmentsPanel";
import { TaskAssociatedResources } from "./TaskAssociatedResources";
import { Textarea } from "@/components/ui/textarea";
import { VoiceTextarea } from "@/components/official/VoiceTextarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  TaskPriorityPicker,
  TASK_PRIORITY_META,
  type TaskPriority,
} from "./TaskPriorityPicker";
import { TaskDueDatePicker } from "./TaskDueDatePicker";
import { formatDateOnly } from "@/utils/dateOnly";
import { cn } from "@/utils/cn";

type Priority = TaskPriority;

export default function TaskEditor({
  taskId: taskIdProp,
  embedded,
}: {
  /** When provided, edit this task directly (e.g. embedded in a War Room tile).
   *  Falls back to the global selected task (the /tasks/[id] route) when omitted. */
  taskId?: string;
  /** Embedded surfaces (tiles) hide the redundant "open in full page" link. */
  embedded?: boolean;
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

  return <TaskEditorInner taskId={taskId} embedded={embedded} key={taskId} />;
}

function TaskEditorInner({
  taskId,
  embedded,
}: {
  taskId: string;
  embedded?: boolean;
}) {
  const dispatch = useAppDispatch();
  const task = useAppSelector((s) => selectTaskById(s, taskId));
  const draft = useAppSelector(selectTaskEdit(taskId));
  const isDirty = useAppSelector(selectTaskIsDirty(taskId));
  const operatingTaskId = useAppSelector(selectOperatingTaskId);
  const projects = useAppSelector(selectProjects);
  const orgId = useAppSelector(selectOrganizationId);

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

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(taskId);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 1500);
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim() || isAddingSubtask) return;
    setIsAddingSubtask(true);
    try {
      const newId = await dispatch(
        createSubtaskThunk({
          parentTaskId: taskId,
          title: newSubtask.trim(),
        }),
      ).unwrap();
      if (newId) setNewSubtask("");
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
      {/* Compact title row — single line, minimal vertical real estate.
          Pills, description, properties etc. live in the scrollable body. */}
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

        <input
          value={effective.title}
          onChange={(e) => patch("title", e.target.value)}
          placeholder="Untitled task"
          className={cn(
            "flex-1 min-w-0 h-7 bg-transparent border-none outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground/50",
            completed && "line-through text-muted-foreground",
          )}
          style={{ fontSize: "16px" }}
        />

        <div className="flex items-center gap-0.5 shrink-0">
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
              <Link href={`/tasks/${taskId}`} target="_blank" rel="noopener noreferrer">
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

      {/* Scrollable body — left-aligned so content tracks the panel edge
          regardless of the editor column width. max-w-3xl just caps the
          reading width on ultra-wide displays so lines don't sprawl. */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl px-4 py-4 space-y-5">
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
          {/* Scope tags — prominent, directly under header */}
          {orgId && (
            <section>
              <SectionHeader icon={Tag} label="Tags" />
              <TaskScopeTags taskId={taskId} orgId={orgId} />
            </section>
          )}

          {/* Core properties — iOS-style grouped card */}
          <section className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
            <PropertyRow icon={UserIcon} label="Assignee" first>
              <TaskAssigneePicker
                assigneeId={effective.assigneeId ?? null}
                onChange={(id) => patch("assignee_id", id)}
              />
            </PropertyRow>

            <PropertyRow icon={Folder} label="Project">
              <ProjectSelect
                value={effective.projectId ?? null}
                onChange={(v) => patch("project_id", v)}
                options={projects
                  .filter((p) => p.id !== "__unassigned__")
                  .map((p) => ({ id: p.id, name: p.name }))}
              />
            </PropertyRow>

            <PropertyRow icon={Flag} label="Priority">
              <TaskPriorityPicker
                variant="segmented"
                value={effective.priority ?? null}
                onChange={(v) => patch("priority", v)}
              />
            </PropertyRow>

            <PropertyRow icon={Calendar} label="Due date" last>
              <TaskDueDatePicker
                variant="field"
                value={effective.dueDate ?? null}
                onChange={(v) => patch("due_date", v)}
              />
            </PropertyRow>
          </section>

          {/* Description */}
          <section>
            <SectionHeader icon={MessageSquare} label="Description" />
            <Textarea
              value={effective.description}
              onChange={(e) => patch("description", e.target.value)}
              placeholder="Add a description..."
              className="text-sm min-h-[120px] resize-y bg-card/40 border-border/60"
            />
          </section>

          {/* Labels */}
          <section>
            <SectionHeader icon={Tag} label="Labels" />
            <div className="flex flex-wrap gap-1.5">
              {TASK_LABEL_OPTIONS.map((opt) => {
                const active = effective.labels.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleLabel(opt.value)}
                    className={cn(
                      "h-6 px-2 rounded-full text-[11px] font-medium transition-colors border",
                      active
                        ? opt.color + " border-current"
                        : "text-muted-foreground bg-muted/40 border-transparent hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Subtasks */}
          <section>
            <SectionHeader
              icon={CheckSquare}
              label="Subtasks"
              count={subtasks.length}
            />
            <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
              {subtasks.length === 0 ? (
                <p className="px-4 py-3 text-xs text-muted-foreground italic">
                  No subtasks yet.
                </p>
              ) : (
                subtasks.map((st, i) => (
                  <div
                    key={st.id}
                    className={cn(
                      "group flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent/40",
                      i !== 0 && "border-t border-border/40",
                    )}
                  >
                    <Checkbox
                      checked={st.status === "completed"}
                      onCheckedChange={() => handleToggleSubtask(st.id)}
                    />
                    <span
                      className={cn(
                        "flex-1 text-sm",
                        st.status === "completed" &&
                          "line-through text-muted-foreground",
                      )}
                    >
                      {st.title}
                    </span>
                    <button
                      onClick={() => handleDeleteSubtask(st.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 bg-muted/20",
                  subtasks.length > 0 && "border-t border-border/40",
                )}
              >
                <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSubtask();
                    }
                  }}
                  placeholder="Add subtask..."
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
                  style={{ fontSize: "16px" }}
                  disabled={isAddingSubtask}
                />
                {newSubtask.trim() && (
                  <Button
                    size="sm"
                    onClick={handleAddSubtask}
                    disabled={isAddingSubtask}
                    className="h-6 px-2 text-[11px]"
                  >
                    {isAddingSubtask ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* Attachments — notes, files, messages, conversations, chat blocks */}
          <section>
            <TaskAttachmentsPanel taskId={taskId} />
          </section>

          {/* Associated resources — anything FK-linked to this task (task_id) */}
          <TaskAssociatedResources taskId={taskId} />

          {/* Comments */}
          <section>
            <SectionHeader
              icon={MessageSquare}
              label="Comments"
              count={comments.length}
            />
            {isLoadingComments ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading...
              </div>
            ) : comments.length > 0 ? (
              <div className="space-y-2 mb-2">
                {comments.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-lg border border-border/60 bg-card/40"
                  >
                    <p className="text-xs text-foreground whitespace-pre-wrap">
                      {c.content}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(c.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <VoiceTextarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment...  (⌘+Enter to post)"
              className="text-sm min-h-[88px] resize-y bg-card/40 border-border/60"
              rows={3}
              onSubmit={handleAddComment}
              submitDisabled={!newComment.trim()}
              isSubmitting={isAddingComment}
              submitLabel="Post comment"
            />
          </section>

          {/* Advanced */}
          <section>
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
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
              <div className="mt-3 rounded-xl border border-border/60 bg-card/40 overflow-hidden">
                <PropertyRow label="Task ID" first>
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
                <PropertyRow label="Created">
                  <span className="text-xs text-muted-foreground">
                    {task.created_at
                      ? new Date(task.created_at).toLocaleString()
                      : "—"}
                  </span>
                </PropertyRow>
                <PropertyRow label="Owner" last>
                  <code className="text-[10px] font-mono bg-muted px-2 py-1 rounded">
                    {task.user_id ?? "—"}
                  </code>
                </PropertyRow>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Sticky bottom action bar — duplicates the top-right cluster so save
          is always one tap away after long scrolls. `pb-safe` covers iOS
          home-indicator inset on responsive web. */}
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
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5",
        !first && "border-t border-border/40",
      )}
    >
      <div className="flex items-center gap-1.5 w-20 shrink-0 text-[11px] font-medium text-muted-foreground">
        {Icon && <Icon className="w-3 h-3" />}
        <span>{label}</span>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function ProjectSelect({
  value,
  onChange,
  options,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <select
      value={value ?? "__none__"}
      onChange={(e) =>
        onChange(e.target.value === "__none__" ? null : e.target.value)
      }
      className="h-8 w-full bg-card border border-border rounded-md px-2 text-xs outline-none hover:border-foreground/30 focus:border-primary/60 transition-colors"
    >
      <option value="__none__">Unassigned</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
