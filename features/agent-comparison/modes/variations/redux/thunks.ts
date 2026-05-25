/**
 * Variations-mode thunks.
 *
 * Locked across variations: the test input only (variables + user message).
 * Varied per variation: the ENTIRE editable agent definition. Each variation
 * owns a SYNTHETIC clone of the template agent — a `cmp-<uuid>` record kept
 * entirely in Redux. The variation's manual instance is keyed to that
 * synthetic id so the execute-manual-instance thunk reads the per-variation
 * Builder edits live from `state.agentDefinition.agents[syntheticId]`.
 *
 * Why the manual endpoint? The Agent Builder's manual path ships the full
 * agent definition with every request — exactly what lets us vary everything
 * per variation without ever persisting a "false agent" to the DB. The `cmp-`
 * id prefix structurally gates the save thunks (see
 * `agent-definition/synthetic-id.ts`).
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
  createAgent,
} from "@/features/agents/redux/agent-definition/thunks";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  removeAgent,
  setAgentField,
  setAgentSettings,
  setAgentMessages,
  setAgentVariableDefinitions,
  setAgentContextSlots,
  setAgentTools,
  setAgentCustomTools,
  setAgentMcpServers,
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
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import {
  addVariationColumn,
  removeVariationColumn,
  replaceVariationColumn,
  resetVariations,
  setActiveVariationsSet,
  setLocked,
  setVariationColumns,
  submitAllFinished,
  submitAllStarted,
} from "./slice";
import type { VariationAgentSnapshot, VariationColumn } from "../types";

// =============================================================================
// Page-wide constants
// =============================================================================

export const VARIATIONS_SURFACE_KEY = "agent-comparison-variations";
const VARIATIONS_SOURCE_FEATURE = "agent-comparison" as const;

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

// =============================================================================
// Synthetic-agent snapshot helpers
// =============================================================================

/**
 * Read the editable slice of a synthetic agent's definition. Used at save
 * time so the loader can rebuild each variation with the same configuration.
 */
function extractVariationSnapshot(
  state: RootState,
  agentId: string,
): VariationAgentSnapshot | null {
  const a = state.agentDefinition.agents?.[agentId];
  if (!a) return null;
  return {
    modelId: a.modelId ?? null,
    settings: a.settings ?? ({} as AgentDefinition["settings"]),
    messages: a.messages ?? [],
    variableDefinitions: a.variableDefinitions ?? null,
    contextSlots: a.contextSlots ?? [],
    tools: a.tools ?? [],
    customTools: a.customTools ?? [],
    mcpServers: a.mcpServers ?? [],
  };
}

/**
 * Write an editable snapshot back onto a synthetic agent record. Mirrors the
 * field-setter actions the Builder dispatches so the same components drive
 * these synthetics with no special casing.
 */
function applyVariationSnapshot(
  dispatch: AppDispatch,
  agentId: string,
  snap: VariationAgentSnapshot,
) {
  dispatch(setAgentField({ id: agentId, field: "modelId", value: snap.modelId }));
  dispatch(setAgentSettings({ id: agentId, settings: snap.settings }));
  dispatch(setAgentMessages({ id: agentId, messages: snap.messages }));
  dispatch(
    setAgentVariableDefinitions({
      id: agentId,
      variableDefinitions: snap.variableDefinitions,
    }),
  );
  dispatch(setAgentContextSlots({ id: agentId, contextSlots: snap.contextSlots }));
  dispatch(setAgentTools({ id: agentId, tools: snap.tools }));
  dispatch(setAgentCustomTools({ id: agentId, customTools: snap.customTools }));
  dispatch(setAgentMcpServers({ id: agentId, mcpServers: snap.mcpServers }));
}

/**
 * Tear down a variation: destroy its instance and remove its synthetic agent
 * record (saves are structurally gated by the `cmp-` prefix, so leaving it
 * would be harmless — but pruning keeps the slice tidy).
 */
function teardownColumn(dispatch: AppDispatch, col: VariationColumn) {
  dispatch(destroyInstance(col.conversationId));
  dispatch(removeAgent(col.syntheticAgentId));
}

/** The id to fork from: the live template, or a pinned version snapshot. */
function resolveForkSourceId(locked: {
  sourceAgentId: string | null;
  agentVersion: "current" | number | null;
  agentVersionId: string | null;
}): string | null {
  if (!locked.sourceAgentId) return null;
  return locked.agentVersion === "current" || !locked.agentVersionId
    ? locked.sourceAgentId
    : locked.agentVersionId;
}

// =============================================================================
// Locked-axis configuration (the template)
// =============================================================================

/**
 * Set the template agent. Re-forks every existing variation from the new
 * template — old per-variation edits drop, which is the expected behavior
 * (a new template is a new baseline).
 */
