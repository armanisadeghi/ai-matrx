/**
 * Model-mode thunks.
 *
 * Locked across columns: agent (+ version + variables + user message +
 * full settings). Varied per column: ONLY the model id, persisted in
 * the per-conversation `instanceModelOverrides` slice. No synthetic
 * agents — the executor reads the override on top of the locked
 * agent's `.settings`, and the Python server normalizes settings to
 * the picked model's equivalents.
 *
 * `apiEndpointMode: "agent"` — same as the existing Settings mode,
 * since the only varied piece is a single LLM param (`model`).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  createInstance,
  destroyInstance,
} from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import {
  fetchFullAgent,
  fetchAgentVersionHistory,
  fetchAgentVersionSnapshot,
} from "@/features/agents/redux/agent-definition/thunks";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { setOverrides } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { generateConversationId } from "@/features/agents/redux/execution-system/utils/ids";
import { fetchModelById } from "@/features/ai-models/redux/modelRegistrySlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  createComparisonSet,
  loadComparisonSet,
  renameComparisonSet,
  replaceEntries,
  type UpsertEntryInput,
} from "@/features/agent-comparison/service/comparisonSetsService";
import {
  addModelColumn,
  removeModelColumn,
  replaceModelColumn,
  resetModel,
  setActiveModelSet,
  setLocked,
  setModelColumns,
  submitAllFinished,
  submitAllStarted,
} from "./slice";
import type { ModelColumn } from "../types";

// =============================================================================
// Page-wide constants
// =============================================================================

export const MODEL_SURFACE_KEY = "agent-comparison-model";
const MODEL_SOURCE_FEATURE = "agent-comparison" as const;

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

function resolveAgentModelLabel(
  state: RootState,
  agentId: string,
): string | null {
  const agent = state.agentDefinition.agents?.[agentId];
  const modelId = agent?.modelId;
  if (!modelId) return null;
  const row = state.modelRegistry?.entities?.[modelId];
  return row?.common_name ?? row?.name ?? modelId;
}

// =============================================================================
// Locked-axis configuration
// =============================================================================

export const setLockedAgent = createAsyncThunk<
  void,
  { agentId: string },
  ThunkApi
>(
  "agentComparisonModel/setLockedAgent",
  async ({ agentId }, { dispatch, getState }) => {
    const state = getState();
    const prev = state.agentComparisonModel.locked;
    if (prev.agentId === agentId) return;

    await Promise.allSettled([
      dispatch(fetchFullAgent(agentId)).unwrap(),
      dispatch(fetchAgentVersionHistory({ agentId, limit: 100 })).unwrap(),
    ]);

    dispatch(
      setLocked({
        agentId,
        agentVersion: "current",
        agentVersionId: null,
        variables: {},
      }),
    );

    // Recreate every column's instance under the new agent, carrying
    // the per-column model override forward (the user typically wants
    // to keep their "compare GPT-X vs Claude-Y" setup when swapping
    // the agent shell).
    const post = getState();
    for (const col of post.agentComparisonModel.columns) {
      const prevOverrides =
        post.instanceModelOverrides.byConversationId[col.conversationId]
          ?.overrides ?? {};
      dispatch(destroyInstance(col.conversationId));
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId,
          conversationId,
          apiEndpointMode: "agent",
          sourceFeature: MODEL_SOURCE_FEATURE,
        }),
      ).unwrap();
      if (Object.keys(prevOverrides).length > 0) {
        dispatch(setOverrides({ conversationId, changes: prevOverrides }));
      }
      dispatch(
        replaceModelColumn({
          columnId: col.columnId,
          next: { conversationId },
        }),
      );
    }

    const afterColumns = getState();
    if (afterColumns.agentComparisonModel.columns.length === 0) {
      await dispatch(addColumnToModelBattle(undefined)).unwrap();
    }
  },
);

export const setLockedVersion = createAsyncThunk<
  void,
  { version: "current" | number; versionId?: string },
  ThunkApi
>(
  "agentComparisonModel/setLockedVersion",
  async ({ version, versionId }, { dispatch, getState }) => {
    const state = getState();
    const { agentId, agentVersion } = state.agentComparisonModel.locked;
    if (!agentId) return;
    if (agentVersion === version) return;

    if (version !== "current") {
      try {
        await dispatch(
          fetchAgentVersionSnapshot({ agentId, version }),
        ).unwrap();
      } catch {
        // non-fatal
      }
    }

    dispatch(
      setLocked({
        agentVersion: version,
        agentVersionId: version === "current" ? null : (versionId ?? null),
      }),
    );

    const post = getState();
    const pinnedVersionId = version === "current" ? null : (versionId ?? null);
    for (const col of post.agentComparisonModel.columns) {
      const prevOverrides =
        post.instanceModelOverrides.byConversationId[col.conversationId]
          ?.overrides ?? {};
      dispatch(destroyInstance(col.conversationId));
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId,
          conversationId,
          initialAgentVersionId: pinnedVersionId,
          apiEndpointMode: "agent",
          sourceFeature: MODEL_SOURCE_FEATURE,
        }),
      ).unwrap();
      if (Object.keys(prevOverrides).length > 0) {
        dispatch(setOverrides({ conversationId, changes: prevOverrides }));
      }
      dispatch(
        replaceModelColumn({
          columnId: col.columnId,
          next: { conversationId },
        }),
      );
    }
  },
);

// =============================================================================
// Columns
// =============================================================================

export const addColumnToModelBattle = createAsyncThunk<
  string | null,
  { label?: string } | undefined,
  ThunkApi
>("agentComparisonModel/addColumn", async (arg, { dispatch, getState }) => {
  const state = getState();
  const { agentId, agentVersionId } = state.agentComparisonModel.locked;
  if (!agentId) return null;

  const columnId = crypto.randomUUID();
  const conversationId = generateConversationId();
  const isFirstColumn = state.agentComparisonModel.columns.length === 0;
  const agentModelId = state.agentDefinition.agents?.[agentId]?.modelId;
  if (isFirstColumn && agentModelId) {
    try {
      await dispatch(fetchModelById(agentModelId)).unwrap();
    } catch {
      // non-fatal — label falls back to id
    }
  }
  const freshState = getState();
  const defaultModelLabel = resolveAgentModelLabel(freshState, agentId);
  const label =
    arg?.label ??
    (isFirstColumn && defaultModelLabel
      ? defaultModelLabel
      : `Model ${freshState.agentComparisonModel.columns.length + 1}`);

  await dispatch(
    createManualInstance({
      agentId,
      conversationId,
      initialAgentVersionId: agentVersionId,
      apiEndpointMode: "agent",
      sourceFeature: MODEL_SOURCE_FEATURE,
    }),
  ).unwrap();

  dispatch(addModelColumn({ columnId, conversationId, label }));
  return columnId;
});

export const removeColumnFromModelBattle = createAsyncThunk<
  void,
  { columnId: string },
  ThunkApi
>(
  "agentComparisonModel/removeColumn",
  async ({ columnId }, { dispatch, getState }) => {
    const state = getState();
    const col = state.agentComparisonModel.columns.find(
      (c) => c.columnId === columnId,
    );
    if (col) {
      dispatch(destroyInstance(col.conversationId));
    }
    dispatch(removeModelColumn({ columnId }));
  },
);

// =============================================================================
// Submit All
// =============================================================================

export const submitAllModel = createAsyncThunk<
  { launched: number; failed: number; skipped: number },
  void,
  ThunkApi
>("agentComparisonModel/submitAll", async (_arg, { dispatch, getState }) => {
  dispatch(submitAllStarted());
  try {
    const state = getState();
    const { agentId, variables, userMessage } =
      state.agentComparisonModel.locked;
    const columns = state.agentComparisonModel.columns;

    if (!agentId || columns.length === 0) {
      return { launched: 0, failed: 0, skipped: columns.length };
    }

    for (const col of columns) {
      if (userMessage) {
        dispatch(
          setUserInputText({
            conversationId: col.conversationId,
            text: userMessage,
          }),
        );
      }
      if (Object.keys(variables).length > 0) {
        dispatch(
          setUserVariableValues({
            conversationId: col.conversationId,
            values: variables,
          }),
        );
      }
    }

    const results = await Promise.allSettled(
      columns.map((col) =>
        dispatch(
          smartExecute({
            conversationId: col.conversationId,
            surfaceKey: MODEL_SURFACE_KEY,
          }),
        ).unwrap(),
      ),
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    const launched = results.length - failed;

    const post = getState();
    const activeSetId = post.agentComparisonModel.activeSetId;
    if (activeSetId) {
      const entries = buildModelEntries(post);
      try {
        await replaceEntries(activeSetId, entries);
        await renameComparisonSet(
          activeSetId,
          post.agentComparisonModel.activeSetName ?? "Untitled comparison",
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[model] failed to persist comparison entries:", err);
      }
    }

    return { launched, failed, skipped: 0 };
  } finally {
    dispatch(submitAllFinished());
  }
});

// =============================================================================
// Clear / reset
// =============================================================================

export const clearModelBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonModel/clear",
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    for (const col of state.agentComparisonModel.columns) {
      dispatch(destroyInstance(col.conversationId));
    }
    dispatch(resetModel());
  },
);

export const resetAllModelConversations = createAsyncThunk<
  void,
  { preserveInputs?: boolean } | undefined,
  ThunkApi
>(
  "agentComparisonModel/resetAllConversations",
  async (arg, { dispatch, getState }) => {
    const preserveInputs = arg?.preserveInputs ?? true;
    const state = getState();
    const { agentId, agentVersionId } = state.agentComparisonModel.locked;
    if (!agentId) return;

    for (const col of state.agentComparisonModel.columns) {
      const savedOverrides = preserveInputs
        ? (state.instanceModelOverrides.byConversationId[col.conversationId]
            ?.overrides ?? {})
        : {};

      dispatch(destroyInstance(col.conversationId));
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId,
          conversationId,
          initialAgentVersionId: agentVersionId,
          apiEndpointMode: "agent",
          sourceFeature: MODEL_SOURCE_FEATURE,
        }),
      ).unwrap();
      if (Object.keys(savedOverrides).length > 0) {
        dispatch(setOverrides({ conversationId, changes: savedOverrides }));
      }
      dispatch(
        replaceModelColumn({
          columnId: col.columnId,
          next: { conversationId },
        }),
      );
    }
  },
);

// =============================================================================
// Save / Load
// =============================================================================

interface PersistedModelEntryMeta {
  label: string;
  model: string | null;
}

function buildModelEntries(state: RootState): UpsertEntryInput[] {
  const out: UpsertEntryInput[] = [];
  const { agentId, agentVersion, agentVersionId } =
    state.agentComparisonModel.locked;
  if (!agentId) return out;
  state.agentComparisonModel.columns.forEach((col, idx) => {
    const overrides =
      state.instanceModelOverrides.byConversationId[col.conversationId]
        ?.overrides ?? {};
    const meta: PersistedModelEntryMeta = {
      label: col.label,
      model: typeof overrides.model === "string" ? overrides.model : null,
    };
    out.push({
      conversationId: col.conversationId,
      displayOrder: idx,
      agentId,
      agentVersion:
        agentVersion === "current" || agentVersion == null
          ? null
          : agentVersion,
      agentVersionSnapshotId: agentVersionId,
      metadata: meta as unknown as Record<string, unknown>,
    });
  });
  return out;
}

function buildSetMetadata(state: RootState): Record<string, unknown> {
  const { agentId, agentVersion, agentVersionId, variables, userMessage } =
    state.agentComparisonModel.locked;
  return {
    mode: "model",
    locked: {
      agent_id: agentId,
      agent_version: agentVersion,
      agent_version_id: agentVersionId,
      variables,
      user_message: userMessage,
    },
  };
}

export const saveModelBattleAs = createAsyncThunk<
  { id: string; name: string },
  { name: string },
  ThunkApi
>("agentComparisonModel/saveAs", async ({ name }, { dispatch, getState }) => {
  const state = getState();
  const userId = selectUserId(state);
  if (!userId) throw new Error("Not signed in");

  const set = await createComparisonSet({
    name,
    userId,
    metadata: buildSetMetadata(state),
  });
  const entries = buildModelEntries(state);
  if (entries.length > 0) {
    await replaceEntries(set.id, entries);
  }
  dispatch(setActiveModelSet({ id: set.id, name: set.name }));
  return { id: set.id, name: set.name };
});

export const saveModelBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonModel/save",
  async (_arg, { getState }) => {
    const state = getState();
    const setId = state.agentComparisonModel.activeSetId;
    if (!setId) throw new Error("No active comparison set");
    const entries = buildModelEntries(state);
    await replaceEntries(setId, entries);
  },
);

interface LoadedLockedSpec {
  agent_id: string | null;
  agent_version: "current" | number | null;
  agent_version_id: string | null;
  variables: Record<string, unknown>;
  user_message: string;
}

export const loadModelBattleSet = createAsyncThunk<
  void,
  { setId: string },
  ThunkApi
>("agentComparisonModel/loadSet", async ({ setId }, { dispatch, getState }) => {
  const before = getState();
  for (const col of before.agentComparisonModel.columns) {
    dispatch(destroyInstance(col.conversationId));
  }
  dispatch(resetModel());

  const { set, entries } = await loadComparisonSet(setId);
  const meta = (set.metadata ?? {}) as {
    mode?: string;
    locked?: LoadedLockedSpec;
  };
  if (meta.mode !== "model") {
    throw new Error(
      `Comparison set "${set.name}" is not a model-mode set (mode=${meta.mode ?? "?"})`,
    );
  }

  const locked = meta.locked ?? null;
  if (locked?.agent_id) {
    try {
      await dispatch(fetchFullAgent(locked.agent_id)).unwrap();
      await dispatch(
        fetchAgentVersionHistory({
          agentId: locked.agent_id,
          limit: 100,
        }),
      ).unwrap();
    } catch {
      // best effort
    }
    dispatch(
      setLocked({
        agentId: locked.agent_id,
        agentVersion: locked.agent_version ?? "current",
        agentVersionId: locked.agent_version_id ?? null,
        variables: locked.variables ?? {},
        userMessage: locked.user_message ?? "",
      }),
    );
  }

  const nextColumns: ModelColumn[] = [];
  for (const entry of entries) {
    const columnId = crypto.randomUUID();
    try {
      await dispatch(
        createManualInstance({
          agentId: entry.agent_id,
          conversationId: entry.conversation_id,
          initialAgentVersionId: entry.agent_version_snapshot_id ?? null,
          apiEndpointMode: "agent",
          sourceFeature: MODEL_SOURCE_FEATURE,
        }),
      ).unwrap();
    } catch {
      dispatch(
        createInstance({
          conversationId: entry.conversation_id,
          agentId: entry.agent_id,
          agentType: "user",
          origin: "manual",
          sourceFeature: MODEL_SOURCE_FEATURE,
        }),
      );
    }

    const entryMeta = (entry.metadata ?? {}) as
      | Partial<PersistedModelEntryMeta>
      | undefined;
    if (entryMeta?.model) {
      dispatch(
        setOverrides({
          conversationId: entry.conversation_id,
          changes: { model: entryMeta.model },
        }),
      );
    }

    try {
      await dispatch(
        loadConversation({
          conversationId: entry.conversation_id,
          surfaceKey: MODEL_SURFACE_KEY,
        }),
      ).unwrap();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[model] loadConversation failed:", err);
    }

    nextColumns.push({
      columnId,
      conversationId: entry.conversation_id,
      label: entryMeta?.label ?? `Model ${nextColumns.length + 1}`,
      collapsed: false,
    });
  }

  dispatch(setModelColumns(nextColumns));
  dispatch(setActiveModelSet({ id: set.id, name: set.name }));
});
