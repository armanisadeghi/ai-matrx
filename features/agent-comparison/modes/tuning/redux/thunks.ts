/**
 * Tuning-mode thunks.
 *
 * Locked across columns: agent (source) + version + variables + user
 * message + system prompt + tools. Varied per column: the agent's
 * `modelId` and its full `settings` map — driven by the SAME
 * `AgentSettingsModal` the Agent Builder uses, pointed at a per-column
 * synthetic agent clone (`cmp-<uuid>` record in Redux).
 *
 * Why synthetic agent + manual endpoint? It lets us reuse the full,
 * model-aware Builder settings UI per column without persisting a
 * "false agent" back to the DB. The executor's manual path reads the
 * synthetic's `.modelId` and `.settings` live for each request. The
 * `cmp-` id prefix gates save thunks from ever uploading these.
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
import {
  removeAgent,
  setAgentField,
  setAgentSettings,
} from "@/features/agents/redux/agent-definition/slice";
import { generateConversationId } from "@/features/agents/redux/execution-system/utils/ids";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  createComparisonSet,
  loadComparisonSet,
  renameComparisonSet,
  replaceEntries,
  type UpsertEntryInput,
} from "@/features/agent-comparison/service/comparisonSetsService";
import { forkAgentForVariant } from "@/features/agent-comparison/shared/forkAgentForVariant";
import { isSyntheticAgentId } from "@/features/agents/redux/agent-definition/synthetic-id";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import {
  addTuningColumn,
  removeTuningColumn,
  replaceTuningColumn,
  resetTuning,
  setActiveTuningSet,
  setLocked,
  setTuningColumns,
  submitAllFinished,
  submitAllStarted,
} from "./slice";
import type { TuningColumn } from "../types";

// =============================================================================
// Page-wide constants
// =============================================================================

export const TUNING_SURFACE_KEY = "agent-comparison-tuning";
const TUNING_SOURCE_FEATURE = "agent-comparison" as const;

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

// =============================================================================
// Synthetic-agent helpers
// =============================================================================

/**
 * Per-column tuning state we persist on save = the synthetic agent's
 * model id + its full settings map. AgentSettingsModal writes both via
 * `setAgentField` and `setAgentSettings`, so reading them back on load
 * just dispatches the same two actions against the freshly-forked
 * synthetic.
 */
interface TuningSnapshot {
  modelId: AgentDefinition["modelId"];
  settings: AgentDefinition["settings"];
}

function extractTuningSnapshot(
  state: RootState,
  agentId: string,
): TuningSnapshot {
  const agent = state.agentDefinition.agents?.[agentId];
  return {
    modelId: agent?.modelId ?? null,
    settings: agent?.settings ?? {},
  };
}

function applyTuningSnapshot(
  dispatch: AppDispatch,
  agentId: string,
  snapshot: TuningSnapshot,
) {
  if (snapshot.modelId !== undefined) {
    dispatch(
      setAgentField({ id: agentId, field: "modelId", value: snapshot.modelId }),
    );
  }
  if (snapshot.settings !== undefined) {
    dispatch(setAgentSettings({ id: agentId, settings: snapshot.settings }));
  }
}

/**
 * Tear down a column: destroy the instance, remove its synthetic agent
 * record from agentDefinition.agents (saves are gated by the cmp-
 * prefix so leaving it would be harmless but wasteful), and drop the
 * slice entry.
 */
function teardownColumn(
  dispatch: AppDispatch,
  col: TuningColumn,
) {
  dispatch(destroyInstance(col.conversationId));
  if (isSyntheticAgentId(col.syntheticAgentId)) {
    dispatch(removeAgent(col.syntheticAgentId));
  }
}

// =============================================================================
// Locked-axis configuration
// =============================================================================

/**
 * Set the locked source agent. Recreates every existing column with a
 * fresh synthetic clone of the new source — old per-column system-prompt
 * edits drop, which is the expected behavior (a new source agent is a
 * new baseline).
 */
export const setLockedSourceAgent = createAsyncThunk<
  void,
  { agentId: string },
  ThunkApi
