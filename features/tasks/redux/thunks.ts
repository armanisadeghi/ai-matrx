"use client";

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import * as taskService from "../services/taskService";
import type { UpdateTaskInput } from "../services/taskService";
import {
  createProject as createProjectSvc,
  updateProject as updateProjectSvc,
  deleteProject as deleteProjectSvc,
} from "@/features/projects/service";
import { generateProjectSlug } from "@/features/projects/types";
import {
  fetchFullContext,
  invalidateAndRefetchFullContext,
} from "@/features/agent-context/redux/hierarchyThunks";
import {
  upsertTaskWithLevel,
  removeTaskFromSlice,
  type TaskRecord,
} from "@/features/agent-context/redux/tasksSlice";
import { setEntityScopes } from "@/features/scopes/redux/thunks/setEntityScopes";
import { adjustProjectTaskCount } from "@/features/agent-context/redux/projectsSlice";
import {
  setIsCreatingProject,
  setIsCreatingTask,
  setOperatingTaskId,
  setOperatingProjectId,
  setActiveProject,
  setExpandedProjects,
  setNewProjectName,
  setNewTaskTitle,
  setLastCreatedTaskId,
  clearTaskEdit,
} from "./taskUiSlice";

/**
 * Load data for the /tasks route. Delegates entirely to the shared
 * `fetchFullContext` thunk — idempotent and deduplicated with every other
 * component in the app that depends on the hierarchy (sidebars, pickers, etc.).
 * No re-fetch if status is `loading` or `success`.
 */
export const loadProjectsWithTasks = createAsyncThunk<
  void,
  { force?: boolean } | undefined,
  { state: RootState; dispatch: AppDispatch }
>("tasksUi/loadProjectsWithTasks", async (arg, { dispatch }) => {
  const { force } = arg ?? {};
  if (force) {
    await dispatch(invalidateAndRefetchFullContext());
    return;
  }
  await dispatch(fetchFullContext());
});

/**
 * Idempotent initialization — ensures hierarchy is loaded and auto-selects
 * a first project if nothing is active yet.
 */
export const initializeTasks = createAsyncThunk<
  void,
  void,
  { state: RootState; dispatch: AppDispatch }
>("tasksUi/initialize", async (_, { dispatch, getState }) => {
  await dispatch(fetchFullContext());

  // Auto-select a reasonable active project if none is set
  const state = getState();
  if (!state.tasksUi.activeProject) {
    const allProjects = Object.values(
      (
        state as RootState & {
          projects: { entities: Record<string, { id: string }> };
        }
      ).projects.entities,
    ) as Array<{ id: string } | undefined>;
    const first = allProjects.find((p): p is { id: string } => !!p);
    if (first) {
      dispatch(setActiveProject(first.id));
      dispatch(setExpandedProjects([first.id]));
    }
  }
});

// ─── Project CRUD ──────────────────────────────────────────────────────────

export const createProjectThunk = createAsyncThunk<
  void,
  { name: string },
  { state: RootState; dispatch: AppDispatch }
>("tasksUi/createProject", async ({ name }, { dispatch }) => {
  if (!name.trim()) return;
  dispatch(setIsCreatingProject(true));
  try {
    const result = await createProjectSvc({
      name,
      slug: generateProjectSlug(name),
    });
    if (result.success && result.project) {
      dispatch(setActiveProject(result.project.id));
      dispatch(setNewProjectName(""));
      await dispatch(invalidateAndRefetchFullContext());
    }
  } finally {
    dispatch(setIsCreatingProject(false));
  }
});

export const updateProjectThunk = createAsyncThunk<
  void,
  { projectId: string; name: string },
  { state: RootState; dispatch: AppDispatch }
>("tasksUi/updateProject", async ({ projectId, name }, { dispatch }) => {
  dispatch(setOperatingProjectId(projectId));
  try {
    const result = await updateProjectSvc(projectId, { name });
    if (result.success) await dispatch(invalidateAndRefetchFullContext());
  } finally {
    dispatch(setOperatingProjectId(null));
  }
});

export const deleteProjectThunk = createAsyncThunk<
  void,
  string,
  { state: RootState; dispatch: AppDispatch }
>("tasksUi/deleteProject", async (projectId, { dispatch }) => {
  dispatch(setOperatingProjectId(projectId));
  try {
    const result = await deleteProjectSvc(projectId);
    if (result.success) await dispatch(invalidateAndRefetchFullContext());
  } finally {
    dispatch(setOperatingProjectId(null));
  }
});

// ─── Task CRUD ─────────────────────────────────────────────────────────────

function toTaskRecord(
  row: Awaited<ReturnType<typeof taskService.createTask>>,
  fallbackOrgId: string | null,
): TaskRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    due_date: row.due_date,
    assignee_id: row.assignee_id,
    project_id: row.project_id,
    parent_task_id: row.parent_task_id,
    organization_id: row.organization_id ?? fallbackOrgId ?? "",
    description: row.description,
    settings: (row as { settings?: Record<string, unknown> }).settings ?? null,
    created_at: row.created_at ?? null,
    created_by: row.created_by,
  } satisfies TaskRecord;
}

