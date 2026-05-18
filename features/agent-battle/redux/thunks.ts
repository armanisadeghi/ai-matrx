/**
 * Agent Battle — thunks
 *
 * The orchestration layer. Glue between the battle slice, the execution
 * system, and the Supabase persistence layer.
 *
 * Surface key + source feature are page-wide constants — every column
 * shares them so analytics can attribute all runs to /agents/battle.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { generateConversationId } from "@/features/agents/redux/execution-system/utils/ids";
import {
  createInstance,
  destroyInstance,
} from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { createManualInstance } from "@/features/agents/redux/execution-system/thunks/create-instance.thunk";
import { launchConversation } from "@/features/agents/redux/execution-system/thunks/launch-conversation.thunk";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import {
  fetchFullAgent,
  fetchAgentVersionHistory,
  fetchAgentVersionSnapshot,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  setContextEntry,
  removeContextEntry,
} from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import type { ContextObjectType } from "@/features/agents/types/agent-api-types";
import type { ConversationInvocation } from "@/features/agents/types/conversation-invocation.types";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  addColumn,
  removeColumn,
  replaceColumn,
  setColumnAgentVersion,
  setColumns,
  submitAllStarted,
  submitAllFinished,
  setActiveSet,
  resetBattle,
} from "./battleSlice";
import {
  createComparisonSet,
  listComparisonSets,
  loadComparisonSet as fetchComparisonSet,
  renameComparisonSet,
  replaceEntries,
  type UpsertEntryInput,
} from "../service/comparisonSetsService";
import type { BattleAgentVersion, BattleColumn } from "../types";

// =============================================================================
// Page-wide constants
// =============================================================================

export const BATTLE_SURFACE_KEY = "agent-battle";
const BATTLE_SOURCE_FEATURE = "agent-battle" as const;

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

// =============================================================================
// Column management
// =============================================================================

/**
 * Add a fresh, empty column. No instance is created until the user picks
 * an agent — there's nothing to bind to yet.
 */
export const addBattleColumn = createAsyncThunk<string, void, ThunkApi>(
  "agentBattle/addColumn",
  async (_arg, { dispatch }) => {
    const columnId = crypto.randomUUID();
    const conversationId = generateConversationId();
    dispatch(addColumn({ columnId, conversationId }));
    return columnId;
  },
);

/**
 * Remove a column. If it had an active conversation instance, destroy it
 * so the per-instance slices don't leak.
 */
export const removeBattleColumn = createAsyncThunk<
  void,
  { columnId: string },
  ThunkApi
>(
  "agentBattle/removeColumn",
  async ({ columnId }, { dispatch, getState }) => {
    const state = getState();
    const col = state.agentBattle.columns.find((c) => c.columnId === columnId);
    if (col && col.agentId) {
      dispatch(destroyInstance(col.conversationId));
    }
    dispatch(removeColumn({ columnId }));
  },
);

/**
 * Pick an agent for a column. If the column already had an agent (and
 * therefore an instance), destroy that instance and mint a fresh
 * conversationId — switching agents should not leak the previous
 * variable bindings or context entries.
 */
export const setColumnAgent = createAsyncThunk<
  void,
  { columnId: string; agentId: string },
  ThunkApi
>(
  "agentBattle/setColumnAgent",
  async ({ columnId, agentId }, { dispatch, getState }) => {
    const state = getState();
    const col = state.agentBattle.columns.find((c) => c.columnId === columnId);
    if (!col) return;

    // Destroy the prior instance (if any) and mint a new conversation id.
    if (col.agentId) {
      dispatch(destroyInstance(col.conversationId));
    }
    const conversationId = generateConversationId();

    // Make sure the agent record + version history are loaded for the
    // dropdowns. fetchFullAgent populates the variableDefinitions /
    // contextSlots that createManualInstance reads from state.
    await Promise.allSettled([
      dispatch(fetchFullAgent(agentId)).unwrap(),
      dispatch(fetchAgentVersionHistory({ agentId, limit: 100 })).unwrap(),
    ]);

    // Build the per-instance slices.
    await dispatch(
      createManualInstance({
        agentId,
        conversationId,
        apiEndpointMode: "agent",
        sourceFeature: BATTLE_SOURCE_FEATURE,
        showVariablePanel: true,
      }),
    ).unwrap();

    dispatch(
      replaceColumn({
        columnId,
        next: {
          agentId,
          conversationId,
          agentVersion: "current",
          collapsed: false,
        },
      }),
    );
  },
);

/**
 * Pick a version for a column. "current" requires no fetch; a numbered
 * version triggers a snapshot fetch so the dropdown label can stay
 * accurate. Execution itself still routes through the live agent record
 * in this phase — version-pinned execution lands with the surface path.
 */