>(
  "agentComparisonTuning/setLockedSourceAgent",
  async ({ agentId }, { dispatch, getState }) => {
    const state = getState();
    const prev = state.agentComparisonTuning.locked;
    if (prev.sourceAgentId === agentId) return;

    await Promise.allSettled([
      dispatch(fetchFullAgent(agentId)).unwrap(),
      dispatch(
        fetchAgentVersionHistory({ agentId, limit: 100 }),
      ).unwrap(),
    ]);

    dispatch(
      setLocked({
        sourceAgentId: agentId,
        agentVersion: "current",
        agentVersionId: null,
        variables: {},
      }),
    );

    // Recreate every column with a fresh synthetic forked from the new
    // source agent. We do NOT carry over the old per-column tuning;
    // the source agent's baseline is the right starting point and the
    // user can edit each column from there.
    const post = getState();
    for (const col of post.agentComparisonTuning.columns) {
      teardownColumn(dispatch, col);
      const syntheticId = forkAgentForVariant(dispatch, post, agentId);
      if (!syntheticId) continue;
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId: syntheticId,
          conversationId,
          apiEndpointMode: "manual",
          sourceFeature: TUNING_SOURCE_FEATURE,
        }),
      ).unwrap();
      dispatch(
        replaceTuningColumn({
          columnId: col.columnId,
          next: { conversationId, syntheticAgentId: syntheticId },
        }),
      );
    }
  },
);

/**
 * Pin a version on the locked source agent. Forks each column from the
 * pinned snapshot record (so the synthetic carries the version's
 * messages/settings/tools, not the agent's current head).
 */
export const setLockedVersion = createAsyncThunk<
  void,
  { version: "current" | number; versionId?: string },
  ThunkApi
>(
  "agentComparisonTuning/setLockedVersion",
  async ({ version, versionId }, { dispatch, getState }) => {
    const state = getState();
    const { sourceAgentId, agentVersion } =
      state.agentComparisonTuning.locked;
    if (!sourceAgentId) return;
    if (agentVersion === version) return;

    if (version !== "current") {
      try {
        await dispatch(
          fetchAgentVersionSnapshot({ agentId: sourceAgentId, version }),
        ).unwrap();
      } catch {
        // non-fatal
      }
    }

    dispatch(
      setLocked({
        agentVersion: version,
        agentVersionId: version === "current" ? null : versionId ?? null,
      }),
    );

    // The fork source is the version record when pinned, the source
    // agent when "current". The fork helper looks up by id in
    // agentDefinition.agents, which is keyed by either depending on what
    // was loaded.
    const post = getState();
    const forkSourceId =
      version === "current"
        ? sourceAgentId
        : versionId ?? sourceAgentId;

    for (const col of post.agentComparisonTuning.columns) {
      teardownColumn(dispatch, col);
      const syntheticId = forkAgentForVariant(dispatch, post, forkSourceId);
      if (!syntheticId) continue;
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId: syntheticId,
          conversationId,
          apiEndpointMode: "manual",
          sourceFeature: TUNING_SOURCE_FEATURE,
        }),
      ).unwrap();
      dispatch(
        replaceTuningColumn({
          columnId: col.columnId,
          next: { conversationId, syntheticAgentId: syntheticId },
        }),
      );
    }
  },
);

// =============================================================================
// Columns
// =============================================================================

export const addColumnToTuningBattle = createAsyncThunk<
  string | null,
  { label?: string } | undefined,
  ThunkApi
>(
  "agentComparisonTuning/addColumn",
  async (arg, { dispatch, getState }) => {
    const state = getState();
    const { sourceAgentId, agentVersion, agentVersionId } =
      state.agentComparisonTuning.locked;
    if (!sourceAgentId) return null;

    const forkSourceId =
      agentVersion === "current" || !agentVersionId
        ? sourceAgentId
        : agentVersionId;

    const syntheticId = forkAgentForVariant(dispatch, state, forkSourceId);
    if (!syntheticId) return null;

    const columnId = crypto.randomUUID();
    const conversationId = generateConversationId();
    const label =
      arg?.label ??
      `Variant ${state.agentComparisonTuning.columns.length + 1}`;

    await dispatch(
      createManualInstance({
        agentId: syntheticId,
        conversationId,
        apiEndpointMode: "manual",
        sourceFeature: TUNING_SOURCE_FEATURE,
      }),
    ).unwrap();

    dispatch(
      addTuningColumn({
        columnId,
        conversationId,
        syntheticAgentId: syntheticId,
        label,
      }),
    );
    return columnId;
  },
);

export const removeColumnFromTuningBattle = createAsyncThunk<
  void,
  { columnId: string },
  ThunkApi
>(
  "agentComparisonTuning/removeColumn",
  async ({ columnId }, { dispatch, getState }) => {
    const state = getState();
    const col = state.agentComparisonTuning.columns.find(
      (c) => c.columnId === columnId,
    );
    if (col) teardownColumn(dispatch, col);
    dispatch(removeTuningColumn({ columnId }));
  },
);

// =============================================================================
// Submit All
// =============================================================================

export const submitAllTuning = createAsyncThunk<
  { launched: number; failed: number; skipped: number },
  void,
  ThunkApi
