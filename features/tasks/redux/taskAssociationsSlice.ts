"use client";

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import {
  upsertTaskWithLevel,
  type TaskRecord,
} from "@/features/agent-context/redux/tasksSlice";
import { adjustProjectTaskCount } from "@/features/agent-context/redux/projectsSlice";
import { createTask } from "@/features/tasks/services/taskService";
import { associationsService } from "@/features/scopes/service/associationsService";
import { isScopesRpcErr } from "@/features/scopes/types";

/** One row of the canonical `platform.associations` edge (source → target=`task`). */
export interface AssociationRef {
  id: string;
  entity_type: string;
  entity_id: string;
  label: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Aggregated bundle of what's attached to a task — returned by `get_task_associations`. */
export interface TaskAssociationsBundle {
  task_id: string;
  notes: {
    id: string;
    label: string;
    updated_at: string;
    folder_name?: string | null;
  }[];
  files: {
    id: string;
    filename: string;
    mime_type: string | null;
    storage_path: string;
    created_at: string;
  }[];
  /** Generic (non-AI) messages from the `messages` table */
  messages: {
    id: string;
    conversation_id: string;
    preview: string;
    created_at: string;
  }[];
  /** AI chat messages from `cx_message` */
  cx_messages: {
    id: string;
    conversation_id: string;
    role: string | null;
    preview: string;
    created_at: string;
  }[];
  conversations: { id: string; name: string; type: string }[];
  /** AI chat conversations from `cx_conversation` */
  cx_conversations: { id: string; title: string }[];
  agent_conversations: { id: string; title: string | null }[];
  blocks: {
    id: string;
    message_id: string;
    block_index: number;
    preview: string | null;
  }[];
  other: AssociationRef[];
  all: AssociationRef[];
  loadedAt: number;
}

/** Reverse lookup: for a given source entity, which tasks reference it. */
export interface TaskForEntityRef {
  task_id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  organization_id: string | null;
  project_id: string | null;
  association_id: string;
  associated_at: string;
}

export interface TaskAssociationsState {
  byTaskId: Record<string, TaskAssociationsBundle>;
  byEntityKey: Record<string, TaskForEntityRef[]>; // key = `${entity_type}:${entity_id}`
  loadingByTaskId: Record<string, boolean>;
  loadingByEntityKey: Record<string, boolean>;
  error: string | null;
}

const initialState: TaskAssociationsState = {
  byTaskId: {},
  byEntityKey: {},
  loadingByTaskId: {},
  loadingByEntityKey: {},
  error: null,
};

const entityKey = (type: string, id: string) => `${type}:${id}`;

// ─── Thunks ──────────────────────────────────────────────────────────────

export const fetchTaskAssociations = createAsyncThunk<
  TaskAssociationsBundle,
  string,
  { dispatch: ThunkDispatch<object, unknown, UnknownAction> }
>("taskAssociations/fetch", async (taskId) => {
  const { data, error } = await supabase.rpc("get_task_associations", {
    p_task_id: taskId,
  });
  if (error) throw error;
  // `get_task_associations` returns Json directly (no row schema to guard).
  const raw: Partial<TaskAssociationsBundle> =
    data === null ? {} : (data as Partial<TaskAssociationsBundle>);
  return {
    task_id: taskId,
    notes: raw.notes ?? [],
    files: raw.files ?? [],
    messages: raw.messages ?? [],
    cx_messages: raw.cx_messages ?? [],
    conversations: raw.conversations ?? [],
    cx_conversations: raw.cx_conversations ?? [],
    agent_conversations: raw.agent_conversations ?? [],
    blocks: raw.blocks ?? [],
    other: raw.other ?? [],
    all: raw.all ?? [],
    loadedAt: Date.now(),
  };
});

export const fetchTasksForEntity = createAsyncThunk<
  { key: string; tasks: TaskForEntityRef[] },
  { entityType: string; entityId: string }
>("taskAssociations/fetchForEntity", async ({ entityType, entityId }) => {
  const { data, error } = await supabase.rpc("get_tasks_for_entity", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) throw error;
  // `get_tasks_for_entity` returns Json directly (no row schema to guard).
  const raw: { tasks?: TaskForEntityRef[] } =
    data === null ? {} : (data as { tasks?: TaskForEntityRef[] });
  return {
    key: entityKey(entityType, entityId),
    tasks: raw.tasks ?? [],
  };
});

export const associateWithTask = createAsyncThunk<
  AssociationRef,
  {
    taskId: string;
    entityType: string;
    entityId: string;
    label?: string;
    metadata?: Record<string, unknown>;
  },
  { dispatch: ThunkDispatch<object, unknown, UnknownAction> }
>(
  "taskAssociations/associate",
  async ({ taskId, entityType, entityId, label, metadata }, { dispatch }) => {
    // Canonical path: the generic `assoc_add` edge (entity → task) via the
    // associationsService chokepoint — NOT the graveyarded `associate_with_task`
    // RPC, which hand-rolled a 4-column ON CONFLICT that matched no unique index
    // (the 5-tuple incl. role) and threw 42P10. The service validates the token +
    // ids up front and resolves the org from the task.
    const res = await associationsService.add({
      sourceType: entityType,
      sourceId: entityId,
      targetType: "task",
      targetId: taskId,
      label: label ?? undefined,
      metadata: metadata ?? {},
    });
    if (isScopesRpcErr(res)) {
      console.error("[associateWithTask] association failed:", {
        message: res.error.message,
        code: res.error.code,
        args: { taskId, entityType, entityId, label },
      });
      throw new Error(res.error.message);
    }
    // Refresh both sides of the linkage
    await Promise.all([
      dispatch(fetchTaskAssociations(taskId)),
      dispatch(fetchTasksForEntity({ entityType, entityId })),
    ]);
    return {
      id: res.data.id,
      entity_type: entityType,
      entity_id: entityId,
      label: label ?? null,
      metadata: metadata ?? {},
      created_at: new Date().toISOString(),
    };
  },
);

export const dissociateFromTask = createAsyncThunk<
  { taskId: string; entityType: string; entityId: string },
  { taskId: string; entityType: string; entityId: string },
  { dispatch: ThunkDispatch<object, unknown, UnknownAction> }
>(
  "taskAssociations/dissociate",
  async ({ taskId, entityType, entityId }, { dispatch }) => {
    // Canonical path: the generic `assoc_remove` edge (entity → task) via the
    // associationsService chokepoint — NOT the bespoke `dissociate_from_task`
    // RPC (a pure duplicate of `assoc_remove`, left behind when its sibling
    // associate/create thunks moved to the chokepoint). The service validates
    // the token + ids up front.
    const res = await associationsService.remove({
      sourceType: entityType,
      sourceId: entityId,
      targetType: "task",
      targetId: taskId,
    });
    if (isScopesRpcErr(res)) {
      console.error("[dissociateFromTask] dissociation failed:", {
        message: res.error.message,
        code: res.error.code,
        args: { taskId, entityType, entityId },
      });
      throw new Error(res.error.message);
    }
    await Promise.all([
      dispatch(fetchTaskAssociations(taskId)),
      dispatch(fetchTasksForEntity({ entityType, entityId })),
    ]);
    return { taskId, entityType, entityId };
  },
);

/**
 * Create a task + optional association in a single round-trip.
 * Returns the new task id. Also:
 *   - Dispatches `upsertTaskWithLevel` so the new task appears instantly in
 *     the normalized `tasks` slice (drives /tasks, sidebar, chips)
 *   - Adjusts project open/total counts
 *   - Refetches both sides of the association if one was created
 */
export const createTaskWithAssociation = createAsyncThunk<
  { taskId: string; task: TaskRecord } | null,
  {
    title: string;
    description?: string | null;
    priority?: "low" | "medium" | "high" | null;
    due_date?: string | null;
    project_id?: string | null;
    organization_id?: string | null;
    scope_ids?: string[];
    entity_type?: string | null;
    entity_id?: string | null;
    label?: string | null;
    metadata?: Record<string, unknown>;
  },
  { dispatch: ThunkDispatch<object, unknown, UnknownAction> }
>("taskAssociations/createTaskWithAssociation", async (input, { dispatch }) => {
  // Canonical path (replaces the graveyarded `create_task_with_association` RPC,
  // whose hand-rolled 4-column ON CONFLICT threw 42P10 on the entity branch):
  //   1. insert the task via the feature's own service (owns defaults), then
  //   2. wire edges through the generic associationsService chokepoint.
  // Task creation is the PRIMARY action — a failed edge no longer aborts it
  // (the old single-transaction RPC blocked the whole create on the assoc bug);
  // edge failures are logged loud and surfaced, never silently swallowed.
  const task = await createTask({
    title: input.title,
    description: input.description ?? null,
    project_id: input.project_id ?? null,
    organization_id: input.organization_id ?? null,
    priority: input.priority ?? null,
    due_date: input.due_date ?? null,
    status: "incomplete",
  });
  if (!task) return null;

  // Entity → task edge (org resolves from the task inside assoc_add).
  if (input.entity_type && input.entity_id) {
    const linked = await associationsService.add({
      sourceType: input.entity_type,
      sourceId: input.entity_id,
      targetType: "task",
      targetId: task.id,
      label: input.label ?? undefined,
      metadata: input.metadata ?? {},
    });
    if (isScopesRpcErr(linked)) {
      console.error("[createTaskWithAssociation] source edge failed:", {
        message: linked.error.message,
        code: linked.error.code,
        source: { entity_type: input.entity_type, entity_id: input.entity_id },
      });
    }
  }

  // Task → scope tags (set-semantics; org resolves from each scope target).
  if (input.scope_ids && input.scope_ids.length > 0) {
    const tagged = await associationsService.setTargets({
      sourceType: "task",
      sourceId: task.id,
      targetType: "scope",
      targetIds: input.scope_ids,
      orgId: input.organization_id ?? undefined,
    });
    if (isScopesRpcErr(tagged)) {
      console.error("[createTaskWithAssociation] scope tags failed:", {
        message: tagged.error.message,
        code: tagged.error.code,
        scope_ids: input.scope_ids,
      });
    }
  }

  const record: TaskRecord = {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
    assignee_id: task.assignee_id,
    project_id: task.project_id,
    parent_task_id: task.parent_task_id,
    organization_id: task.organization_id ?? "",
    description: task.description,
    settings: (task.settings ?? null) as Record<string, unknown> | null,
    created_at: task.created_at,
    created_by: task.created_by,
  };
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
  // Refresh reverse-lookup if we associated with a source
  if (input.entity_type && input.entity_id) {
    await dispatch(
      fetchTasksForEntity({
        entityType: input.entity_type,
        entityId: input.entity_id,
      }),
    );
  }
  return { taskId: record.id, task: record };
});

export const createTasksBulk = createAsyncThunk<
  { tasks: TaskRecord[] },
  {
    items: {
      title: string;
      description?: string;
      priority?: "low" | "medium" | "high" | null;
      due_date?: string | null;
      status?: string;
    }[];
    project_id?: string | null;
    organization_id?: string | null;
    scope_ids?: string[];
    entity_type?: string | null;
    entity_id?: string | null;
    metadata?: Record<string, unknown>;
  },
  { dispatch: ThunkDispatch<object, unknown, UnknownAction> }
>("taskAssociations/createTasksBulk", async (input, { dispatch }) => {
  const { data, error } = await supabase.rpc("create_tasks_bulk", {
    p_items: input.items.map((x, i) => ({ ...x, index: i })),
    p_project_id: input.project_id ?? undefined,
    p_organization_id: input.organization_id ?? undefined,
    p_scope_ids: input.scope_ids ?? [],
    p_entity_type: input.entity_type ?? undefined,
    p_entity_id: input.entity_id ?? undefined,
    p_metadata: input.metadata ?? {},
  });
  if (error) {
    console.error("[createTasksBulk] RPC error:", {
      message: error.message,
      code: (error as { code?: string }).code,
      hint: (error as { hint?: string }).hint,
      details: (error as { details?: string }).details,
      itemCount: input.items.length,
    });
    throw error;
  }
  // `create_tasks_bulk` returns Json directly (no row schema to guard).
  const payload: { tasks?: Record<string, unknown>[] } =
    data === null ? {} : (data as { tasks?: Record<string, unknown>[] });
  const tasks: TaskRecord[] = (payload.tasks ?? []).map((t) => {
    const r = t as {
      id: string;
      title: string;
      status: string;
      priority: string | null;
      due_date: string | null;
      assignee_id: string | null;
      project_id: string | null;
      parent_task_id: string | null;
      organization_id: string | null;
      description: string | null;
      settings: Record<string, unknown> | null;
      created_at: string | null;
      created_by: string | null;
    };
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      due_date: r.due_date,
      assignee_id: r.assignee_id,
      project_id: r.project_id,
      parent_task_id: r.parent_task_id,
      organization_id: r.organization_id ?? "",
      description: r.description,
      settings: r.settings,
      created_at: r.created_at,
      created_by: r.created_by,
    };
  });
  for (const record of tasks) {
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
  if (input.entity_type && input.entity_id) {
    await dispatch(
      fetchTasksForEntity({
        entityType: input.entity_type,
        entityId: input.entity_id,
      }),
    );
  }
  return { tasks };
});

// ─── Slice ──────────────────────────────────────────────────────────────

const slice = createSlice({
  name: "taskAssociations",
  initialState,
  reducers: {
    clearTaskAssociations(state, action: PayloadAction<string>) {
      delete state.byTaskId[action.payload];
    },
    clearEntityAssociations(
      state,
      action: PayloadAction<{ entityType: string; entityId: string }>,
    ) {
      delete state.byEntityKey[
        entityKey(action.payload.entityType, action.payload.entityId)
      ];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTaskAssociations.pending, (state, action) => {
        state.loadingByTaskId[action.meta.arg] = true;
      })
      .addCase(fetchTaskAssociations.fulfilled, (state, action) => {
        state.byTaskId[action.payload.task_id] = action.payload;
        state.loadingByTaskId[action.payload.task_id] = false;
      })
      .addCase(fetchTaskAssociations.rejected, (state, action) => {
        state.loadingByTaskId[action.meta.arg] = false;
        state.error = action.error.message ?? "Failed to load associations";
      })
      .addCase(fetchTasksForEntity.pending, (state, action) => {
        state.loadingByEntityKey[
          entityKey(action.meta.arg.entityType, action.meta.arg.entityId)
        ] = true;
      })
      .addCase(fetchTasksForEntity.fulfilled, (state, action) => {
        state.byEntityKey[action.payload.key] = action.payload.tasks;
        state.loadingByEntityKey[action.payload.key] = false;
      })
      .addCase(fetchTasksForEntity.rejected, (state, action) => {
        state.loadingByEntityKey[
          entityKey(action.meta.arg.entityType, action.meta.arg.entityId)
        ] = false;
        state.error = action.error.message ?? "Failed to load tasks for entity";
      });
  },
});

export const { clearTaskAssociations, clearEntityAssociations } = slice.actions;
export default slice.reducer;

// ─── Selectors ──────────────────────────────────────────────────────────

const EMPTY_BUNDLE: TaskAssociationsBundle = {
  task_id: "",
  notes: [],
  files: [],
  messages: [],
  cx_messages: [],
  conversations: [],
  cx_conversations: [],
  agent_conversations: [],
  blocks: [],
  other: [],
  all: [],
  loadedAt: 0,
};
const EMPTY_TASKS: TaskForEntityRef[] = [];

type StateWithAssoc = { taskAssociations: TaskAssociationsState };

export const selectAssociations =
  (taskId: string) =>
  (s: StateWithAssoc): TaskAssociationsBundle =>
    s.taskAssociations.byTaskId[taskId] ?? EMPTY_BUNDLE;

export const selectAssociationCount =
  (taskId: string) =>
  (s: StateWithAssoc): number => {
    const b = s.taskAssociations.byTaskId[taskId];
    if (!b) return 0;
    return (
      b.notes.length +
      b.files.length +
      b.messages.length +
      b.cx_messages.length +
      b.conversations.length +
      b.cx_conversations.length +
      b.agent_conversations.length +
      b.blocks.length +
      b.other.length
    );
  };

export const selectAssociationsLoading =
  (taskId: string) =>
  (s: StateWithAssoc): boolean =>
    !!s.taskAssociations.loadingByTaskId[taskId];

export const selectTasksForEntity =
  (entityType: string, entityId: string) =>
  (s: StateWithAssoc): TaskForEntityRef[] =>
    s.taskAssociations.byEntityKey[entityKey(entityType, entityId)] ??
    EMPTY_TASKS;

export const selectTasksForEntityLoading =
  (entityType: string, entityId: string) =>
  (s: StateWithAssoc): boolean =>
    !!s.taskAssociations.loadingByEntityKey[entityKey(entityType, entityId)];
