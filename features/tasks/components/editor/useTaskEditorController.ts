"use client";

// useTaskEditorController — the single hub of shared task-edit state + handlers.
//
// Hoists everything the task editor's CHROME (title, complete-toggle, header
// actions, footer) AND its body need to share: the effective field values, the
// dirty/saving/deleting/operating flags, the save/discard/delete/toggle
// handlers, and the delete-confirm lifecycle. One instance per task subtree
// (provided via TaskEditorControllerProvider), so the title field, the action
// cluster, and the footer never disagree on `isSaving` and there is exactly one
// delete ConfirmDialog.
//
// All field state is read from Redux keyed by `taskId` (taskUiSlice drafts +
// the agent-context entity adapter) — this hook owns no field state of its own,
// only the transient operation flags. That keeps decomposed units a pure
// `read-by-id` surface (the notes leaf-unit pattern).

import { useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  selectTaskEdit,
  selectTaskIsDirty,
  selectIsTaskOperating,
  patchTaskEdit,
  clearTaskEdit,
} from "@/features/tasks/redux/taskUiSlice";
import {
  saveTaskEditsThunk,
  toggleTaskCompleteThunk,
  deleteTaskThunk,
} from "@/features/tasks/redux/thunks";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import type { TaskRecord } from "@/features/agent-context/redux/tasksSlice";
import { selectProjectById } from "@/features/agent-context/redux/projectsSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useEnsureTaskLoaded } from "@/features/tasks/hooks/useEnsureTaskLoaded";
import { normalizeTaskStatus } from "@/features/tasks/constants/status";
import { TASK_LABELS, type TaskLabel } from "@/features/tasks/constants/labels";
import type { TaskEditDraft } from "@/features/tasks/redux/taskUiSlice";
import { toast } from "@/lib/toast";

export type TaskEditorController = ReturnType<typeof useTaskEditorController>;

function isTaskLabel(value: unknown): value is TaskLabel {
  return (
    typeof value === "string" &&
    TASK_LABELS.some((candidate) => candidate === value)
  );
}

/**
 * The ONE draft-over-saved projection used by both the visible editor and the
 * submit-time surface scope. Keeping it pure makes the read-back contract
 * testable and prevents the agent path from inventing a second task model.
 */
export function resolveTaskEditorEffective(
  task: TaskRecord | undefined,
  draft: TaskEditDraft,
) {
  const savedPriority =
    task?.priority === "low" ||
    task?.priority === "medium" ||
    task?.priority === "high"
      ? task.priority
      : null;
  const savedLabels = Array.isArray(task?.settings?.labels)
    ? task.settings.labels.filter(isTaskLabel)
    : [];

  return {
    title: draft.title ?? task?.title ?? "",
    description:
      draft.description !== undefined
        ? draft.description
        : (task?.description ?? ""),
    dueDate:
      draft.due_date !== undefined ? draft.due_date : (task?.due_date ?? null),
    priority: draft.priority !== undefined ? draft.priority : savedPriority,
    projectId:
      draft.project_id !== undefined
        ? draft.project_id
        : (task?.project_id ?? null),
    assigneeId:
      draft.assignee_id !== undefined
        ? draft.assignee_id
        : (task?.assignee_id ?? null),
    labels: draft.labels !== undefined ? draft.labels : savedLabels,
    status:
      draft.status !== undefined
        ? draft.status
        : normalizeTaskStatus(task?.status),
    startDate:
      draft.start_date !== undefined
        ? draft.start_date
        : (task?.start_date ?? null),
    recurrenceRule:
      draft.recurrence_rule !== undefined
        ? draft.recurrence_rule
        : (task?.recurrence_rule ?? null),
  };
}

export function useTaskEditorController(taskId: string) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { metadataPending } = useEnsureTaskLoaded(taskId);
  const task = useAppSelector((s) => selectTaskById(s, taskId));
  const draft = useAppSelector(selectTaskEdit(taskId));
  const isDirty = useAppSelector(selectTaskIsDirty(taskId));
  const isOperating = useAppSelector(selectIsTaskOperating(taskId));
  const orgId = useAppSelector(selectOrganizationId);
  const project = useAppSelector((s) =>
    task?.project_id ? selectProjectById(s, task.project_id) : undefined,
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Effective values — draft overlay over the persisted task. Tolerates a
  // not-yet-loaded task (callers gate on `task` before rendering chrome/body).
  const effective = resolveTaskEditorEffective(task, draft);

  // Surface scope is sampled on execution. Read the same Redux task+draft
  // pair at that instant so a save followed immediately by a new run cannot
  // observe the prior render's status or labels.
  const readEffective = () => {
    const state = store.getState();
    return resolveTaskEditorEffective(
      selectTaskById(state, taskId),
      selectTaskEdit(taskId)(state),
    );
  };

  const completed = normalizeTaskStatus(task?.status) === "completed";

  // Plain functions (React Compiler memoizes) — mirrors the original TaskEditor.
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
      await dispatch(saveTaskEditsThunk({ taskId })).unwrap();
    } catch (error) {
      console.error("Error saving task:", error);
      toast.error("Could not save task");
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
          projectId: task?.project_id ?? "__unassigned__",
        }),
      ).unwrap();
      setDeleteConfirmOpen(false);
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Could not delete task");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleComplete = async () => {
    try {
      await dispatch(toggleTaskCompleteThunk({ taskId })).unwrap();
    } catch (error) {
      console.error("Error changing task completion:", error);
      toast.error("Could not update task completion");
    }
  };

  return {
    taskId,
    task,
    effective,
    readEffective,
    completed,
    isDirty,
    isSaving,
    isDeleting,
    isOperating,
    project,
    orgId,
    metadataPending,
    patch,
    handleSave,
    handleDiscard,
    handleDelete,
    handleToggleComplete,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    confirmDelete,
  };
}