/**
 * Create a task, optionally assign scopes, and record lastCreatedTaskId.
 * Applies an optimistic upsert on the agent-context `tasks` slice so the
 * new task appears in /tasks + sidebar immediately.
 */
export const createTaskThunk = createAsyncThunk<
  string | null,
  {
    title: string;
    description?: string | null;
    dueDate?: string | null;
    projectId?: string | null;
    priority?: "low" | "medium" | "high" | null;
    organizationId?: string | null;
    scopeIds?: string[];
  },
  { state: RootState; dispatch: AppDispatch }
>("tasksUi/createTask", async (input, { dispatch, getState }) => {
  const state = getState();
  const title = input.title.trim();
  if (!title) return null;

  const projectId =
    input.projectId ??
    state.tasksUi.activeProject ??
    state.appContext.project_id ??
    null;
  const normalizedProjectId =
    projectId && projectId !== "__unassigned__" ? projectId : null;
  const organizationId =
    input.organizationId ?? state.appContext.organization_id ?? null;

  dispatch(setIsCreatingTask(true));
  try {
    const created = await taskService.createTask({
      title,
      description: input.description ?? null,
      due_date: input.dueDate ?? null,
      project_id: normalizedProjectId,
      priority: input.priority ?? null,
      organization_id: organizationId,
    });
    if (!created) return null;

    const record = toTaskRecord(created, organizationId);
    if (record) {
      dispatch(upsertTaskWithLevel({ record, level: "full-data" }));
      if (record.project_id) {
        dispatch(
          adjustProjectTaskCount({
            projectId: record.project_id,
            openDelta: record.status === "completed" ? 0 : 1,
            totalDelta: 1,
          }),
        );
      }
    }

    dispatch(setNewTaskTitle(""));
    dispatch(setLastCreatedTaskId(created.id));

    if (input.scopeIds && input.scopeIds.length > 0) {
      await dispatch(
        setEntityScopes({
          entityType: "task",
          entityId: created.id,
          scopeIds: input.scopeIds,
        }),
      );
    }

    return created.id;
  } finally {
    dispatch(setIsCreatingTask(false));
  }
});

/**
 * Create a subtask for a parent task and dispatch it to the agent-context
 * tasks slice so every consumer (TaskEditor, TaskListPane counts, nested
 * subtask renderers, etc.) reflects the new row immediately — no refetch
 * round-trip required.
 *
 * Subtasks inherit `organization_id` and `project_id` from the parent.
 * Same-project nesting matters for `selectProjects`: `buildNested()` only
 * pairs subtasks with parents inside the same project bucket, so a subtask
 * with `project_id = null` ends up as a standalone row under "Unassigned"
 * instead of nesting under its parent. Inheriting fixes that.
 */
export const createSubtaskThunk = createAsyncThunk<
  string | null,
  { parentTaskId: string; title: string; description?: string | null },
  { state: RootState; dispatch: AppDispatch }
>(
  "tasksUi/createSubtask",
  async ({ parentTaskId, title, description }, { dispatch, getState }) => {
    const trimmed = title.trim();
    if (!trimmed) return null;

    const parent = getState().tasks.entities[parentTaskId];
    const inheritedOrgId = parent?.organization_id ?? null;
    const inheritedProjectId = parent?.project_id ?? null;

    const created = await taskService.createTask({
      title: trimmed,
      description: description ?? null,
      parent_task_id: parentTaskId,
      project_id: inheritedProjectId,
      organization_id: inheritedOrgId,
      status: "incomplete",
    });
    if (!created) return null;

    const record = toTaskRecord(created, inheritedOrgId);
    if (record) {
      dispatch(upsertTaskWithLevel({ record, level: "full-data" }));
    }
    return created.id;
  },
);

export const toggleTaskCompleteThunk = createAsyncThunk<
  void,
  { taskId: string },
  { state: RootState; dispatch: AppDispatch }
>("tasksUi/toggleTaskComplete", async ({ taskId }, { dispatch, getState }) => {
  if (getState().tasksUi.operatingTaskId === taskId) return;
  dispatch(setOperatingTaskId(taskId));

  const current = getState().tasks.entities[taskId];
  if (!current) {
    dispatch(setOperatingTaskId(null));
    return;
  }
  const prevStatus = current.status;
  const newStatus = prevStatus === "completed" ? "incomplete" : "completed";

  // Optimistic update on the agent-context slice
  dispatch(
    upsertTaskWithLevel({
      record: { ...current, status: newStatus } as TaskRecord,
      level: "full-data",
    }),
  );

  if (current.project_id) {
    dispatch(
      adjustProjectTaskCount({
        projectId: current.project_id,
        openDelta:
          newStatus === "completed" ? -1 : prevStatus === "completed" ? 1 : 0,
        totalDelta: 0,
      }),
    );
  }

  try {
    const updated = await taskService.updateTask(taskId, {
      status: newStatus,
    });
    if (!updated) {
      // Rollback
      dispatch(
        upsertTaskWithLevel({
          record: current as TaskRecord,
          level: "full-data",
        }),
      );
      if (current.project_id) {
        dispatch(
          adjustProjectTaskCount({
            projectId: current.project_id,
            openDelta:
              newStatus === "completed"
                ? 1
                : prevStatus === "completed"
                  ? -1
                  : 0,
            totalDelta: 0,
          }),
        );
      }
    }
  } finally {
    dispatch(setOperatingTaskId(null));
  }
});