export const setColumnVersion = createAsyncThunk<
  void,
  { columnId: string; version: BattleAgentVersion },
  ThunkApi
>(
  "agentBattle/setColumnVersion",
  async ({ columnId, version }, { dispatch, getState }) => {
    const state = getState();
    const col = state.agentBattle.columns.find((c) => c.columnId === columnId);
    if (!col || !col.agentId) return;

    if (version !== "current") {
      await dispatch(
        fetchAgentVersionSnapshot({ agentId: col.agentId, version }),
      ).unwrap();
    }
    dispatch(setColumnAgentVersion({ columnId, agentVersion: version }));
  },
);

// =============================================================================
// Shared Context broadcast — fan out one user action to all N columns
// =============================================================================

interface BroadcastContextEntryArgs {
  key: string;
  value: unknown;
  type?: ContextObjectType;
  label?: string;
  slotMatched?: boolean;
}

export const broadcastContextEntry = createAsyncThunk<
  void,
  BroadcastContextEntryArgs,
  ThunkApi
>(
  "agentBattle/broadcastContextEntry",
  async (entry, { dispatch, getState }) => {
    const state = getState();
    for (const col of state.agentBattle.columns) {
      // Only push to columns that have an initialized instance.
      if (!col.agentId) continue;
      dispatch(
        setContextEntry({
          conversationId: col.conversationId,
          key: entry.key,
          value: entry.value,
          type: entry.type,
          label: entry.label,
          slotMatched: entry.slotMatched,
        }),
      );
    }
  },
);

export const broadcastRemoveContextEntry = createAsyncThunk<
  void,
  { key: string },
  ThunkApi
>(
  "agentBattle/broadcastRemoveContextEntry",
  async ({ key }, { dispatch, getState }) => {
    const state = getState();
    for (const col of state.agentBattle.columns) {
      if (!col.agentId) continue;
      dispatch(removeContextEntry({ conversationId: col.conversationId, key }));
    }
  },
);

// =============================================================================
// Submit All
// =============================================================================

function buildInvocation(col: BattleColumn, state: RootState): ConversationInvocation | null {
  if (!col.agentId) return null;
  const variables =
    state.instanceVariableValues.byConversationId[col.conversationId]
      ?.userValues ?? {};
  const userText =
    state.instanceUserInput.byConversationId[col.conversationId]?.text ?? "";

  // Skip columns with no input AT ALL — nothing to submit.
  if (!userText && Object.keys(variables).length === 0) return null;

  return {
    identity: {
      surfaceKey: BATTLE_SURFACE_KEY,
    },
    engine: {
      kind: "agent",
      agentId: col.agentId,
    },
    routing: {
      apiEndpointMode: "agent",
    },
    origin: {
      origin: "manual",
      sourceFeature: BATTLE_SOURCE_FEATURE,
    },
    inputs: {
      userInput: userText,
      variables,
    },
  };
}

export const submitAllBattleColumns = createAsyncThunk<
  { launched: number; skipped: number; failed: number },
  void,
  ThunkApi
>(
  "agentBattle/submitAll",
  async (_arg, { dispatch, getState }) => {
    dispatch(submitAllStarted());
    try {
      const state = getState();
      const invocations: Array<{ col: BattleColumn; invocation: ConversationInvocation }> =
        [];
      let skipped = 0;
      for (const col of state.agentBattle.columns) {
        const invocation = buildInvocation(col, state);
        if (!invocation) {
          skipped += 1;
          continue;
        }
        invocations.push({ col, invocation });
      }

      const results = await Promise.allSettled(
        invocations.map(({ invocation }) =>
          dispatch(launchConversation(invocation)).unwrap(),
        ),
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      const launched = results.length - failed;

      // If a set is active, persist the entries now that everything was
      // launched (their cx_conversation rows exist server-side).
      const post = getState();
      const activeSetId = post.agentBattle.activeSetId;
      if (activeSetId) {
        const entries = buildPersistEntries(post.agentBattle.columns);
        if (entries.length > 0) {
          try {
            await replaceEntries(activeSetId, entries);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error(
              "[agentBattle] failed to persist comparison entries:",
              err,
            );
          }
        }
      }

      return { launched, skipped, failed };
    } finally {
      dispatch(submitAllFinished());
    }
  },
);

// =============================================================================
// Save / Load comparison sets
// =============================================================================

function buildPersistEntries(columns: BattleColumn[]): UpsertEntryInput[] {
  const out: UpsertEntryInput[] = [];
  columns.forEach((col, idx) => {
    if (!col.agentId) return;
    out.push({
      conversationId: col.conversationId,
      displayOrder: idx,
      agentId: col.agentId,
      agentVersion:
        col.agentVersion === "current" || col.agentVersion == null
          ? null
          : col.agentVersion,
      agentVersionSnapshotId: null,
    });
  });
  return out;
}

export const saveBattleAs = createAsyncThunk<
  { id: string; name: string },
  { name: string },
  ThunkApi
>(
  "agentBattle/saveAs",
  async ({ name }, { dispatch, getState }) => {
    const state = getState();
    const userId = selectUserId(state);
    if (!userId) throw new Error("Not signed in");

    const set = await createComparisonSet({ name, userId });
    const entries = buildPersistEntries(state.agentBattle.columns);
    if (entries.length > 0) {
      await replaceEntries(set.id, entries);
    }
    dispatch(setActiveSet({ id: set.id, name: set.name }));
    return { id: set.id, name: set.name };
  },
);

export const saveBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentBattle/save",
  async (_arg, { getState }) => {
    const state = getState();
    const setId = state.agentBattle.activeSetId;
    if (!setId) throw new Error("No active comparison set");
    const entries = buildPersistEntries(state.agentBattle.columns);
    await replaceEntries(setId, entries);
  },
);

