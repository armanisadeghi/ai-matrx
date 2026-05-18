/**
 * Settings-mode thunks.
 *
 * Orchestrates the locked-axis flow:
 *   - Setting the locked agent recreates all column instances under the
 *     new agent so each column's overrides have a fresh slate keyed to
 *     the right baseSettings.
 *   - Adding a column mints a fresh conversationId + creates an instance
 *     using the locked agent / version.
 *   - Submit All copies the locked user_message + variable values into
 *     EVERY column's instance, then dispatches smartExecute per column.
 *
 * Per-column LLM overrides live in the shared `instanceModelOverrides`
 * slice (executor already reads from there). The settings editor
 * dispatches `setOverrides({ conversationId, changes })` directly — no
 * indirection through this thunk file.
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
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  createComparisonSet,
  loadComparisonSet,
  renameComparisonSet,
  replaceEntries,
  type UpsertEntryInput,
} from "@/features/agent-comparison/service/comparisonSetsService";
import {
  addSettingsColumn,
  removeSettingsColumn,
  replaceSettingsColumn,
  resetSettings,
  setActiveSettingsSet,
  setLocked,
  setSettingsColumns,
  submitAllFinished,
  submitAllStarted,
} from "./slice";
import type { SettingsColumn } from "../types";

// =============================================================================
// Page-wide constants
// =============================================================================

export const SETTINGS_SURFACE_KEY = "agent-comparison-settings";
const SETTINGS_SOURCE_FEATURE = "agent-comparison" as const;

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

// =============================================================================
// Locked-axis configuration
// =============================================================================

/**
 * Set the locked agent for the whole page. This recreates every existing
 * column's instance under the new agent so:
 *   - the new agent's baseSettings live on each instance's overrides layer
 *   - variable definitions are correct (locked variables get re-seeded
 *     from the new agent's variableDefinitions, dropping stale keys)
 *   - the executor routes to the right agent or version on submit
 *
 * Carries existing overrides across the recreate if the user already
 * configured a column (preserved per-conversation in the shared overrides
 * slice — they survive the column.conversationId change because we copy
 * them by reading + re-writing).
 */
export const setLockedAgent = createAsyncThunk<
  void,
  { agentId: string },
  ThunkApi
>(
  "agentComparisonSettings/setLockedAgent",
  async ({ agentId }, { dispatch, getState }) => {
    const state = getState();
    const prev = state.agentComparisonSettings.locked;
    const wasReady = prev.agentId === agentId;
    if (wasReady) return;

    // Load the agent + its version history for the locked-axis pickers.
    await Promise.allSettled([
      dispatch(fetchFullAgent(agentId)).unwrap(),
      dispatch(
        fetchAgentVersionHistory({ agentId, limit: 100 }),
      ).unwrap(),
    ]);

    // Reset locked variable values since the new agent's variable schema
    // may not overlap. The user re-fills them; cheaper than guessing.
    dispatch(
      setLocked({
        agentId,
        agentVersion: "current",
        agentVersionId: null,
        variables: {},
      }),
    );

    // Recreate every column's instance under the new agent. Carry
    // existing overrides forward so the user doesn't lose model/temp
    // configs when they change the agent.
    const post = getState();
    for (const col of post.agentComparisonSettings.columns) {
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
          sourceFeature: SETTINGS_SOURCE_FEATURE,
        }),
      ).unwrap();
      // Re-apply the overrides the user had on this column previously.
      if (Object.keys(prevOverrides).length > 0) {
        dispatch(
          setOverrides({
            conversationId,
            changes: prevOverrides,
          }),
        );
      }
      dispatch(
        replaceSettingsColumn({
          columnId: col.columnId,
          next: { conversationId },
        }),
      );
    }
  },
);

/**
 * Pin a version on the locked agent. Like setLockedAgent, recreates each
 * column's instance with the right `initialAgentVersionId` so the executor
 * targets the frozen version row (POST /ai/agents/{version_id} with
 * is_version: true).
 */
export const setLockedVersion = createAsyncThunk<
  void,
  { version: "current" | number; versionId?: string },
  ThunkApi
