/**
 * Agent Definition — Redux Thunks
 *
 * Read thunks:
 *   fetchAgentsList              — lightweight list for the agents page (owned + shared)
 *   fetchAgentsListFull          — same as above + all active builtins (for pickers/dropdowns)
 *   fetchSharedAgents            — agents shared with me (for "shared" tab)
 *   fetchSharedAgentsForChat     — minimal shared list for chat agent picker
 *   fetchAgentAccessLevel        — current user's permission level on an agent
 *   fetchAgentExecutionMinimal   — id + variableDefinitions + contextSlots (skips if ready)
 *   fetchAgentExecutionFull      — adds settings, tools, model (skips if ready)
 *   fetchFullAgent               — complete row, marks record clean
 *   fetchAgentVersionHistory     — paginated version list (returns data, no slice storage)
 *   fetchAgentVersionSnapshot    — full version snapshot → stored in agents map (isVersion = true)
 *   checkAgentDrift              — what references are behind? (returns data, no slice storage)
 *   checkAgentReferences         — what references this agent? (returns data, no slice storage)
 *
 * Write thunks:
 *   saveAgentField               — optimistic single-field save with rollback
 *   saveAgent                    — save all dirty fields for an agent
 *   createAgent                  — insert new agent
 *   deleteAgent                  — delete agent
 *   purgeAgentVersions           — delete old versions, keep N most recent
 *
 * RPC action thunks:
 *   duplicateAgent               — calls agx_duplicate_agent(), loads copy into state
 *   promoteAgentVersion          — calls agx_promote_version(), reloads live row
 *   acceptAgentVersion           — accept latest for a shortcut/app/derived ref
 *   updateAgentFromSource        — reset derived agent to its source agent's data
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { withRetry } from "@/lib/net/retry";
import { ConnectTimeoutError } from "@/lib/net/errors";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { DbRpcRow } from "@/types/supabase-rpc";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type {
  AgentDefinition,
  AgentListRow,
  AgentExecutionMinimal,
  AgentExecutionFull,
  AgentDriftItem,
  AgentReference,
  AcceptVersionResult,
  UpdateFromSourceResult,
  PromoteVersionResult,
  AgentVersionSnapshot,
} from "../../types/agent-definition.types";
import {
  upsertAgent,
  mergePartialAgent,
  setAgentField,
  setAgentFetchStatus,
  setAgentLoading,
  setAgentError,
  setAgentsStatus,
  setAgentsError,
  markAgentSaved,
  rollbackAgentOptimisticUpdate,
  removeAgent,
} from "./slice";
import {
  selectAgentById,
  selectAgentExecutionPayload,
  selectAgentCustomExecutionPayload,
} from "./selectors";
import {
  dbRowToAgentDefinition,
  agentDefinitionToInsert,
  agentDefinitionToUpdate,
  versionSnapshotRowToAgentDefinition,
} from "./converters";

type ThunkApi = { dispatch: AppDispatch; state: RootState };

// ---------------------------------------------------------------------------
// Read thunks
// ---------------------------------------------------------------------------

/**
 * Fetches the lightweight agent list for the agents page.
 * Maps AgentListRow → mergePartialAgent (list fields only).
 * Does not overwrite fields already in state that were loaded by other means.
 */
export const fetchAgentsList = createAsyncThunk<void, void, ThunkApi>(
  "agentDefinition/fetchList",
  async (_, { dispatch }) => {
    dispatch(setAgentsStatus("loading"));

    const { data, error } = await supabase.rpc("agx_get_list");

    if (error) {
      dispatch(setAgentsError(error.message));
      dispatch(setAgentsStatus("failed"));
      throw error;
    }

    const rows = (data ?? []) as AgentListRow[];

    for (const row of rows) {
      dispatch(
        mergePartialAgent({
          id: row.id,
          name: row.name,
          description: row.description,
          category: row.category,
          tags: row.tags ?? [],
          agentType: row.agent_type,
          modelId: row.model_id,
          isActive: row.is_active,
          isArchived: row.is_archived,
          isFavorite: row.is_favorite,
          userId: row.user_id,
          organizationId: row.organization_id,
          projectId: row.project_id ?? null,
          taskId: row.task_id ?? null,
          sourceAgentId: row.source_agent_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          isVersion: false,
          isOwner: row.is_owner,
          accessLevel: row.access_level,
          sharedByEmail: row.shared_by_email,
        }),
      );
      dispatch(setAgentFetchStatus({ id: row.id, status: "list" }));
    }

    dispatch(setAgentsStatus("succeeded"));
  },
);

