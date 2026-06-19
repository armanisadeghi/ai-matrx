"use client";

// features/tasks/components/TaskContextSection.tsx
//
// Canonical context assignment for tasks — org, scope types/scopes, and project.
// Tasks never show the Tasks dimension (no task-within-task FK).
//
//   • TaskContextPicker  — compact summary + popover (default for task UIs)
//   • TaskContextSection — full inline field (expanded / demos only)
//
// Writes:
//   • Scopes → ctx_scope_assignments via ContextAssignmentField (live).
//   • project_id → moveTaskThunk from onSaved (same pattern as notes FK adapter).

import { useMemo } from "react";
import { ChevronDown, ListTodo } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectTaskById } from "@/features/agent-context/redux/tasksSlice";
import {
  ContextAssignmentField,
  type ContextAssignmentDimension,
  type ContextAssignmentFieldProps,
  type ContextAssignmentSaveResult,
} from "@/features/scopes/components/context-assignment/ContextAssignmentField";
import { ContextAssignmentPopover } from "@/features/scopes/components/context-assignment/ContextAssignmentPopover";
import {
  ContextSummaryChips,
  type ContextSummaryInput,
} from "@/features/scopes/components/context-assignment/ContextSummaryChips";
import { useEntityScopes } from "@/features/scopes/hooks/useEntityScopes";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import { selectProjects } from "@/features/tasks/redux/selectors";
import { moveTaskThunk } from "@/features/tasks/redux/thunks";
import { cn } from "@/utils/cn";
import type { AppDispatch } from "@/lib/redux/store";

/** Task tagging surfaces: scopes + project FK; never nested task links. */
export const TASK_CONTEXT_DIMENSIONS: ContextAssignmentDimension[] = [
  "scopes",
  "projects",
];

function taskSaveAdapter(
  dispatch: AppDispatch,
  taskId: string,
  currentProjectId: string | null,
  afterSave?: () => void,
) {
  return async (r: ContextAssignmentSaveResult) => {
    if (!r.ok) return;
    const nextProjectId = r.selection.projectIds[0] ?? null;
    const from =
      currentProjectId && currentProjectId !== "__unassigned__"
        ? currentProjectId
        : null;
    if (nextProjectId !== from) {
      await dispatch(
        moveTaskThunk({
          taskId,
          fromProjectId: from ?? "",
          toProjectId: nextProjectId,
        }),
      );
    }
    await dispatch(invalidateAndRefetchFullContext());
    afterSave?.();
  };
}

function useTaskContextField(taskId: string, taskTitle?: string) {
  const dispatch = useAppDispatch();
  const task = useAppSelector((s) => selectTaskById(s, taskId));
  const projects = useAppSelector(selectProjects);
  const entityScopes = useEntityScopes({
    entityType: "task",
    entityId: taskId,
  });

  const onSaved = useMemo(
    () =>
      taskSaveAdapter(
        dispatch,
        taskId,
        task?.project_id ?? null,
        () => void entityScopes.refresh(),
      ),
    [dispatch, taskId, task?.project_id, entityScopes.refresh],
  );

  const initialProjectIds =
    task?.project_id && task.project_id !== "__unassigned__"
      ? [task.project_id]
      : [];

  const projectName = useMemo(() => {
    const pid = task?.project_id;
    if (!pid || pid === "__unassigned__") return null;
    return projects.find((p) => p.id === pid)?.name ?? null;
  }, [projects, task?.project_id]);

  const summary: ContextSummaryInput = useMemo(
    () => ({
      organizationId: task?.organization_id || null,
      scopeIds: entityScopes.scopeIds,
      projectId:
        task?.project_id && task.project_id !== "__unassigned__"
          ? task.project_id
          : null,
      projectName,
    }),
    [
      task?.organization_id,
      task?.project_id,
      entityScopes.scopeIds,
      projectName,
    ],
  );

  const fieldProps = {
    mode: "assignment" as const,
    writeMode: "live" as const,
    subject: {
      entityType: "task" as const,
      entityId: taskId,
      title: taskTitle ?? task?.title ?? "Untitled task",
      icon: ListTodo,
    },
    dimensions: TASK_CONTEXT_DIMENSIONS,
    defaultOrganizationId: task?.organization_id || undefined,
    initialSelection: { projectIds: initialProjectIds },
    hideSubject: true,
    onSaved,
  };

  return { task, summary, fieldProps };
}

export type TaskContextPickerProps = {
  taskId: string;
  taskTitle?: string;
  className?: string;
  /** Chip density — `sm` fits property rows and side panels. */
  size?: "sm" | "default";
  align?: "start" | "center" | "end";
};

/** Compact control: selected context as chips; click opens the canonical picker. */
export function TaskContextPicker({
  taskId,
  taskTitle,
  className,
  size = "sm",
  align = "start",
}: TaskContextPickerProps) {
  const { task, summary, fieldProps } = useTaskContextField(taskId, taskTitle);
  if (!task) return null;

  return (
    <ContextAssignmentPopover
      {...fieldProps}
      align={align}
      sectionHeight={320}
      trigger={
        <button
          type="button"
          className={cn(
            "flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-left transition-colors",
            "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
            className,
          )}
        >
          <ContextSummaryChips
            value={summary}
            size={size}
            emptyText="Set context…"
            className="min-w-0 flex-1"
          />
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      }
    />
  );
}

export type TaskContextSectionProps = Pick<
  ContextAssignmentFieldProps,
  "hideSubject" | "sectionHeight" | "className" | "fill" | "checkboxVariant"
> & {
  taskId: string;
  taskTitle?: string;
};

/** Full inline field — use when space is not constrained (labs, expanded panels). */
export function TaskContextSection({
  taskId,
  taskTitle,
  hideSubject = true,
  sectionHeight = 280,
  className,
  fill,
  checkboxVariant,
}: TaskContextSectionProps) {
  const { task, fieldProps } = useTaskContextField(taskId, taskTitle);
  if (!task) return null;

  return (
    <ContextAssignmentField
      key={taskId}
      {...fieldProps}
      checkboxVariant={checkboxVariant}
      sectionHeight={sectionHeight}
      className={className}
      fill={fill}
      hideSubject={hideSubject}
    />
  );
}