>(
  "agentComparisonSettings/setLockedVersion",
  async ({ version, versionId }, { dispatch, getState }) => {
    const state = getState();
    const { agentId, agentVersion } = state.agentComparisonSettings.locked;
    if (!agentId) return;
    if (agentVersion === version) return;

    // Hydrate the snapshot for label display (best-effort).
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
        agentVersionId: version === "current" ? null : versionId ?? null,
      }),
    );

    // Recreate every column's instance with the right version pin.
    const post = getState();
    const pinnedVersionId =
      version === "current" ? null : versionId ?? null;
    for (const col of post.agentComparisonSettings.columns) {
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
          sourceFeature: SETTINGS_SOURCE_FEATURE,
        }),
      ).unwrap();
      if (Object.keys(prevOverrides).length > 0) {
        dispatch(
          setOverrides({ conversationId, changes: prevOverrides }),
        );
      }
      dispatch(
        replaceSettingsColumn({
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

/**
 * Add a fresh settings column bound to the locked agent + version. If no
 * agent is picked yet, no-ops — the toolbar disables the add button in
 * that case.
 */
export const addColumnToSettingsBattle = createAsyncThunk<
  string | null,
  { label?: string } | undefined,
  ThunkApi
>(
  "agentComparisonSettings/addColumn",
  async (arg, { dispatch, getState }) => {
    const state = getState();
    const { agentId, agentVersionId } = state.agentComparisonSettings.locked;
    if (!agentId) return null;

    const columnId = crypto.randomUUID();
    const conversationId = generateConversationId();
    const label =
      arg?.label ??
      `Variant ${state.agentComparisonSettings.columns.length + 1}`;

    await dispatch(
      createManualInstance({
        agentId,
        conversationId,
        initialAgentVersionId: agentVersionId,
        apiEndpointMode: "agent",
        sourceFeature: SETTINGS_SOURCE_FEATURE,
      }),
    ).unwrap();

    dispatch(
      addSettingsColumn({ columnId, conversationId, label }),
    );
    return columnId;
  },
);

export const removeColumnFromSettingsBattle = createAsyncThunk<
  void,
  { columnId: string },
  ThunkApi
>(
  "agentComparisonSettings/removeColumn",
  async ({ columnId }, { dispatch, getState }) => {
    const state = getState();
    const col = state.agentComparisonSettings.columns.find(
      (c) => c.columnId === columnId,
    );
    if (col) {
      dispatch(destroyInstance(col.conversationId));
    }
    dispatch(removeSettingsColumn({ columnId }));
  },
);

// =============================================================================
// Submit All
// =============================================================================

/**
 * Copy the locked inputs into every configured column, then smartExecute
 * each in parallel. Each column uses its OWN model overrides — the locked
 * input is the constant, the settings are the varied dimension.
 */
export const submitAllSettings = createAsyncThunk<
  { launched: number; failed: number; skipped: number },
  void,
  ThunkApi
>(
  "agentComparisonSettings/submitAll",
  async (_arg, { dispatch, getState }) => {
    dispatch(submitAllStarted());
    try {
      const state = getState();
      const { agentId, variables, userMessage } =
        state.agentComparisonSettings.locked;
      const columns = state.agentComparisonSettings.columns;

      if (!agentId || columns.length === 0) {
        return { launched: 0, failed: 0, skipped: columns.length };
      }

      // Page is locked-input — broadcast the locked text + variables to
      // every column's per-instance slices before firing. The shared
      // executor will read those slices for each conversation.
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
              surfaceKey: SETTINGS_SURFACE_KEY,
            }),
          ).unwrap(),
        ),
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      const launched = results.length - failed;

      // Persist entries when a set is active.
      const post = getState();
      const activeSetId = post.agentComparisonSettings.activeSetId;
      if (activeSetId) {
        const entries = buildSettingsEntries(post);
        try {
          await replaceEntries(activeSetId, entries);
          // Update set metadata with the latest locked snapshot.
          await renameComparisonSet(activeSetId, post.agentComparisonSettings.activeSetName ?? "Untitled comparison");
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            "[settings] failed to persist comparison entries:",
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

export const clearSettingsBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonSettings/clear",
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    for (const col of state.agentComparisonSettings.columns) {
      dispatch(destroyInstance(col.conversationId));
    }
    dispatch(resetSettings());
  },
);

/**
 * Reset every column's conversation. preserveInputs=true keeps the per-
 * column LLM overrides and the locked inputs intact; false also clears
 * the locked inputs and per-column overrides.
 */
export const resetAllSettingsConversations = createAsyncThunk<
  void,
  { preserveInputs?: boolean } | undefined,
  ThunkApi
>(
  "agentComparisonSettings/resetAllConversations",
  async (arg, { dispatch, getState }) => {
    const preserveInputs = arg?.preserveInputs ?? true;
    const state = getState();
    const { agentId, agentVersionId } = state.agentComparisonSettings.locked;
    if (!agentId) return;

    for (const col of state.agentComparisonSettings.columns) {
      const savedOverrides = preserveInputs
        ? state.instanceModelOverrides.byConversationId[col.conversationId]
            ?.overrides ?? {}
        : {};

      dispatch(destroyInstance(col.conversationId));
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId,
          conversationId,
          initialAgentVersionId: agentVersionId,
          apiEndpointMode: "agent",
          sourceFeature: SETTINGS_SOURCE_FEATURE,
        }),
      ).unwrap();
      if (Object.keys(savedOverrides).length > 0) {
        dispatch(setOverrides({ conversationId, changes: savedOverrides }));
      }
      dispatch(
        replaceSettingsColumn({
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

/**
 * Serialize the per-column rows for the comparison_set entry table.
 * Stores the per-column overrides + label in entry metadata; the locked
 * setup goes on the SET row's metadata (one source of truth for what
 * was held constant).
 */
function buildSettingsEntries(state: RootState): UpsertEntryInput[] {
  const out: UpsertEntryInput[] = [];
  const { agentId, agentVersion, agentVersionId } =
    state.agentComparisonSettings.locked;
  if (!agentId) return out;
  state.agentComparisonSettings.columns.forEach((col, idx) => {
    const overrides =
      state.instanceModelOverrides.byConversationId[col.conversationId]
        ?.overrides ?? {};
    out.push({
      conversationId: col.conversationId,
      displayOrder: idx,
      agentId,
      agentVersion:
        agentVersion === "current" || agentVersion == null
          ? null
          : agentVersion,
      agentVersionSnapshotId: agentVersionId,
      metadata: {
        label: col.label,
        overrides,
      },
    });
  });
  return out;
}

function buildSetMetadata(state: RootState): Record<string, unknown> {
  const { agentId, agentVersion, agentVersionId, variables, userMessage } =
    state.agentComparisonSettings.locked;
  return {
    mode: "settings",
    locked: {
      agent_id: agentId,
      agent_version: agentVersion,
      agent_version_id: agentVersionId,
      variables,
      user_message: userMessage,
    },
  };
}

export const saveSettingsBattleAs = createAsyncThunk<
  { id: string; name: string },
  { name: string },
  ThunkApi
>(
  "agentComparisonSettings/saveAs",
  async ({ name }, { dispatch, getState }) => {
    const state = getState();
    const userId = selectUserId(state);
    if (!userId) throw new Error("Not signed in");

    const set = await createComparisonSet({
      name,
      userId,
      metadata: buildSetMetadata(state),
    });
    const entries = buildSettingsEntries(state);
    if (entries.length > 0) {
      await replaceEntries(set.id, entries);
    }
    dispatch(setActiveSettingsSet({ id: set.id, name: set.name }));
    return { id: set.id, name: set.name };
  },
);

export const saveSettingsBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonSettings/save",
  async (_arg, { getState }) => {
    const state = getState();
    const setId = state.agentComparisonSettings.activeSetId;
    if (!setId) throw new Error("No active comparison set");
    const entries = buildSettingsEntries(state);
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

export const loadSettingsBattleSet = createAsyncThunk<
  void,
  { setId: string },
  ThunkApi
>(
  "agentComparisonSettings/loadSet",
  async ({ setId }, { dispatch, getState }) => {
    // Wipe local state.
    const before = getState();
    for (const col of before.agentComparisonSettings.columns) {
      dispatch(destroyInstance(col.conversationId));
    }
    dispatch(resetSettings());

    const { set, entries } = await loadComparisonSet(setId);
    const meta = (set.metadata ?? {}) as { mode?: string; locked?: LoadedLockedSpec };
    if (meta.mode !== "settings") {
      throw new Error(
        `Comparison set "${set.name}" is not a settings-mode set (mode=${meta.mode ?? "?"})`,
      );
    }

    const locked = meta.locked ?? null;
    if (locked?.agent_id) {
      // Load agent + version history.
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

    // Restore each column + its per-column overrides + history.
    const nextColumns: SettingsColumn[] = [];
    for (const entry of entries) {
      const columnId = crypto.randomUUID();
      try {
        await dispatch(
          createManualInstance({
            agentId: entry.agent_id,
            conversationId: entry.conversation_id,
            initialAgentVersionId: entry.agent_version_snapshot_id ?? null,
            apiEndpointMode: "agent",
            sourceFeature: SETTINGS_SOURCE_FEATURE,
          }),
        ).unwrap();
      } catch {
        // fallback — direct slice insert so subsequent calls don't trip
        dispatch(
          createInstance({
            conversationId: entry.conversation_id,
            agentId: entry.agent_id,
            agentType: "user",
            origin: "manual",
            sourceFeature: SETTINGS_SOURCE_FEATURE,
          }),
        );
      }

      const entryMeta = (entry.metadata ?? {}) as {
        label?: string;
        overrides?: Record<string, unknown>;
      };
      if (entryMeta.overrides && Object.keys(entryMeta.overrides).length > 0) {
        dispatch(
          setOverrides({
            conversationId: entry.conversation_id,
            changes: entryMeta.overrides,
          }),
        );
      }

      try {
        await dispatch(
          loadConversation({
            conversationId: entry.conversation_id,
            surfaceKey: SETTINGS_SURFACE_KEY,
          }),
        ).unwrap();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[settings] loadConversation failed:", err);
      }

      nextColumns.push({
        columnId,
        conversationId: entry.conversation_id,
        label: entryMeta.label ?? `Variant ${nextColumns.length + 1}`,
        collapsed: false,
      });
    }

    dispatch(setSettingsColumns(nextColumns));
    dispatch(setActiveSettingsSet({ id: set.id, name: set.name }));
  },
);