export const setLockedSourceAgent = createAsyncThunk<
  void,
  { agentId: string },
  ThunkApi
>(
  "agentComparisonVariations/setLockedSourceAgent",
  async ({ agentId }, { dispatch, getState }) => {
    const state = getState();
    const prev = state.agentComparisonVariations.locked;
    if (prev.sourceAgentId === agentId) return;

    await Promise.allSettled([
      dispatch(fetchFullAgent(agentId)).unwrap(),
      dispatch(fetchAgentVersionHistory({ agentId, limit: 100 })).unwrap(),
    ]);

    dispatch(
      setLocked({
        sourceAgentId: agentId,
        agentVersion: "current",
        agentVersionId: null,
        variables: {},
      }),
    );

    const post = getState();
    for (const col of post.agentComparisonVariations.columns) {
      teardownColumn(dispatch, col);
      const syntheticId = forkAgentForVariant(dispatch, getState(), agentId);
      if (!syntheticId) continue;
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId: syntheticId,
          conversationId,
          apiEndpointMode: "manual",
          sourceFeature: VARIATIONS_SOURCE_FEATURE,
        }),
      ).unwrap();
      dispatch(
        replaceVariationColumn({
          columnId: col.columnId,
          next: { conversationId, syntheticAgentId: syntheticId },
        }),
      );
    }
  },
);

/**
 * Pin a version on the template. Re-forks each variation from the pinned
 * snapshot (so the synthetic carries that version's definition, not head).
 */
export const setLockedVersion = createAsyncThunk<
  void,
  { version: "current" | number; versionId?: string },
  ThunkApi
>(
  "agentComparisonVariations/setLockedVersion",
  async ({ version, versionId }, { dispatch, getState }) => {
    const state = getState();
    const { sourceAgentId, agentVersion } =
      state.agentComparisonVariations.locked;
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

    const post = getState();
    const forkSourceId = resolveForkSourceId(
      post.agentComparisonVariations.locked,
    );
    if (!forkSourceId) return;

    for (const col of post.agentComparisonVariations.columns) {
      teardownColumn(dispatch, col);
      const syntheticId = forkAgentForVariant(dispatch, getState(), forkSourceId);
      if (!syntheticId) continue;
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId: syntheticId,
          conversationId,
          apiEndpointMode: "manual",
          sourceFeature: VARIATIONS_SOURCE_FEATURE,
        }),
      ).unwrap();
      dispatch(
        replaceVariationColumn({
          columnId: col.columnId,
          next: { conversationId, syntheticAgentId: syntheticId },
        }),
      );
    }
  },
);

// =============================================================================
// Variations (columns)
// =============================================================================

export const addColumnToVariationsBattle = createAsyncThunk<
  string | null,
  { label?: string } | undefined,
  ThunkApi
>(
  "agentComparisonVariations/addColumn",
  async (arg, { dispatch, getState }) => {
    const state = getState();
    const forkSourceId = resolveForkSourceId(
      state.agentComparisonVariations.locked,
    );
    if (!forkSourceId) return null;

    const syntheticId = forkAgentForVariant(dispatch, state, forkSourceId);
    if (!syntheticId) return null;

    const columnId = crypto.randomUUID();
    const conversationId = generateConversationId();
    const label =
      arg?.label ??
      `Variation ${state.agentComparisonVariations.columns.length + 1}`;

    await dispatch(
      createManualInstance({
        agentId: syntheticId,
        conversationId,
        apiEndpointMode: "manual",
        sourceFeature: VARIATIONS_SOURCE_FEATURE,
      }),
    ).unwrap();

    dispatch(
      addVariationColumn({
        columnId,
        conversationId,
        syntheticAgentId: syntheticId,
        label,
      }),
    );
    return columnId;
  },
);

/**
 * Spawn N variations at once — backs the "how many variations?" picker.
 * Each is forked fresh from the template (identical baseline; the user then
 * edits each one).
 */
export const addVariationColumns = createAsyncThunk<
  number,
  { count: number },
  ThunkApi
>(
  "agentComparisonVariations/addColumns",
  async ({ count }, { dispatch, getState }) => {
    const forkSourceId = resolveForkSourceId(
      getState().agentComparisonVariations.locked,
    );
    if (!forkSourceId) return 0;

    const target = Math.max(0, Math.min(count, 12));
    let created = 0;
    for (let i = 0; i < target; i += 1) {
      const columnId = await dispatch(
        addColumnToVariationsBattle(undefined),
      ).unwrap();
      if (columnId) created += 1;
    }
    return created;
  },
);

export const removeColumnFromVariationsBattle = createAsyncThunk<
  void,
  { columnId: string },
  ThunkApi