/**
 * Fetches the full agent list for pickers and dropdowns.
 * Returns everything from agx_get_list() PLUS all active builtin agents.
 * Builtins arrive with accessLevel = 'system' so the UI can group them separately.
 *
 * Use this for any picker/dropdown that needs the complete agent catalogue.
 * Use fetchAgentsList() for the agents page where builtins are not shown.
 */
export const fetchAgentsListFull = createAsyncThunk<void, void, ThunkApi>(
  "agentDefinition/fetchListFull",
  async (_, { dispatch }) => {
    const { data, error } = await supabase.rpc("agx_get_list_full");

    if (error) throw error;

    const rows = (data ?? []) as AgentListRow[];

    for (const row of rows) {
      dispatch(
        mergePartialAgent({
          id: row.id,
          name: row.name,
          description: row.description,
          category: row.category,
          tags: row.tags ?? [],
          agentType: row.agent_type,
          modelId: row.model_id,
          isActive: row.is_active,
          isArchived: row.is_archived,
          isFavorite: row.is_favorite,
          userId: row.user_id,
          organizationId: row.organization_id,
          projectId: row.project_id ?? null,
          taskId: row.task_id ?? null,
          sourceAgentId: row.source_agent_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          isVersion: false,
          isOwner: row.is_owner,
          accessLevel: row.access_level,
          sharedByEmail: row.shared_by_email,
        }),
      );
      dispatch(setAgentFetchStatus({ id: row.id, status: "list" }));
    }
  },
);

/**
 * Fetches the minimal execution payload for an agent: id, variableDefinitions, contextSlots.
 *
 * Skips the network call if both fields are already loaded (isReady = true).
 * Call this before executing an agent from a context menu shortcut.
 */
export const fetchAgentExecutionMinimal = createAsyncThunk<
  void,
  string,
  ThunkApi
>(
  "agentDefinition/fetchExecutionMinimal",
  async (agentId, { dispatch, getState }) => {
    if (selectAgentExecutionPayload(getState(), agentId).isReady) return;

    dispatch(setAgentLoading({ id: agentId, loading: true }));

    const { data, error } = await withRetry(
      () =>
        new Promise<
          Awaited<ReturnType<typeof supabase.rpc<"agx_get_execution_minimal">>>
        >((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new ConnectTimeoutError(15_000));
          }, 15_000);
          supabase
            .rpc("agx_get_execution_minimal", { p_agent_id: agentId })
            .then(
              (result) => {
                clearTimeout(timer);
                resolve(result);
              },
              (err) => {
                clearTimeout(timer);
                reject(err);
              },
            );
        }),
      { attempts: 2, initialDelayMs: 400 },
    );

    dispatch(setAgentLoading({ id: agentId, loading: false }));

    if (error) {
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw error;
    }

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) return;
    const row = raw as unknown as AgentExecutionMinimal;

    dispatch(
      mergePartialAgent({
        id: row.id,
        variableDefinitions: row.variable_definitions,
        contextSlots: row.context_slots ?? [],
      }),
    );
    dispatch(setAgentFetchStatus({ id: row.id, status: "execution" }));
  },
);

/**
 * Fetches the full execution payload: adds settings, tools, customTools, modelId.
 * Used by the agent builder preview pane and pages that allow pre-run configuration.
 *
 * Skips if all required fields are already loaded.
 */
export const fetchAgentExecutionFull = createAsyncThunk<void, string, ThunkApi>(
  "agentDefinition/fetchExecutionFull",
  async (agentId, { dispatch, getState }) => {
    if (selectAgentCustomExecutionPayload(getState(), agentId).isReady) return;

    dispatch(setAgentLoading({ id: agentId, loading: true }));

    const { data, error } = await supabase.rpc("agx_get_execution_full", {
      p_agent_id: agentId,
    });

    dispatch(setAgentLoading({ id: agentId, loading: false }));

    if (error) {
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw error;
    }

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) return;
    const row = raw as unknown as AgentExecutionFull;

    dispatch(
      mergePartialAgent({
        id: row.id,
        variableDefinitions: row.variable_definitions,
        contextSlots: row.context_slots ?? [],
        settings: row.settings,
        tools: row.tools,
        customTools: row.custom_tools,
        modelId: row.model_id,
      }),
    );
    dispatch(setAgentFetchStatus({ id: row.id, status: "customExecution" }));
  },
);