>(
  "agentComparisonTuning/submitAll",
  async (_arg, { dispatch, getState }) => {
    dispatch(submitAllStarted());
    try {
      const state = getState();
      const { sourceAgentId, variables, userMessage } =
        state.agentComparisonTuning.locked;
      const columns = state.agentComparisonTuning.columns;

      if (!sourceAgentId || columns.length === 0) {
        return { launched: 0, failed: 0, skipped: columns.length };
      }

      // Locked-input page — broadcast the locked text + variables to
      // every column's per-instance slices before firing.
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
              surfaceKey: TUNING_SURFACE_KEY,
            }),
          ).unwrap(),
        ),
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      const launched = results.length - failed;

      const post = getState();
      const activeSetId = post.agentComparisonTuning.activeSetId;
      if (activeSetId) {
        const entries = buildTuningEntries(post);
        try {
          await replaceEntries(activeSetId, entries);
          await renameComparisonSet(
            activeSetId,
            post.agentComparisonTuning.activeSetName ??
              "Untitled comparison",
          );
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            "[tuning] failed to persist comparison entries:",
            err,
          );
        }
      }

      return { launched, failed, skipped: 0 };
    } finally {
      dispatch(submitAllFinished());
    }
  },
);

// =============================================================================
// Clear / reset
// =============================================================================

export const clearTuningBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonTuning/clear",
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    for (const col of state.agentComparisonTuning.columns) {
      teardownColumn(dispatch, col);
    }
    dispatch(resetTuning());
  },
);

/**
 * Reset every column's conversation. preserveInputs=true keeps each
 * column's current per-column tuning; false resets every
 * column back to the source agent's baseline prompt.
 */
export const resetAllTuningConversations = createAsyncThunk<
  void,
  { preserveInputs?: boolean } | undefined,
  ThunkApi
>(
  "agentComparisonTuning/resetAllConversations",
  async (arg, { dispatch, getState }) => {
    const preserveInputs = arg?.preserveInputs ?? true;
    const state = getState();
    const { sourceAgentId, agentVersion, agentVersionId } =
      state.agentComparisonTuning.locked;
    if (!sourceAgentId) return;

    const forkSourceId =
      agentVersion === "current" || !agentVersionId
        ? sourceAgentId
        : agentVersionId;

    for (const col of state.agentComparisonTuning.columns) {
      const savedSnapshot = preserveInputs
        ? extractTuningSnapshot(state, col.syntheticAgentId)
        : null;

      teardownColumn(dispatch, col);

      const fresh = getState();
      const syntheticId = forkAgentForVariant(dispatch, fresh, forkSourceId);
      if (!syntheticId) continue;
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId: syntheticId,
          conversationId,
          apiEndpointMode: "manual",
          sourceFeature: TUNING_SOURCE_FEATURE,
        }),
      ).unwrap();
      if (savedSnapshot) {
        applyTuningSnapshot(dispatch, syntheticId, savedSnapshot);
      }
      dispatch(
        replaceTuningColumn({
          columnId: col.columnId,
          next: { conversationId, syntheticAgentId: syntheticId },
        }),
      );
    }
  },
);

// =============================================================================
// Save / Load
// =============================================================================

interface PersistedTuningEntryMeta {
  label: string;
  model_id: AgentDefinition["modelId"];
  settings: AgentDefinition["settings"];
}