>(
  "agentComparisonVariations/removeColumn",
  async ({ columnId }, { dispatch, getState }) => {
    const col = getState().agentComparisonVariations.columns.find(
      (c) => c.columnId === columnId,
    );
    if (col) teardownColumn(dispatch, col);
    dispatch(removeVariationColumn({ columnId }));
  },
);

// =============================================================================
// Promote a winning variation into a real, saved agent
// =============================================================================

export const promoteVariationToAgent = createAsyncThunk<
  string,
  { columnId: string; name: string },
  ThunkApi
>(
  "agentComparisonVariations/promoteToAgent",
  async ({ columnId, name }, { dispatch, getState }) => {
    const state = getState();
    const col = state.agentComparisonVariations.columns.find(
      (c) => c.columnId === columnId,
    );
    if (!col) throw new Error("Variation not found");
    const synthetic = state.agentDefinition.agents?.[col.syntheticAgentId];
    if (!synthetic) throw new Error("Variation agent not loaded");

    // createAgent omits id and mints a fresh uuid — the synthetic never
    // becomes the saved row; we copy its editable config into a new agent.
    const newId = await dispatch(
      createAgent({
        name: name.trim() || synthetic.name || "Untitled variation",
        description: synthetic.description ?? null,
        category: synthetic.category ?? null,
        tags: synthetic.tags ?? [],
        agentType: synthetic.agentType ?? "user",
        modelId: synthetic.modelId ?? null,
        messages: synthetic.messages ?? [],
        variableDefinitions: synthetic.variableDefinitions ?? null,
        settings: synthetic.settings,
        tools: synthetic.tools ?? [],
        customTools: synthetic.customTools ?? [],
        contextSlots: synthetic.contextSlots ?? [],
        mcpServers: synthetic.mcpServers ?? [],
      }),
    ).unwrap();

    return newId;
  },
);

// =============================================================================
// Submit All
// =============================================================================

export const submitAllVariations = createAsyncThunk<
  { launched: number; failed: number; skipped: number },
  void,
  ThunkApi
