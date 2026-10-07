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
import { selectModelColumnTitle } from "../columnTitle";
import {
  createInstance,
  destroyInstance,
} from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.slice";
import { createManualInstance } from "@ai-matrx/chat/agents/redux/execution-system/thunks/create-instance.thunk";
import { runBattleFanOut } from "@/features/agent-comparison/shared/battle-follow-up";
import { loadConversation } from "@ai-matrx/chat/agents/redux/execution-system/thunks/load-conversation.thunk";
import { followWhatIsStillInFlight } from "@ai-matrx/chat/agents/runtime-reconnect/follow-what-is-still-in-flight";
import {
  fetchFullAgent,
} from "@/features/agents/redux/fetch-full-agent.thunk";
import { fetchAgentVersionHistory, fetchAgentVersionSnapshot } from "@/features/agents/redux/builder-versions.thunks";
import { setOverrides } from "@ai-matrx/chat/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { generateConversationId } from "@ai-matrx/chat/agents/redux/execution-system/utils/ids";
import { fetchModelById } from "@ai-matrx/chat/agents/model-registry/modelRegistrySlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  createComparisonSet,
  loadComparisonSet,
  replaceEntries,
  type UpsertEntryInput,
} from "@/features/agent-comparison/service/comparisonSetsService";
import {
  createBattlePersistence,
  type BattleSubmitResult,
} from "@/features/agent-comparison/shared/battlePersistence";
import {
  addModelColumn,
  removeModelColumn,
  replaceModelColumn,
  resetModel,
  setActiveModelSet,
  setLocked,
  setModelInputConversationId,
  setModelColumns,
  submitAllFinished,
  submitAllStarted,
} from "./slice";
import type { ModelColumn } from "../types";
import {
  createBattleInputDraft,
  hydrateBattleInputDraft,
  readBattleInputDraft,
  replaceBattleInputDraft,
} from "@/features/agent-comparison/shared/battleInputDraft";

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
    if (
      prev.agentId === agentId &&
      state.agentComparisonModel.inputConversationId
    ) {
      return;
    }

    // Do not replace the current comparison when the chosen agent cannot load.
    // The input section loads version history independently with visible errors.
    await dispatch(fetchFullAgent(agentId)).unwrap();

    dispatch(
      setLocked({
        agentId,
        agentVersion: "current",
        agentVersionId: null,
      }),
    );

    const inputConversationId = await replaceBattleInputDraft({
      dispatch,
      agentId,
      agentVersionId: null,
      previousConversationId: state.agentComparisonModel.inputConversationId,
      copyVariables: false,
    });
    dispatch(setModelInputConversationId(inputConversationId));

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
    if (
      agentVersion === version &&
      state.agentComparisonModel.inputConversationId
    ) {
      return;
    }

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
    const inputConversationId = await replaceBattleInputDraft({
      dispatch,
      agentId,
      agentVersionId: pinnedVersionId,
      previousConversationId: post.agentComparisonModel.inputConversationId,
    });
    dispatch(setModelInputConversationId(inputConversationId));

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
  BattleSubmitResult,
  void,
  ThunkApi
>("agentComparisonModel/submitAll", async (_arg, { dispatch, getState }) => {
  dispatch(submitAllStarted());
  try {
    const state = getState();
    const { agentId } = state.agentComparisonModel.locked;
    const inputConversationId = state.agentComparisonModel.inputConversationId;
    const columns = state.agentComparisonModel.columns;

    if (!agentId || !inputConversationId || columns.length === 0) {
      return { launched: 0, failed: 0, skipped: columns.length };
    }

    // One fan-out for every mode: fresh columns start from the variables;
    // a column that already ran needs typed text (battle-follow-up.ts).
    return await runBattleFanOut({
      dispatch,
      getState,
      sourceConversationId: inputConversationId,
      columns,
      surfaceKey: MODEL_SURFACE_KEY,
      persist: () => dispatch(persistModelBattle()).unwrap(),
      persistAfterRun: true,
    });
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
    if (state.agentComparisonModel.inputConversationId) {
      dispatch(destroyInstance(state.agentComparisonModel.inputConversationId));
    }
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
  /** The title the column showed (its model's name unless the person named it). */
  label: string;
  label_custom?: boolean;
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
      label: selectModelColumnTitle(state, col),
      label_custom: Boolean(col.labelCustom),
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
  const { agentId, agentVersion, agentVersionId } =
    state.agentComparisonModel.locked;
  const {
    variables,
    userMessage,
    resolvedVariables,
    request,
    omittedAttachments,
  } = readBattleInputDraft(
    state,
    state.agentComparisonModel.inputConversationId,
  );
  return {
    mode: "model",
    locked: {
      agent_id: agentId,
      agent_version: agentVersion,
      agent_version_id: agentVersionId,
      variables,
      user_message: userMessage,
      resolved_variables: resolvedVariables,
      request,
      omitted_attachments: omittedAttachments,
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

const modelPersistence = createBattlePersistence({
  typePrefix: "agentComparisonModel",
  modeLabel: "Model battle",
  selectActiveSetId: (state) => state.agentComparisonModel.activeSetId,
  selectActiveSetName: (state) => state.agentComparisonModel.activeSetName,
  selectNamingAgentId: (state) => state.agentComparisonModel.locked.agentId,
  buildMetadata: buildSetMetadata,
  buildEntries: buildModelEntries,
  setActive: setActiveModelSet,
});

/** Create this battle on first call; afterwards keep its setup and columns current. */
export const persistModelBattle = modelPersistence.persist;
export const renameModelBattle = modelPersistence.rename;

interface LoadedLockedSpec {
  agent_id: string | null;
  agent_version: "current" | number | null;
  agent_version_id: string | null;
  variables: Record<string, unknown>;
  user_message: string;
  /** The complete saved request (absent on battles saved before it). */
  request?: unknown;
}

export const loadModelBattleSet = createAsyncThunk<
  void,
  { setId: string },
  ThunkApi
>("agentComparisonModel/loadSet", async ({ setId }, { dispatch, getState }) => {
  const before = getState();
  if (before.agentComparisonModel.inputConversationId) {
    dispatch(destroyInstance(before.agentComparisonModel.inputConversationId));
  }
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
      }),
    );
    const inputConversationId = await createBattleInputDraft({
      dispatch,
      agentId: locked.agent_id,
      agentVersionId: locked.agent_version_id ?? null,
    });
    hydrateBattleInputDraft({
      dispatch,
      conversationId: inputConversationId,
      userMessage: locked.user_message ?? "",
      variables: locked.variables ?? {},
      request: locked.request,
    });
    dispatch(setModelInputConversationId(inputConversationId));
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
      Partial<PersistedModelEntryMeta> | undefined;
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
      console.warn("[model] loadConversation failed:", err);
    }
    // A saved run may still be answering on the server — rejoin it.
    followWhatIsStillInFlight(dispatch, entry.conversation_id);

    nextColumns.push({
      columnId,
      conversationId: entry.conversation_id,
      label: entryMeta?.label ?? `Model ${nextColumns.length + 1}`,
      labelCustom: entryMeta?.label_custom === true,
      collapsed: false,
    });
  }

  dispatch(setModelColumns(nextColumns));
  dispatch(setActiveModelSet({ id: set.id, name: set.name }));
});