/**
 * Fetches the complete agent row via PostgREST and upserts it into state.
 * Marks the record fully clean — all fields tracked as loaded.
 * Use this when opening the agent builder or after creating/duplicating an agent.
 */
export const fetchFullAgent = createAsyncThunk<void, string, ThunkApi>(
  "agentDefinition/fetchFull",
  async (agentId, { dispatch }) => {
    dispatch(setAgentLoading({ id: agentId, loading: true }));

    const { data, error } = await supabase
      .from("agx_agent")
      .select("*")
      .eq("id", agentId)
      .single();

    dispatch(setAgentLoading({ id: agentId, loading: false }));

    if (error) {
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw error;
    }

    dispatch(upsertAgent(dbRowToAgentDefinition(data)));
  },
);

// ---------------------------------------------------------------------------
// Version read thunks
// ---------------------------------------------------------------------------

export interface AgentVersionHistoryItem {
  version_id: string;
  version_number: number;
  name: string;
  changed_at: string;
  change_note: string | null;
}
type _Check_AgentVersionHistoryItem =
  AgentVersionHistoryItem extends DbRpcRow<"agx_get_version_history">
    ? true
    : false;
declare const _agentVersionHistoryItem: _Check_AgentVersionHistoryItem;
true satisfies typeof _agentVersionHistoryItem;

// AgentVersionSnapshot interface + compile-time check now live in
// features/agents/types/agent-definition.types.ts

/**
 * Paginated version history for the agent editor's version panel.
 * Returns the list directly — not stored in Redux (ephemeral UI state).
 */
export const fetchAgentVersionHistory = createAsyncThunk<
  AgentVersionHistoryItem[],
  { agentId: string; limit?: number; offset?: number },
  ThunkApi
>(
  "agentDefinition/fetchVersionHistory",
  async ({ agentId, limit = 50, offset = 0 }) => {
    const { data, error } = await supabase.rpc("agx_get_version_history", {
      p_agent_id: agentId,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) throw error;

    return (data ?? []) as AgentVersionHistoryItem[];
  },
);

/**
 * Fetches a full version snapshot for diff/preview.
 * Stores it in the agents map with isVersion = true, keyed by agx_version.id.
 * Same record shape — no special handling needed in selectors or UI.
 */
export const fetchAgentVersionSnapshot = createAsyncThunk<
  void,
  { agentId: string; version: number },
  ThunkApi
>(
  "agentDefinition/fetchVersionSnapshot",
  async ({ agentId, version }, { dispatch }) => {
    const { data, error } = await supabase.rpc("agx_get_version_snapshot", {
      p_agent_id: agentId,
      p_version_number: version,
    });

    if (error) throw error;

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw) return;
    const row = raw as unknown as AgentVersionSnapshot;

    dispatch(upsertAgent(versionSnapshotRowToAgentDefinition(agentId, row)));
  },
);

// ---------------------------------------------------------------------------
// Write thunks
// ---------------------------------------------------------------------------

/**
 * Optimistically saves a single field on an agent.
 * Immediately updates state, persists to DB, rolls back on failure.
 *
 * Use for simple inline edits (name, description, isActive toggle, etc.).
 */
export const saveAgentField = createAsyncThunk<
  void,
  {
    agentId: string;
    field: keyof AgentDefinition;
    value: AgentDefinition[keyof AgentDefinition];
  },
  ThunkApi