function buildTuningEntries(state: RootState): UpsertEntryInput[] {
  const out: UpsertEntryInput[] = [];
  const { sourceAgentId, agentVersion, agentVersionId } =
    state.agentComparisonTuning.locked;
  if (!sourceAgentId) return out;
  state.agentComparisonTuning.columns.forEach((col, idx) => {
    const snapshot = extractTuningSnapshot(state, col.syntheticAgentId);
    const meta: PersistedTuningEntryMeta = {
      label: col.label,
      model_id: snapshot.modelId,
      settings: snapshot.settings,
    };
    out.push({
      conversationId: col.conversationId,
      displayOrder: idx,
      agentId: sourceAgentId,
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
  const {
    sourceAgentId,
    agentVersion,
    agentVersionId,
    variables,
    userMessage,
  } = state.agentComparisonTuning.locked;
  return {
    mode: "tuning",
    locked: {
      source_agent_id: sourceAgentId,
      agent_version: agentVersion,
      agent_version_id: agentVersionId,
      variables,
      user_message: userMessage,
    },
  };
}

export const saveTuningBattleAs = createAsyncThunk<
  { id: string; name: string },
  { name: string },
  ThunkApi
>(
  "agentComparisonTuning/saveAs",
  async ({ name }, { dispatch, getState }) => {
    const state = getState();
    const userId = selectUserId(state);
    if (!userId) throw new Error("Not signed in");

    const set = await createComparisonSet({
      name,
      userId,
      metadata: buildSetMetadata(state),
    });
    const entries = buildTuningEntries(state);
    if (entries.length > 0) {
      await replaceEntries(set.id, entries);
    }
    dispatch(setActiveTuningSet({ id: set.id, name: set.name }));
    return { id: set.id, name: set.name };
  },
);

export const saveTuningBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonTuning/save",
  async (_arg, { getState }) => {
    const state = getState();
    const setId = state.agentComparisonTuning.activeSetId;
    if (!setId) throw new Error("No active comparison set");
    const entries = buildTuningEntries(state);
    await replaceEntries(setId, entries);
  },
);

interface LoadedLockedSpec {
  source_agent_id: string | null;
  agent_version: "current" | number | null;
  agent_version_id: string | null;
  variables: Record<string, unknown>;
  user_message: string;
}

export const loadTuningBattleSet = createAsyncThunk<
  void,
  { setId: string },
  ThunkApi
>(
  "agentComparisonTuning/loadSet",
  async ({ setId }, { dispatch, getState }) => {
    const before = getState();
    for (const col of before.agentComparisonTuning.columns) {
      teardownColumn(dispatch, col);
    }
    dispatch(resetTuning());

    const { set, entries } = await loadComparisonSet(setId);
    const meta = (set.metadata ?? {}) as {
      mode?: string;
      locked?: LoadedLockedSpec;
    };
    if (meta.mode !== "tuning") {
      throw new Error(
        `Comparison set "${set.name}" is not a tuning-mode set (mode=${meta.mode ?? "?"})`,
      );
    }

    const locked = meta.locked ?? null;
    let forkSourceId: string | null = null;
    if (locked?.source_agent_id) {
      try {
        await dispatch(fetchFullAgent(locked.source_agent_id)).unwrap();
        await dispatch(
          fetchAgentVersionHistory({
            agentId: locked.source_agent_id,
            limit: 100,
          }),
        ).unwrap();
      } catch {
        // best effort
      }

      if (
        locked.agent_version &&
        locked.agent_version !== "current" &&
        typeof locked.agent_version === "number"
      ) {
        try {
          await dispatch(
            fetchAgentVersionSnapshot({
              agentId: locked.source_agent_id,
              version: locked.agent_version,
            }),
          ).unwrap();
        } catch {
          // best effort
        }
      }

      forkSourceId =
        locked.agent_version === "current" || !locked.agent_version_id
          ? locked.source_agent_id
          : locked.agent_version_id;

      dispatch(
        setLocked({
          sourceAgentId: locked.source_agent_id,
          agentVersion: locked.agent_version ?? "current",
          agentVersionId: locked.agent_version_id ?? null,
          variables: locked.variables ?? {},
          userMessage: locked.user_message ?? "",
        }),
      );
    }

    const nextColumns: TuningColumn[] = [];
    for (const entry of entries) {
      const columnId = crypto.randomUUID();
      const entryMeta = (entry.metadata ?? {}) as
        | Partial<PersistedTuningEntryMeta>
        | undefined;

      const fresh = getState();
      const syntheticId = forkSourceId
        ? forkAgentForVariant(dispatch, fresh, forkSourceId)
        : null;
      if (!syntheticId) continue;

      if (entryMeta) {
        applyTuningSnapshot(dispatch, syntheticId, {
          modelId: entryMeta.model_id ?? null,
          settings: entryMeta.settings ?? {},
        });
      }

      try {
        await dispatch(
          createManualInstance({
            agentId: syntheticId,
            conversationId: entry.conversation_id,
            apiEndpointMode: "manual",
            sourceFeature: TUNING_SOURCE_FEATURE,
          }),
        ).unwrap();
      } catch {
        dispatch(
          createInstance({
            conversationId: entry.conversation_id,
            agentId: syntheticId,
            agentType: "user",
            origin: "manual",
            sourceFeature: TUNING_SOURCE_FEATURE,
          }),
        );
      }

      try {
        await dispatch(
          loadConversation({
            conversationId: entry.conversation_id,
            surfaceKey: TUNING_SURFACE_KEY,
          }),
        ).unwrap();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[tuning] loadConversation failed:", err);
      }

      nextColumns.push({
        columnId,
        conversationId: entry.conversation_id,
        syntheticAgentId: syntheticId,
        label: entryMeta?.label ?? `Variant ${nextColumns.length + 1}`,
        collapsed: false,
      });
    }

    dispatch(setTuningColumns(nextColumns));
    dispatch(setActiveTuningSet({ id: set.id, name: set.name }));
  },
);