export const updateTaskFieldThunk = createAsyncThunk<
  void,
  {
    taskId: string;
    patch: UpdateTaskInput;
  },
  { state: RootState; dispatch: AppDispatch }
>(
  "tasksUi/updateTaskField",
  async ({ taskId, patch }, { dispatch, getState }) => {
    dispatch(setOperatingTaskId(taskId));
    const current = getState().tasks.entities[taskId];
    if (!current) {
      dispatch(setOperatingTaskId(null));
      return;
    }

    dispatch(
      upsertTaskWithLevel({
        record: { ...current, ...patch } as TaskRecord,
        level: "full-data",
      }),
    );

    try {
      const updated = await taskService.updateTask(taskId, patch);
      if (!updated) {
        dispatch(
          upsertTaskWithLevel({
            record: current as TaskRecord,
            level: "full-data",
          }),
        );
      }
    } finally {
      dispatch(setOperatingTaskId(null));
    }
  },
);

export const moveTaskThunk = createAsyncThunk<
  void,
  { taskId: string; fromProjectId: string; toProjectId: string | null },
  { state: RootState; dispatch: AppDispatch }
>(
  "tasksUi/moveTask",
  async ({ taskId, fromProjectId, toProjectId }, { dispatch, getState }) => {
    dispatch(setOperatingTaskId(taskId));
    const current = getState().tasks.entities[taskId];
    if (!current) {
      dispatch(setOperatingTaskId(null));
      return;
    }

    const normalizedTo =
      toProjectId && toProjectId !== "__unassigned__" ? toProjectId : null;

    dispatch(
      upsertTaskWithLevel({
        record: { ...current, project_id: normalizedTo } as TaskRecord,
        level: "full-data",
      }),
    );
    if (fromProjectId && fromProjectId !== "__unassigned__") {
      dispatch(
        adjustProjectTaskCount({
          projectId: fromProjectId,
          openDelta: current.status === "completed" ? 0 : -1,
          totalDelta: -1,
        }),
      );
    }
    if (normalizedTo) {
      dispatch(
        adjustProjectTaskCount({
          projectId: normalizedTo,
          openDelta: current.status === "completed" ? 0 : 1,
          totalDelta: 1,
        }),
      );
    }

    try {
      const updated = await taskService.updateTask(taskId, {
        project_id: normalizedTo,
      });
      if (!updated) {
        // Rollback
        dispatch(
          upsertTaskWithLevel({
            record: current as TaskRecord,
            level: "full-data",
          }),
        );
      }
    } finally {
      dispatch(setOperatingTaskId(null));
    }
  },
);

export const deleteTaskThunk = createAsyncThunk<
  void,
  { taskId: string; projectId: string },
  { state: RootState; dispatch: AppDispatch }
>(
  "tasksUi/deleteTask",
  async ({ taskId, projectId }, { dispatch, getState }) => {
    if (getState().tasksUi.operatingTaskId === taskId) return;
    dispatch(setOperatingTaskId(taskId));
    const current = getState().tasks.entities[taskId];
    if (!current) {
      dispatch(setOperatingTaskId(null));
      return;
    }

    dispatch(removeTaskFromSlice(taskId));
    if (projectId && projectId !== "__unassigned__") {
      dispatch(
        adjustProjectTaskCount({
          projectId,
          openDelta: current.status === "completed" ? 0 : -1,
          totalDelta: -1,
        }),
      );
    }

    try {
      const ok = await taskService.deleteTask(taskId);
      if (!ok) {
        // Rollback
        dispatch(
          upsertTaskWithLevel({
            record: current as TaskRecord,
            level: "full-data",
          }),
        );
      }
    } finally {
      dispatch(setOperatingTaskId(null));
    }
  },
);

/**
 * Persist the pending draft for a task:
 * - Core columns → optimistic `updateTaskFieldThunk`
 * - Labels → `taskService.updateTaskLabels` (stored in settings JSONB)
 * Clears the draft on success.
 */
export const saveTaskEditsThunk = createAsyncThunk<
  void,
  { taskId: string },
  { state: RootState; dispatch: AppDispatch }
>("tasksUi/saveTaskEdits", async ({ taskId }, { dispatch, getState }) => {
  const draft = getState().tasksUi.taskEdits[taskId];
  if (!draft) return;

  const { labels, ...core } = draft;
  if (Object.keys(core).length > 0) {
    await dispatch(updateTaskFieldThunk({ taskId, patch: core }));
  }
  if (labels !== undefined) {
    await taskService.updateTaskLabels(
      taskId,
      labels as Parameters<typeof taskService.updateTaskLabels>[1],
    );
  }
  dispatch(clearTaskEdit(taskId));
});