>(
  "agentDefinition/saveField",
  async ({ agentId, field, value }, { dispatch, getState }) => {
    const existing = selectAgentById(getState(), agentId);
    const snapshot = existing ? { [field]: existing[field] } : {};

    dispatch(setAgentField({ id: agentId, field, value }));

    const { data, error } = await supabase
      .from("agx_agent")
      .update(
        agentDefinitionToUpdate({ [field]: value } as Partial<AgentDefinition>),
      )
      .eq("id", agentId)
      .select("version, updated_at")
      .single();

    if (error) {
      dispatch(rollbackAgentOptimisticUpdate({ id: agentId, snapshot }));
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw error;
    }

    if (data) {
      dispatch(
        mergePartialAgent({
          id: agentId,
          version: data.version,
          updatedAt: data.updated_at,
        }),
      );
    }

    dispatch(markAgentSaved({ id: agentId }));
  },
);

/**
 * Saves all dirty fields for an agent in a single DB update.
 * Reads dirty field values from state — no arg needed beyond agentId.
 *
 * Use after the user finishes editing in the agent builder.
 */
export const saveAgent = createAsyncThunk<void, string, ThunkApi>(
  "agentDefinition/save",
  async (agentId, { dispatch, getState }) => {
    const record = selectAgentById(getState(), agentId);
    if (!record || !record._dirty) return;

    const dirtyPartial: Partial<AgentDefinition> = {};
    for (const field of Object.keys(
      record._dirtyFields,
    ) as (keyof AgentDefinition)[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dirtyPartial as any)[field] = record[field];
    }

    const snapshot = { ...record._fieldHistory };

    dispatch(setAgentLoading({ id: agentId, loading: true }));

    const { data, error } = await supabase
      .from("agx_agent")
      .update(agentDefinitionToUpdate(dirtyPartial))
      .eq("id", agentId)
      .select("version, updated_at")
      .single();

    dispatch(setAgentLoading({ id: agentId, loading: false }));

    if (error) {
      dispatch(rollbackAgentOptimisticUpdate({ id: agentId, snapshot }));
      dispatch(setAgentError({ id: agentId, error: error.message }));
      throw error;
    }

    if (data) {
      dispatch(
        mergePartialAgent({
          id: agentId,
          version: data.version,
          updatedAt: data.updated_at,
        }),
      );
    }

    dispatch(markAgentSaved({ id: agentId }));
  },
);

/**
 * Creates a new agent and loads the returned row into state.
 * userId is pulled from Redux — not passed by the caller.
 */
export const createAgent = createAsyncThunk<
  string,
  Partial<
    Omit<
      AgentDefinition,
      | "id"
      | "userId"
      | "createdAt"
      | "updatedAt"
      | "isVersion"
      | "parentAgentId"
      | "version"
      | "changedAt"
      | "changeNote"
    >
  >,
  ThunkApi
>("agentDefinition/create", async (partial, { dispatch, getState }) => {
  const userId = selectUserId(getState());

  const draft: AgentDefinition = {
    id: "",
    name: partial.name ?? "Untitled Agent",
    description: partial.description ?? null,
    category: partial.category ?? null,
    tags: partial.tags ?? [],
    isActive: partial.isActive ?? true,
    isPublic: partial.isPublic ?? false,
    isArchived: partial.isArchived ?? false,
    isFavorite: partial.isFavorite ?? false,
    agentType: partial.agentType ?? "user",

    // New agents are never version snapshots
    isVersion: false,
    parentAgentId: null,
    version: null,
    changedAt: null,
    changeNote: null,

    modelId: partial.modelId ?? null,
    messages: partial.messages ?? [],
    variableDefinitions: partial.variableDefinitions ?? null,
    settings: partial.settings ?? ({} as AgentDefinition["settings"]),
    tools: partial.tools ?? [],
    contextSlots: partial.contextSlots ?? [],
    modelTiers: partial.modelTiers ?? null,
    outputSchema: partial.outputSchema ?? null,
    customTools: partial.customTools ?? [],
    mcpServers: partial.mcpServers ?? [],
    userId,
    organizationId: partial.organizationId ?? null,
    projectId: partial.projectId ?? null,
    taskId: partial.taskId ?? null,
    sourceAgentId: null,
    sourceSnapshotAt: null,
    createdAt: "",
    updatedAt: "",

    // Caller owns the record they're creating
    isOwner: true,
    accessLevel: "owner",
    sharedByEmail: null,
  };

  const { data, error } = await supabase
    .from("agx_agent")
    .insert(agentDefinitionToInsert(draft))
    .select()
    .single();

  if (error) throw error;

  const newAgent = dbRowToAgentDefinition(data);
  dispatch(upsertAgent(newAgent));
  return newAgent.id;
});

