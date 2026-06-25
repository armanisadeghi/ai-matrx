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
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
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
} from "@/features/tasks/redux/thunks";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import { selectProjectById } from "@/features/agent-context/redux/projectsSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useEnsureTaskLoaded } from "@/features/tasks/hooks/useEnsureTaskLoaded";
import type { TaskPriority } from "../TaskPriorityPicker";

type Priority = TaskPriority;

export type TaskEditorController = ReturnType<typeof useTaskEditorController>;

export function useTaskEditorController(taskId: string) {
  const dispatch = useAppDispatch();
  const { metadataPending } = useEnsureTaskLoaded(taskId);
  const task = useAppSelector((s) => selectTaskById(s, taskId));
  const draft = useAppSelector(selectTaskEdit(taskId));
  const isDirty = useAppSelector(selectTaskIsDirty(taskId));
  const operatingTaskId = useAppSelector(selectOperatingTaskId);
  const orgId = useAppSelector(selectOrganizationId);
  const project = useAppSelector((s) =>
    task?.project_id ? selectProjectById(s, task.project_id) : undefined,
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Effective values — draft overlay over the persisted task. Tolerates a
  // not-yet-loaded task (callers gate on `task` before rendering chrome/body).
  const effective = {
    title: draft.title ?? task?.title ?? "",
    description:
      draft.description !== undefined
        ? draft.description
        : (task?.description ?? ""),
    dueDate: draft.due_date !== undefined ? draft.due_date : (task?.due_date ?? null),
    priority: (draft.priority !== undefined
      ? draft.priority
      : (task?.priority as Priority)) as Priority,
    projectId:
      draft.project_id !== undefined ? draft.project_id : (task?.project_id ?? null),
    assigneeId:
      draft.assignee_id !== undefined
        ? draft.assignee_id
        : (task?.assignee_id ?? null),
    labels:
      draft.labels !== undefined
        ? draft.labels
        : ((task?.settings as { labels?: string[] } | null)?.labels ?? []),
  };

  const completed = task?.status === "completed";
  const isOperating = operatingTaskId === taskId;

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
          projectId: task?.project_id ?? "__unassigned__",
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

  return {
    taskId,
    task,
    effective,
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