>(
  "agentComparisonVariations/submitAll",
  async (_arg, { dispatch, getState }) => {
    dispatch(submitAllStarted());
    try {
      const state = getState();
      const { sourceAgentId, variables, userMessage } =
        state.agentComparisonVariations.locked;
      const columns = state.agentComparisonVariations.columns;

      if (!sourceAgentId || columns.length === 0) {
        return { launched: 0, failed: 0, skipped: columns.length };
      }

      // Broadcast the shared test input to every variation's per-instance
      // slices before firing.
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
              surfaceKey: VARIATIONS_SURFACE_KEY,
            }),
          ).unwrap(),
        ),
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      const launched = results.length - failed;

      const post = getState();
      const activeSetId = post.agentComparisonVariations.activeSetId;
      if (activeSetId) {
        try {
          await replaceEntries(activeSetId, buildVariationEntries(post));
          await renameComparisonSet(
            activeSetId,
            post.agentComparisonVariations.activeSetName ??
              "Untitled comparison",
          );
        } catch (err) {
          console.error("[variations] failed to persist entries:", err);
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

export const clearVariationsBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonVariations/clear",
  async (_arg, { dispatch, getState }) => {
    for (const col of getState().agentComparisonVariations.columns) {
      teardownColumn(dispatch, col);
    }
    dispatch(resetVariations());
  },
);

/**
 * Reset every variation's conversation. preserveInputs=true keeps each
 * variation's current Builder edits; false resets every variation back to the
 * template baseline.
 */
export const resetAllVariationsConversations = createAsyncThunk<
  void,
  { preserveInputs?: boolean } | undefined,
  ThunkApi
>(
  "agentComparisonVariations/resetAllConversations",
  async (arg, { dispatch, getState }) => {
    const preserveInputs = arg?.preserveInputs ?? true;
    const forkSourceId = resolveForkSourceId(
      getState().agentComparisonVariations.locked,
    );
    if (!forkSourceId) return;

    for (const col of getState().agentComparisonVariations.columns) {
      const savedSnapshot = preserveInputs
        ? extractVariationSnapshot(getState(), col.syntheticAgentId)
        : null;

      teardownColumn(dispatch, col);

      const syntheticId = forkAgentForVariant(dispatch, getState(), forkSourceId);
      if (!syntheticId) continue;
      if (savedSnapshot) applyVariationSnapshot(dispatch, syntheticId, savedSnapshot);

      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId: syntheticId,
          conversationId,
          apiEndpointMode: "manual",
          sourceFeature: VARIATIONS_SOURCE_FEATURE,
        }),
      ).unwrap();
      dispatch(
        replaceVariationColumn({
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

interface PersistedVariationEntryMeta {
  label: string;
  agent: VariationAgentSnapshot;
}

function buildVariationEntries(state: RootState): UpsertEntryInput[] {
  const out: UpsertEntryInput[] = [];
  const { sourceAgentId, agentVersion, agentVersionId } =
    state.agentComparisonVariations.locked;
  if (!sourceAgentId) return out;
  state.agentComparisonVariations.columns.forEach((col, idx) => {
    const snapshot = extractVariationSnapshot(state, col.syntheticAgentId);
    if (!snapshot) return;
    const meta: PersistedVariationEntryMeta = { label: col.label, agent: snapshot };
    out.push({
      conversationId: col.conversationId,
      displayOrder: idx,
      agentId: sourceAgentId,
      agentVersion:
        agentVersion === "current" || agentVersion == null ? null : agentVersion,
      agentVersionSnapshotId: agentVersionId,
      metadata: meta as unknown as Record<string, unknown>,
    });
  });
  return out;
}

function buildSetMetadata(state: RootState): Record<string, unknown> {
  const { sourceAgentId, agentVersion, agentVersionId, variables, userMessage } =
    state.agentComparisonVariations.locked;
  return {
    mode: "variations",
    locked: {
      source_agent_id: sourceAgentId,
      agent_version: agentVersion,
      agent_version_id: agentVersionId,
      variables,
      user_message: userMessage,
    },
  };
}

export const saveVariationsBattleAs = createAsyncThunk<
  { id: string; name: string },
  { name: string },
  ThunkApi
>(
  "agentComparisonVariations/saveAs",
  async ({ name }, { dispatch, getState }) => {
    const state = getState();
    const userId = selectUserId(state);
    if (!userId) throw new Error("Not signed in");

    const set = await createComparisonSet({
      name,
      userId,
      metadata: buildSetMetadata(state),
    });
    const entries = buildVariationEntries(state);
    if (entries.length > 0) {
      await replaceEntries(set.id, entries);
    }
    dispatch(setActiveVariationsSet({ id: set.id, name: set.name }));
    return { id: set.id, name: set.name };
  },
);

export const saveVariationsBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonVariations/save",
  async (_arg, { getState }) => {
    const state = getState();
    const setId = state.agentComparisonVariations.activeSetId;
    if (!setId) throw new Error("No active comparison set");
    await replaceEntries(setId, buildVariationEntries(state));
  },
);

interface LoadedLockedSpec {
  source_agent_id: string | null;
  agent_version: "current" | number | null;
  agent_version_id: string | null;
  variables: Record<string, unknown>;
  user_message: string;
}

export const loadVariationsBattleSet = createAsyncThunk<
  void,
  { setId: string },
  ThunkApi
>(
  "agentComparisonVariations/loadSet",
  async ({ setId }, { dispatch, getState }) => {
    for (const col of getState().agentComparisonVariations.columns) {
      teardownColumn(dispatch, col);
    }
    dispatch(resetVariations());

    const { set, entries } = await loadComparisonSet(setId);
    const meta = (set.metadata ?? {}) as {
      mode?: string;
      locked?: LoadedLockedSpec;
    };
    if (meta.mode !== "variations") {
      throw new Error(
        `Comparison set "${set.name}" is not a variations-mode set (mode=${
          meta.mode ?? "?"
        })`,
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

    const nextColumns: VariationColumn[] = [];
    for (const entry of entries) {
      const entryMeta = (entry.metadata ?? {}) as
        | Partial<PersistedVariationEntryMeta>
        | undefined;

      const syntheticId = forkSourceId
        ? forkAgentForVariant(dispatch, getState(), forkSourceId)
        : null;
      if (!syntheticId) continue;

      if (entryMeta?.agent) {
        applyVariationSnapshot(dispatch, syntheticId, entryMeta.agent);
      }

      try {
        await dispatch(
          createManualInstance({
            agentId: syntheticId,
            conversationId: entry.conversation_id,
            apiEndpointMode: "manual",
            sourceFeature: VARIATIONS_SOURCE_FEATURE,
          }),
        ).unwrap();
      } catch {
        dispatch(
          createInstance({
            conversationId: entry.conversation_id,
            agentId: syntheticId,
            agentType: "user",
            origin: "manual",
            sourceFeature: VARIATIONS_SOURCE_FEATURE,
          }),
        );
      }

      try {
        await dispatch(
          loadConversation({
            conversationId: entry.conversation_id,
            surfaceKey: VARIATIONS_SURFACE_KEY,
          }),
        ).unwrap();
      } catch (err) {
        console.warn("[variations] loadConversation failed:", err);
      }

      nextColumns.push({
        columnId: crypto.randomUUID(),
        conversationId: entry.conversation_id,
        syntheticAgentId: syntheticId,
        label: entryMeta?.label ?? `Variation ${nextColumns.length + 1}`,
        collapsed: false,
      });
    }

    dispatch(setVariationColumns(nextColumns));
    dispatch(setActiveVariationsSet({ id: set.id, name: set.name }));
  },
);