/**
 * Deletes an agent from the DB and removes it from state.
 */
export const deleteAgent = createAsyncThunk<void, string, ThunkApi>(
  "agentDefinition/delete",
  async (agentId, { dispatch }) => {
    const { error } = await supabase
      .from("agx_agent")
      .delete()
      .eq("id", agentId);

    if (error) throw error;

    dispatch(removeAgent(agentId));
  },
);

// ---------------------------------------------------------------------------
// RPC action thunks
// ---------------------------------------------------------------------------

/**
 * Duplicates an agent via the `agx_duplicate_agent` RPC and loads the copy into state.
 * Returns the new agent's id.
 *
 * Accepts either a bare agent id (legacy callers) or an options object so that
 * admin surfaces can opt into preserving system status:
 *
 *   dispatch(duplicateAgent(agentId))                          // user copy
 *   dispatch(duplicateAgent({ agentId, asSystem: true }))      // system copy
 *
 * `asSystem: true` is admin-only — the RPC verifies `is_super_admin()` and
 * rejects otherwise. When set, the new row is inserted as a builtin system
 * agent (`agent_type = 'builtin'`, no owner). Default is the historical
 * "personal copy" behavior so existing callers keep working unchanged.
 */
export interface DuplicateAgentOptions {
  agentId: string;
  asSystem?: boolean;
}

export const duplicateAgent = createAsyncThunk<
  string,
  string | DuplicateAgentOptions,
  ThunkApi
>("agentDefinition/duplicate", async (input, { dispatch }) => {
  const { agentId, asSystem } =
    typeof input === "string" ? { agentId: input, asSystem: false } : input;

  const { data, error } = await supabase.rpc("agx_duplicate_agent", {
    p_agent_id: agentId,
    p_as_system: Boolean(asSystem),
  });

  if (error) throw error;

  const newAgentId = data as string;
  await dispatch(fetchFullAgent(newAgentId));
  return newAgentId;
});

/**
 * Promotes a past version to be the live agent via `agx_promote_version`.
 * Reloads the live agents row after promotion so state reflects the promoted data.
 */
export const promoteAgentVersion = createAsyncThunk<
  PromoteVersionResult,
  { agentId: string; version: number },
  ThunkApi
>(
  "agentDefinition/promoteVersion",
  async ({ agentId, version }, { dispatch }) => {
    const { data, error } = await supabase.rpc("agx_promote_version", {
      p_agent_id: agentId,
      p_version_number: version,
    });

    if (error) throw error;

    const result = data as unknown as PromoteVersionResult;

    if (result.success) {
      await dispatch(fetchFullAgent(agentId));
    }

    return result;
  },
);

// ---------------------------------------------------------------------------
// Shared agents
// ---------------------------------------------------------------------------

export interface SharedAgentItem {
  id: string;
  name: string;
  description: string | null;
  agent_type: "user" | "builtin";
  category: string | null;
  tags: string[];
  owner_id: string | null;
  owner_email: string | null;
  permission_level: string;
  created_at: string;
  updated_at: string;
}

export interface SharedAgentForChat {
  id: string;
  name: string;
  permission_level: string;
  owner_email: string | null;
}

/**
 * Fetches all agents shared with the current user (not owned by them).
 *
 * @deprecated agx_get_list() now returns both owned and shared agents in one
 * call with full access metadata. Prefer fetchAgentsList() instead.
 * This thunk is kept for cases where only the shared subset is needed
 * (e.g. a targeted refresh of the "Shared with me" tab without re-fetching owned agents).
 */
export const fetchSharedAgents = createAsyncThunk<
  SharedAgentItem[],
  void,
  ThunkApi
>("agentDefinition/fetchShared", async (_, { dispatch }) => {
  const { data, error } = await supabase.rpc("agx_get_shared_with_me");

  if (error) throw error;

  const rows = (data ?? []) as SharedAgentItem[];

  for (const row of rows) {
    dispatch(
      mergePartialAgent({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        tags: row.tags ?? [],
        agentType: row.agent_type,
        isVersion: false,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isOwner: false,
        accessLevel: row.permission_level as AgentDefinition["accessLevel"],
        sharedByEmail: row.owner_email,
      }),
    );
    dispatch(setAgentFetchStatus({ id: row.id, status: "list" }));
  }

  return rows;
});

