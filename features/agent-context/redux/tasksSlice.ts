"use client";

import {
  createSlice,
  createEntityAdapter,
  createAsyncThunk,
  createSelector,
  PayloadAction,
} from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import type { TablesUpdate } from "@/types/database.types";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import {
  getProjectTasks,
  getTopLevelProjectTasks,
} from "@/features/tasks/services/taskService";
import type { NavTask } from "./hierarchySlice";
import type { DataLevel, DataLevelMeta } from "./organizationsSlice";
import { isStale } from "./organizationsSlice";

// ─── Entity shape ──────────────────────────────────────────────────────────

export interface TaskRecord {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  assignee_id: string | null;
  project_id: string | null; // null = orphaned task
  parent_task_id: string | null;
  organization_id: string; // denormalized for easy lookup by org
  // full-data only:
  description?: string | null;
  settings?: Record<string, unknown> | null;
  created_at?: string | null;
  created_by?: string | null;
  visibility?: string | null;
  updated_at?: string | null;
}

type TaskPriority = "low" | "medium" | "high";

function toTaskPriority(p: string | undefined | null): TaskPriority | null {
  if (p === "low" || p === "medium" || p === "high") return p;
  return null;
}

// ─── Adapter ───────────────────────────────────────────────────────────────

const tasksAdapter = createEntityAdapter<TaskRecord>();

interface TasksExtraState {
  meta: Record<string, DataLevelMeta>;
  loading: boolean;
  error: string | null;
}

const initialState = tasksAdapter.getInitialState<TasksExtraState>({
  meta: {},
  loading: false,
  error: null,
});

// ─── Thunks ────────────────────────────────────────────────────────────────

/**
 * Fetch a single task at "full-data" level.
 * Skips if the task already has full data that is not stale.
 * Returns null when skipped (reducer ignores null payloads).
 */
export const fetchTask = createAsyncThunk(
  "tasks/fetchOne",
  async (taskId: string, { getState }) => {
    const state = getState() as StateWithTasks;
    const meta = state.tasks.meta[taskId];
    if (meta && meta.level === "full-data" && !isStale(meta)) {
      return null; // already fresh full-data — skip network call
    }

    const { data, error } = await workspaceDb(supabase)
      .from("tasks")
      .select(
        "id, title, description, project_id, parent_task_id, status, priority, due_date, assignee_id, settings, created_at, updated_at, created_by, visibility",
      )
      .eq("id", taskId)
      .single();
    if (error) throw error;

    // Resolve organization_id: look it up from the project if available
    let organization_id = "";
    if ((data as { project_id?: string | null }).project_id) {
      const { data: proj } = await workspaceDb(supabase)
        .from("projects")
        .select("organization_id")
        .eq("id", (data as { project_id: string }).project_id)
        .single();
      organization_id =
        (proj as { organization_id?: string } | null)?.organization_id ?? "";
    }

    return {
      ...(data as Omit<TaskRecord, "organization_id">),
      organization_id,
    } as TaskRecord;
  },
);

/**
 * Fetch all open tasks for a project.
 * Stores at "thin-list" level (no description/settings).
 */
export const fetchProjectTasks = createAsyncThunk(
  "tasks/fetchByProject",
  async (params: { projectId: string; organizationId: string }) => {
    const { data, error } = await workspaceDb(supabase)
      .from("tasks")
      .select(
        "id, title, project_id, parent_task_id, status, priority, due_date, assignee_id",
      )
      .eq("project_id", params.projectId)
      .neq("status", "completed")
      .order("created_at", { ascending: false });
    if (error) throw error;

    const tasks: TaskRecord[] = (data ?? []).map((t) => ({
      ...(t as Omit<TaskRecord, "organization_id">),
      organization_id: params.organizationId,
    }));
    return { tasks, organizationId: params.organizationId };
  },
);