export const renameActiveBattleSet = createAsyncThunk<
  void,
  { name: string },
  ThunkApi
>(
  "agentBattle/rename",
  async ({ name }, { dispatch, getState }) => {
    const state = getState();
    const setId = state.agentBattle.activeSetId;
    if (!setId) throw new Error("No active comparison set");
    await renameComparisonSet(setId, name);
    dispatch(setActiveSet({ id: setId, name }));
  },
);

export const listMyBattleSets = createAsyncThunk<
  Awaited<ReturnType<typeof listComparisonSets>>,
  void,
  ThunkApi
>(
  "agentBattle/listMine",
  async (_arg, { getState }) => {
    const state = getState();
    const userId = selectUserId(state);
    if (!userId) throw new Error("Not signed in");
    return listComparisonSets(userId, 100);
  },
);

export const loadBattleSet = createAsyncThunk<
  void,
  { setId: string },
  ThunkApi
>(
  "agentBattle/loadSet",
  async ({ setId }, { dispatch, getState }) => {
    // Wipe current columns + destroy their instances.
    const before = getState();
    for (const col of before.agentBattle.columns) {
      if (col.agentId) dispatch(destroyInstance(col.conversationId));
    }
    dispatch(resetBattle());

    const { set, entries } = await fetchComparisonSet(setId);

    // For each entry, ensure the agent record is loaded + an instance exists
    // bound to the saved conversation id, then trigger history load.
    const nextColumns: BattleColumn[] = [];
    for (const entry of entries) {
      const columnId = crypto.randomUUID();

      // Best-effort agent fetch — if the agent was deleted, the column
      // will render with a missing label but the conversation history
      // still loads.
      try {
        await dispatch(fetchFullAgent(entry.agent_id)).unwrap();
        await dispatch(
          fetchAgentVersionHistory({ agentId: entry.agent_id, limit: 100 }),
        ).unwrap();
      } catch {
        // swallow — UI shows "unknown agent"
      }

      // Create an instance keyed by the saved conversation id.
      try {
        await dispatch(
          createManualInstance({
            agentId: entry.agent_id,
            conversationId: entry.conversation_id,
            apiEndpointMode: "agent",
            sourceFeature: BATTLE_SOURCE_FEATURE,
            showVariablePanel: true,
          }),
        ).unwrap();
      } catch (err) {
        // Already exists — that's fine.
        // eslint-disable-next-line no-console
        console.warn(
          "[agentBattle] createManualInstance (load) returned:",
          err,
        );
        // Fall back to a direct slice insert so subsequent slice initialisers
        // run for at least the conversation record.
        dispatch(
          createInstance({
            conversationId: entry.conversation_id,
            agentId: entry.agent_id,
            agentType: "user",
            origin: "manual",
            sourceFeature: BATTLE_SOURCE_FEATURE,
          }),
        );
      }

      // Pull the message history into Redux so it renders in the column.
      try {
        await dispatch(
          loadConversation({
            conversationId: entry.conversation_id,
            surfaceKey: BATTLE_SURFACE_KEY,
          }),
        ).unwrap();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[agentBattle] loadConversation (load) failed:", err);
      }

      nextColumns.push({
        columnId,
        conversationId: entry.conversation_id,
        agentId: entry.agent_id,
        agentVersion:
          entry.agent_version == null ? "current" : entry.agent_version,
        collapsed: false,
      });
    }

    dispatch(setColumns(nextColumns));
    dispatch(setActiveSet({ id: set.id, name: set.name }));
  },
);

export const clearBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentBattle/clear",
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    for (const col of state.agentBattle.columns) {
      if (col.agentId) dispatch(destroyInstance(col.conversationId));
    }
    dispatch(resetBattle());
  },
);