/**
 * Fetches the minimal shared agent list for the chat agent picker.
 * Returns the raw list — lightweight, not stored in slice
 * (the picker only needs name + id, no need to hydrate execution fields).
 */
export const fetchSharedAgentsForChat = createAsyncThunk<
  SharedAgentForChat[],
  void,
  ThunkApi
>("agentDefinition/fetchSharedForChat", async () => {
  const { data, error } = await supabase.rpc("agx_get_shared_for_chat");

  if (error) throw error;

  return (data ?? []) as SharedAgentForChat[];
});

// ---------------------------------------------------------------------------
// Access level
// ---------------------------------------------------------------------------

export interface AgentAccessLevel {
  agent_id: string;
  agent_name: string;
  owner_id: string | null;
  owner_email: string | null;
  access_level: "owner" | "admin" | "editor" | "viewer" | "public" | "none";
  is_owner: boolean;
}
type _Check_AgentAccessLevel =
  AgentAccessLevel extends DbRpcRow<"agx_get_access_level"> ? true : false;
declare const _agentAccessLevel: _Check_AgentAccessLevel;
true satisfies typeof _agentAccessLevel;

/**
 * Returns the current user's permission level on a specific agent.
 * Also merges the result into the slice so selectors stay consistent.
 *
 * Use when opening the agent builder, or when the record arrived via a
 * shortcut/execution RPC (which don't include access metadata).
 */
export const fetchAgentAccessLevel = createAsyncThunk<
  AgentAccessLevel,
  string,
  ThunkApi
>("agentDefinition/fetchAccessLevel", async (agentId, { dispatch }) => {
  const { data, error } = await supabase.rpc("agx_get_access_level", {
    p_agent_id: agentId,
  });

  if (error) throw error;

  const rawRow = Array.isArray(data) ? data[0] : data;
  if (!rawRow) throw new Error(`No access level returned for agent ${agentId}`);
  const row = rawRow as AgentAccessLevel;

  // Merge into slice so selectors reflect the current access state
  dispatch(
    mergePartialAgent({
      id: agentId,
      isOwner: row.is_owner,
      accessLevel: row.access_level,
      sharedByEmail: row.is_owner ? null : null, // not returned by this RPC
    }),
  );

  return row;
});

// ---------------------------------------------------------------------------
// Drift & references
// ---------------------------------------------------------------------------

/**
 * Returns all references that are behind (pointing to an older version).
 * Pass agentId to check drift for one specific agent, or omit to check all.
 * Returns data directly — drift UI renders from the returned array.
 */
export const checkAgentDrift = createAsyncThunk<
  AgentDriftItem[],
  string | undefined,
  ThunkApi
>("agentDefinition/checkDrift", async (agentId) => {
  const params = agentId ? { p_agent_id: agentId } : {};
  const { data, error } = await supabase.rpc("agx_check_drift", params);

  if (error) throw error;

  return (data ?? []) as AgentDriftItem[];
});

/**
 * Returns all shortcuts, apps, and derived agents that reference a specific agent.
 * Use before deleting an agent to warn the user about broken references.
 * Returns data directly — not stored in Redux.
 */
export const checkAgentReferences = createAsyncThunk<
  AgentReference[],
  string,
  ThunkApi
>("agentDefinition/checkReferences", async (agentId) => {
  const { data, error } = await supabase.rpc("agx_check_references", {
    p_agent_id: agentId,
  });

  if (error) throw error;

  return (data ?? []) as AgentReference[];
});

// ---------------------------------------------------------------------------
// Version management
// ---------------------------------------------------------------------------

export interface PurgeVersionsResult {
  success: boolean;
  error?: string;
  deleted_count?: number;
  kept_count?: number;
}
// agx_purge_versions returns Json directly — no DB row schema to check.

/**
 * Deletes old versions for an agent, keeping the N most recent.
 * The RPC always preserves: version 1, the current live version,
 * and any version pinned by a shortcut or app.
 *
 * keepCount defaults to 10 if not provided (matches the RPC default).
 */