/**
 * Load a project's TOP-LEVEL tasks (parent_task_id IS NULL) into the slice at
 * "thin-list" level. Generic primitive consumed by any project-scoped task
 * list (e.g. a War Room project tile). The list only needs title/status; the
 * full task (description, subtasks, comments) is fetched on demand by the
 * editor when a task is opened.
 *
 * `organizationId` is denormalized onto each record for org-keyed selectors; it
 * is best-effort (callers that don't know it can omit it).
 */
export const loadProjectTopLevelTasks = createAsyncThunk(
  "tasks/loadProjectTopLevel",
  async (params: { projectId: string; organizationId?: string | null }) => {
    const rows = await getTopLevelProjectTasks(params.projectId);
    const tasks: TaskRecord[] = rows.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      due_date: t.due_date,
      assignee_id: t.assignee_id,
      project_id: t.project_id,
      parent_task_id: t.parent_task_id,
      organization_id: t.organization_id ?? params.organizationId ?? "",
      created_at: t.created_at,
      created_by: t.created_by,
    }));
    return tasks;
  },
);

/**
 * Load ALL of a project's tasks (parents AND subtasks) into the slice at
 * "thin-list" level. Use this when a surface renders the project's task TREE
 * (top-level rows with their nested subtasks), e.g. a War Room project tile.
 * `loadProjectTopLevelTasks` is the parents-only variant for surfaces that
 * defer subtasks to a task's own editor.
 */
export const loadProjectTasks = createAsyncThunk(
  "tasks/loadProjectAll",
  async (params: { projectId: string; organizationId?: string | null }) => {
    const rows = await getProjectTasks(params.projectId);
    const tasks: TaskRecord[] = rows.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      due_date: t.due_date,
      assignee_id: t.assignee_id,
      project_id: t.project_id,
      parent_task_id: t.parent_task_id,
      organization_id: t.organization_id ?? params.organizationId ?? "",
      created_at: t.created_at,
      created_by: t.created_by,
    }));
    return tasks;
  },
);

export const createTaskThunk = createAsyncThunk(
  "tasks/create",
  async (data: {
    title: string;
    project_id: string | null;
    organization_id: string;
    parent_task_id?: string | null;
    description?: string;
    status?: string;
    priority?: string | null;
  }) => {
    const userId = requireUserId();
    const { organization_id, priority, ...insertData } = data;
    const { data: task, error } = await workspaceDb(supabase)
      .from("tasks")
      .insert({
        ...insertData,
        organization_id: await ensureOrgId(organization_id),
        status: data.status ?? "not_started",
        priority: toTaskPriority(priority),
        created_by: userId,
        settings: {},
      })
      .select(
        "id, title, description, project_id, parent_task_id, status, priority, due_date, assignee_id, settings, created_at, updated_at, created_by, visibility",
      )
      .single();
    if (error) throw error;
    return {
      ...(task as Omit<TaskRecord, "organization_id">),
      organization_id,
    } as TaskRecord;
  },
);

export const updateTaskThunk = createAsyncThunk(
  "tasks/update",
  async (params: {
    id: string;
    patch: {
      title?: string;
      description?: string | null;
      status?: string;
      priority?: string | null;
      due_date?: string | null;
      project_id?: string | null;
    };
  }) => {
    const { priority, ...rest } = params.patch;
    const patch: TablesUpdate<{ schema: "workspace" }, "tasks"> = { ...rest };
    if (priority !== undefined) {
      patch.priority = toTaskPriority(priority);
    }
    const { error } = await workspaceDb(supabase)
      .from("tasks")
      .update(patch)
      .eq("id", params.id);
    if (error) throw error;
    return { id: params.id, patch: params.patch };
  },
);

export const deleteTaskThunk = createAsyncThunk(
  "tasks/delete",
  async (taskId: string) => {
    const { error } = await workspaceDb(supabase)
      .from("tasks")
      .delete()
      .eq("id", taskId);
    if (error) throw error;
    return taskId;
  },
);

