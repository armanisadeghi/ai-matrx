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
import { smartExecute } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
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
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { setBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import type { BuilderAdvancedSettings } from "@/features/agents/types/instance.types";
import { MASTER_INPUT_TARGET } from "../types";
import type { ContextObjectType } from "@/features/agents/types/agent-api-types";
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
  addMasterField,
  setMasterFieldMapping,
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

    // Auto-grow master fields + auto-map variables by index.
    await dispatch(reconcileMasterFieldMappings()).unwrap();
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

/**
 * Push a partial run-settings change to every configured column. Used by
 * the Shared Run Settings window so a single edit applies to all agents
 * being compared.
 */
export const broadcastRunSettings = createAsyncThunk<
  void,
  { changes: Partial<BuilderAdvancedSettings> },
  ThunkApi
>(
  "agentBattle/broadcastRunSettings",
  async ({ changes }, { dispatch, getState }) => {
    const state = getState();
    for (const col of state.agentBattle.columns) {
      if (!col.agentId) continue;
      dispatch(
        setBuilderAdvancedSettings({
          conversationId: col.conversationId,
          changes,
        }),
      );
    }
  },
);

// =============================================================================
// Submit All
// =============================================================================

/**
 * A column is submittable when:
 *   - It has an agent (instance exists), AND
 *   - Its per-instance input has text OR at least one user-edited variable
 *
 * Mirrors the per-column SmartAgentInput gate — Submit All should never
 * fire a column the per-column send button itself would refuse.
 */
function shouldSubmitColumn(col: BattleColumn, state: RootState): boolean {
  if (!col.agentId) return false;
  const variables =
    state.instanceVariableValues.byConversationId[col.conversationId]
      ?.userValues ?? {};
  const userText =
    state.instanceUserInput.byConversationId[col.conversationId]?.text ?? "";
  return Boolean(userText) || Object.keys(variables).length > 0;
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
      // Push master-field values into each column's instance state FIRST,
      // so the wire payload reflects the latest centralized inputs even
      // if the user typed in master fields without clicking Apply.
      await dispatch(applyMasterFieldsToColumns()).unwrap();

      const state = getState();
      // Snapshot the column list up front — submissions mutate per-instance
      // slices (autoclear etc.) so we don't want re-reads partway through.
      const targets = state.agentBattle.columns.filter((col) =>
        shouldSubmitColumn(col, state),
      );
      const skipped = state.agentBattle.columns.length - targets.length;

      // Fire smartExecute on each column's existing instance — same path
      // the per-column Send button uses. Each smartExecute returns
      // immediately after kicking off the stream; we await all so the
      // UI guard stays on while at least one is in flight.
      const results = await Promise.allSettled(
        targets.map((col) =>
          dispatch(
            smartExecute({
              conversationId: col.conversationId,
              surfaceKey: BATTLE_SURFACE_KEY,
            }),
          ).unwrap(),
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
    await dispatch(reconcileMasterFieldMappings()).unwrap();
  },
);

// =============================================================================
// Master fields → auto-map by variable count
// =============================================================================

/**
 * Reconcile master fields with the columns' variable definitions.
 *
 * Strategy:
 *   - Master message field is the first (always present, maps to "User message"
 *     on every column).
 *   - For the remaining custom fields, count the MAX number of variable
 *     definitions across all configured columns. Ensure we have that many
 *     custom fields; auto-map field[i] to each column's i-th variable
 *     by position.
 *   - Pre-existing user-set mappings are preserved; we only fill missing
 *     mappings (and add missing fields).
 *
 * Called whenever a column's agent changes.
 */
export const reconcileMasterFieldMappings = createAsyncThunk<
  void,
  void,
  ThunkApi
>(
  "agentBattle/reconcileMasterMappings",
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    const battle = state.agentBattle;
    const columns = battle.columns;

    // Resolve each column's variable definitions (by position).
    const colVars = columns.map((col) => {
      if (!col.agentId) return { columnId: col.columnId, varNames: [] as string[] };
      const agent = state.agentDefinition.agents?.[col.agentId];
      const varNames = (agent?.variableDefinitions ?? []).map((v) => v.name);
      return { columnId: col.columnId, varNames };
    });

    const maxVars = colVars.reduce(
      (m, c) => Math.max(m, c.varNames.length),
      0,
    );

    // Ensure exactly `maxVars` CUSTOM fields exist (in addition to master).
    const currentCustomFields = battle.masterFields.filter(
      (f) => f.kind === "custom",
    );
    const need = maxVars - currentCustomFields.length;
    for (let i = 0; i < need; i++) {
      dispatch(
        addMasterField({
          fieldId: crypto.randomUUID(),
          // Use a sensible label drawn from the longest column's variable name.
          label: pickDefaultLabelForIndex(currentCustomFields.length + i, colVars),
        }),
      );
    }

    // Re-read state so the newly-added field ids are visible.
    const post = getState().agentBattle;
    const customFields = post.masterFields.filter((f) => f.kind === "custom");

    // 1) Master field: ensure every configured column maps to User message
    //    when no explicit mapping is present.
    const master = post.masterFields.find((f) => f.kind === "master");
    if (master) {
      for (const col of columns) {
        if (!col.agentId) continue;
        if (master.mappings[col.columnId] !== undefined) continue;
        dispatch(
          setMasterFieldMapping({
            fieldId: master.fieldId,
            columnId: col.columnId,
            target: MASTER_INPUT_TARGET,
          }),
        );
      }
    }

    // 2) Custom fields: auto-map field[i] → varNames[i] for each column
    //    where no explicit mapping is already set.
    customFields.forEach((field, i) => {
      for (const { columnId, varNames } of colVars) {
        if (field.mappings[columnId] !== undefined) continue;
        const target = varNames[i];
        if (!target) continue;
        dispatch(
          setMasterFieldMapping({
            fieldId: field.fieldId,
            columnId,
            target,
          }),
        );
      }
    });
  },
);

/**
 * Pick a sensible default label for the i-th custom field. We look for the
 * first column whose variable list reaches index i and borrow that variable's
 * name as a starting label — feels much better than "Field 2", "Field 3".
 */
function pickDefaultLabelForIndex(
  i: number,
  colVars: Array<{ columnId: string; varNames: string[] }>,
): string {
  for (const c of colVars) {
    if (c.varNames[i]) return c.varNames[i];
  }
  return `Field ${i + 1}`;
}

// =============================================================================
// Master fields → per-column dispatch
// =============================================================================

/**
 * Push the master-fields values into each column's instance state per
 * its mapping. Called from the master-input UI's "Apply to columns"
 * button (and optionally on Submit All so the values are guaranteed
 * fresh on the wire).
 */
export const applyMasterFieldsToColumns = createAsyncThunk<
  void,
  void,
  ThunkApi
>(
  "agentBattle/applyMasterFields",
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    const columnsById = new Map(
      state.agentBattle.columns.map((c) => [c.columnId, c]),
    );

    for (const field of state.agentBattle.masterFields) {
      for (const [columnId, target] of Object.entries(field.mappings)) {
        if (!target) continue;
        const col = columnsById.get(columnId);
        if (!col || !col.agentId) continue;

        if (target === MASTER_INPUT_TARGET) {
          dispatch(
            setUserInputText({
              conversationId: col.conversationId,
              text: field.value,
            }),
          );
        } else {
          dispatch(
            setUserVariableValues({
              conversationId: col.conversationId,
              values: { [target]: field.value },
            }),
          );
        }
      }
    }
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

/**
 * Reset every column's conversation (responses + inputs + context) while
 * keeping the column's agent + version selection intact. Used by the
 * "Reset conversations" toolbar action — gives the user a fresh slate
 * without forcing them to re-pick agents.
 */
export const resetAllBattleConversations = createAsyncThunk<
  void,
  void,
  ThunkApi
>(
  "agentBattle/resetAllConversations",
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    for (const col of state.agentBattle.columns) {
      if (!col.agentId) continue;
      dispatch(destroyInstance(col.conversationId));
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId: col.agentId,
          conversationId,
          apiEndpointMode: "agent",
          sourceFeature: BATTLE_SOURCE_FEATURE,
          showVariablePanel: true,
        }),
      ).unwrap();
      dispatch(replaceColumn({ columnId: col.columnId, next: { conversationId } }));
    }
  },
);