export const purgeAgentVersions = createAsyncThunk<
  PurgeVersionsResult,
  { agentId: string; keepCount?: number },
  ThunkApi
>("agentDefinition/purgeVersions", async ({ agentId, keepCount }) => {
  const params: { p_agent_id: string; p_keep_count?: number } = {
    p_agent_id: agentId,
  };
  if (keepCount !== undefined) params.p_keep_count = keepCount;

  const { data, error } = await supabase.rpc("agx_purge_versions", params);

  if (error) throw error;

  return data as unknown as PurgeVersionsResult;
});

// ---------------------------------------------------------------------------
// Drift resolution
// ---------------------------------------------------------------------------

/**
 * Accepts the latest version for a single reference (shortcut, app, or derived agent).
 * After success the reference is no longer "behind".
 *
 * type: 'shortcut' | 'app' | 'derived_agent'
 * refId: the id of the referencing entity
 */
export const acceptAgentVersion = createAsyncThunk<
  AcceptVersionResult,
  { type: "shortcut" | "app" | "derived_agent"; refId: string },
  ThunkApi
>("agentDefinition/acceptVersion", async ({ type, refId }) => {
  const { data, error } = await supabase.rpc("agx_accept_version", {
    p_reference_type: type,
    p_reference_id: refId,
  });

  if (error) throw error;

  return data as unknown as AcceptVersionResult;
});

// ---------------------------------------------------------------------------
// Chat sidebar bootstrap
// ---------------------------------------------------------------------------

/**
 * Module-level TTL guard — avoids hammering the DB when many components mount.
 * This is intentionally NOT stored in Redux: it's a session-local guard, not
 * user-visible state. Reset happens when the module is hot-reloaded in dev.
 */
let _chatListFetchedAt: number | null = null;
const CHAT_LIST_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CHAT_LIST_STALE_MS = 4 * 60 * 60 * 1000; // 4 hours — tab-restore threshold

/** True if the chat list was fetched within TTL. */
export function isChatListFresh(): boolean {
  if (_chatListFetchedAt === null) return false;
  return Date.now() - _chatListFetchedAt < CHAT_LIST_TTL_MS;
}

/** True if the chat list is so old it should be refreshed in the background. */
export function isChatListStale(): boolean {
  if (_chatListFetchedAt === null) return true;
  return Date.now() - _chatListFetchedAt > CHAT_LIST_STALE_MS;
}

/**
 * Initializes the agent catalogue for the chat sidebar.
 * Calls fetchAgentsListFull() — owned + shared + builtins — in a single RPC.
 *
 * TTL-guarded: safe to call on every component mount. Skips the network call
 * if data is still fresh (< 15 min). Stale-while-revalidate: if a tab is
 * restored after > 4 hours, the caller can force a refresh via `force: true`.
 *
 * Usage:
 *   dispatch(initializeChatAgents())          // skip if fresh
 *   dispatch(initializeChatAgents({ force: true }))  // always re-fetch
 */
export const initializeChatAgents = createAsyncThunk<
  void,
  { force?: boolean } | void,
  ThunkApi
>(
  "agentDefinition/initializeChatAgents",
  async (arg, { dispatch, getState }) => {
    const force = (arg as { force?: boolean } | undefined)?.force ?? false;

    if (!force && isChatListFresh()) return;

    // If already loading, don't fire a duplicate request
    if (getState().agentDefinition.status === "loading" && !force) return;

    await dispatch(fetchAgentsListFull());
    _chatListFetchedAt = Date.now();
  },
);

/**
 * Resets a derived agent back to its source agent's current data.
 * Use on the "update from source" button in the agent builder.
 * On success, reloads the agent row to reflect the reset data.
 */
export const updateAgentFromSource = createAsyncThunk<
  UpdateFromSourceResult,
  string,
  ThunkApi
>("agentDefinition/updateFromSource", async (agentId, { dispatch }) => {
  const { data, error } = await supabase.rpc("agx_update_from_source", {
    p_agent_id: agentId,
  });

  if (error) throw error;

  const result = data as unknown as UpdateFromSourceResult;

  if (result.success) {
    // Reload the live row — it now holds the source agent's data
    await dispatch(fetchFullAgent(agentId));
  }

  return result;
});