// ─── Slice ─────────────────────────────────────────────────────────────────

const tasksSlice = createSlice({
  name: "tasks",
  initialState,
  reducers: {
    /**
     * Bulk-upsert tasks at "thin-list" level from get_user_full_context.
     * Called by hierarchyThunks after a successful full-context fetch.
     *
     * The new RPC returns tasks as a flat array per org (not nested under projects),
     * each task has a project_id field (null = orphaned).
     * Preserves full-data level for tasks that already have fresh full data.
     */
    hydrateTasksFromContext(
      state,
      action: PayloadAction<{ orgId: string; tasks: NavTask[] }[]>,
    ) {
      const now = Date.now();
      for (const { orgId, tasks } of action.payload) {
        const records: TaskRecord[] = tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          due_date: t.due_date,
          assignee_id: t.assignee_id,
          project_id: t.project_id,
          parent_task_id: t.parent_task_id,
          organization_id: orgId,
        }));
        tasksAdapter.upsertMany(state, records);
        for (const t of tasks) {
          const existing = state.meta[t.id];
          if (
            !existing ||
            existing.level === "thin-list" ||
            isStale(existing)
          ) {
            state.meta[t.id] = { level: "thin-list", fetchedAt: now };
          }
        }
      }
    },

    /**
     * Single upsert with explicit level — used after CRUD mutations.
     */
    upsertTaskWithLevel(
      state,
      action: PayloadAction<{ record: TaskRecord; level: DataLevel }>,
    ) {
      tasksAdapter.upsertOne(state, action.payload.record);
      state.meta[action.payload.record.id] = {
        level: action.payload.level,
        fetchedAt: Date.now(),
      };
    },

    /**
     * Synchronously remove a task from the slice.
     * Use after a successful DB delete to update local state immediately.
     */
    removeTaskFromSlice(state, action: PayloadAction<string>) {
      tasksAdapter.removeOne(state, action.payload);
      delete state.meta[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTask.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTask.fulfilled, (state, action) => {
        state.loading = false;
        if (!action.payload) return; // skipped — already fresh
        tasksAdapter.upsertOne(state, action.payload);
        state.meta[action.payload.id] = {
          level: "full-data",
          fetchedAt: Date.now(),
        };
      })
      .addCase(fetchTask.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to fetch task";
      })
      .addCase(fetchProjectTasks.fulfilled, (state, action) => {
        const now = Date.now();
        tasksAdapter.upsertMany(state, action.payload.tasks);
        for (const t of action.payload.tasks) {
          const existing = state.meta[t.id];
          if (!existing || isStale(existing)) {
            state.meta[t.id] = { level: "thin-list", fetchedAt: now };
          }
        }
      })
      .addCase(loadProjectTopLevelTasks.fulfilled, (state, action) => {
        const now = Date.now();
        tasksAdapter.upsertMany(state, action.payload);
        for (const t of action.payload) {
          const existing = state.meta[t.id];
          // Don't downgrade a fresh full-data row to thin-list.
          if (
            !existing ||
            existing.level === "thin-list" ||
            isStale(existing)
          ) {
            state.meta[t.id] = { level: "thin-list", fetchedAt: now };
          }
        }
      })
      .addCase(loadProjectTasks.fulfilled, (state, action) => {
        const now = Date.now();
        tasksAdapter.upsertMany(state, action.payload);
        for (const t of action.payload) {
          const existing = state.meta[t.id];
          // Don't downgrade a fresh full-data row to thin-list.
          if (
            !existing ||
            existing.level === "thin-list" ||
            isStale(existing)
          ) {
            state.meta[t.id] = { level: "thin-list", fetchedAt: now };
          }
        }
      })
      .addCase(createTaskThunk.fulfilled, (state, action) => {
        tasksAdapter.addOne(state, action.payload);
        state.meta[action.payload.id] = {
          level: "full-data",
          fetchedAt: Date.now(),
        };
      })
      .addCase(updateTaskThunk.fulfilled, (state, action) => {
        tasksAdapter.updateOne(state, {
          id: action.payload.id,
          changes: action.payload.patch,
        });
      })
      .addCase(deleteTaskThunk.fulfilled, (state, action) => {
        tasksAdapter.removeOne(state, action.payload);
        delete state.meta[action.payload];
      });
  },
});

export const {
  hydrateTasksFromContext,
  upsertTaskWithLevel,
  removeTaskFromSlice,
} = tasksSlice.actions;

export default tasksSlice.reducer;

// ─── Selectors ─────────────────────────────────────────────────────────────

type StateWithTasks = {
  tasks: ReturnType<typeof tasksSlice.reducer>;
};

const adapterSelectors = tasksAdapter.getSelectors(
  (state: StateWithTasks) => state.tasks,
);

export const selectAllTasks = adapterSelectors.selectAll;
export const selectTaskById = adapterSelectors.selectById;
export const selectTaskIds = adapterSelectors.selectIds;

export const selectTasksLoading = (state: StateWithTasks) =>
  state.tasks.loading;
export const selectTasksError = (state: StateWithTasks) => state.tasks.error;

export const selectTaskDataLevel = createSelector(
  [
    (state: StateWithTasks) => state.tasks.meta,
    (_state: StateWithTasks, taskId: string) => taskId,
  ],
  (meta, taskId): DataLevelMeta | null => meta[taskId] ?? null,
);

export const selectTaskIsFullData = createSelector(
  [
    (state: StateWithTasks) => state.tasks.meta,
    (_state: StateWithTasks, taskId: string) => taskId,
  ],
  (meta, taskId): boolean => {
    const m = meta[taskId];
    return !!m && m.level === "full-data" && !isStale(m);
  },
);

export const selectTasksByProject = createSelector(
  [selectAllTasks, (_state: StateWithTasks, projectId: string) => projectId],
  (tasks, projectId) => tasks.filter((t) => t.project_id === projectId),
);

/**
 * A project's TOP-LEVEL tasks (parent_task_id === null), oldest-first — the
 * list shape a project board / project-flavored surface renders. Pairs with
 * `loadProjectTopLevelTasks`. Subtasks are intentionally excluded; they belong
 * to a parent task's own editor.
 */
export const selectTopLevelTasksByProjectId = createSelector(
  [selectTasksByProject],
  (tasks) =>
    tasks
      .filter((t) => t.parent_task_id === null)
      .sort((a, b) => {
        const ac = a.created_at ?? "";
        const bc = b.created_at ?? "";
        return ac.localeCompare(bc);
      }),
);

export const selectSubtasksByParent = createSelector(
  [
    selectAllTasks,
    (_state: StateWithTasks, parentTaskId: string) => parentTaskId,
  ],
  (tasks, parentTaskId) =>
    tasks
      .filter((t) => t.parent_task_id === parentTaskId)
      .sort((a, b) => {
        const ac = a.created_at ?? "";
        const bc = b.created_at ?? "";
        return ac.localeCompare(bc);
      }),
);

export const selectOpenTasksByProject = createSelector(
  [selectTasksByProject],
  (tasks) => tasks.filter((t) => t.status !== "completed"),
);

export const selectTasksByOrg = createSelector(
  [selectAllTasks, (_state: StateWithTasks, orgId: string) => orgId],
  (tasks, orgId) => tasks.filter((t) => t.organization_id === orgId),
);

export const selectOrphanTasks = createSelector([selectTasksByOrg], (tasks) =>
  tasks.filter((t) => t.project_id === null),
);

export const selectTaskCountByProject = createSelector(
  [selectAllTasks],
  (tasks) => {
    const counts: Record<string, number> = {};
    for (const t of tasks) {
      if (t.project_id) {
        counts[t.project_id] = (counts[t.project_id] ?? 0) + 1;
      }
    }
    return counts;
  },
);
