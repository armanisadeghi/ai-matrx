/**
 * Request-Modification-mode thunks.
 *
 * Simplest mode in the family: every column runs the SAME locked
 * agent. No synthetic agents, no per-column agent overrides. What
 * varies is whatever the user types into each column's own
 * SmartAgentInput (variables + user message). Submit All just runs
 * smartExecute on every column in parallel.
 *
 * Comparison-set entry metadata persists each column's last-submitted
 * input (variables + text) so loaders can restore the per-column
 * setups, though the user can also just re-type.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { isConversationRequestEmpty } from "@/features/agent-comparison/shared/battleRequestEmpty";
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
import { setUserInputText } from "@ai-matrx/chat/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { setUserVariableValues } from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { generateConversationId } from "@ai-matrx/chat/agents/redux/execution-system/utils/ids";
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
import { selectMessageCount } from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";
import { selectResolvedVariables } from "@ai-matrx/chat/agents/redux/execution-system/instance-variable-values/instance-variable-values.selectors";
import {
  addRequestModColumn,
  removeRequestModColumn,
  replaceRequestModColumn,
  resetRequestMod,
  setActiveRequestModSet,
  setRequestModColumnLastRequest,
  setLocked,
  setRequestModColumns,
  submitAllFinished,
  submitAllStarted,
} from "./slice";
import type { RequestModColumn, RequestModColumnRequest } from "../types";
import { columnRequestToSave, readLiveColumnRequest } from "../columnRequest";
import {
  applyRequestDraft,
  isRequestDraftSnapshot,
  type OmittedAttachment,
} from "@ai-matrx/chat/agents/redux/execution-system/thunks/request-draft-snapshot";

// =============================================================================
// Page-wide constants
// =============================================================================

export const REQUEST_MOD_SURFACE_KEY = "agent-comparison-request-mod";
const REQUEST_MOD_SOURCE_FEATURE = "agent-comparison" as const;

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

// =============================================================================
// Locked-axis configuration
// =============================================================================

export const setLockedAgent = createAsyncThunk<
  void,
  { agentId: string },
  ThunkApi
>(
  "agentComparisonRequestMod/setLockedAgent",
  async ({ agentId }, { dispatch, getState }) => {
    const state = getState();
    const prev = state.agentComparisonRequestMod.locked;
    if (prev.agentId === agentId) return;

    await Promise.allSettled([
      dispatch(fetchFullAgent(agentId)).unwrap(),
      dispatch(
        fetchAgentVersionHistory({ agentId, limit: 100 }),
      ).unwrap(),
    ]);

    dispatch(
      setLocked({
        agentId,
        agentVersion: "current",
        agentVersionId: null,
      }),
    );

    // Recreate every column's instance under the new agent so the
    // SmartAgentInput in each column picks up the right variable
    // definitions and the executor routes to the right agent.
    const post = getState();
    for (const col of post.agentComparisonRequestMod.columns) {
      dispatch(destroyInstance(col.conversationId));
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId,
          conversationId,
          apiEndpointMode: "agent",
          sourceFeature: REQUEST_MOD_SOURCE_FEATURE,
        }),
      ).unwrap();
      dispatch(
        replaceRequestModColumn({
          columnId: col.columnId,
          next: { conversationId },
        }),
      );
    }
  },
);

export const setLockedVersion = createAsyncThunk<
  void,
  { version: "current" | number; versionId?: string },
  ThunkApi
>(
  "agentComparisonRequestMod/setLockedVersion",
  async ({ version, versionId }, { dispatch, getState }) => {
    const state = getState();
    const { agentId, agentVersion } = state.agentComparisonRequestMod.locked;
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
        agentVersionId: version === "current" ? null : versionId ?? null,
      }),
    );

    const pinnedVersionId =
      version === "current" ? null : versionId ?? null;
    const post = getState();
    for (const col of post.agentComparisonRequestMod.columns) {
      dispatch(destroyInstance(col.conversationId));
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId,
          conversationId,
          initialAgentVersionId: pinnedVersionId,
          apiEndpointMode: "agent",
          sourceFeature: REQUEST_MOD_SOURCE_FEATURE,
        }),
      ).unwrap();
      dispatch(
        replaceRequestModColumn({
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

export const addColumnToRequestModBattle = createAsyncThunk<
  string | null,
  { label?: string } | undefined,
  ThunkApi
>(
  "agentComparisonRequestMod/addColumn",
  async (arg, { dispatch, getState }) => {
    const state = getState();
    const { agentId, agentVersionId } = state.agentComparisonRequestMod.locked;
    if (!agentId) return null;

    const columnId = crypto.randomUUID();
    const conversationId = generateConversationId();
    const label =
      arg?.label ??
      `Request ${state.agentComparisonRequestMod.columns.length + 1}`;

    await dispatch(
      createManualInstance({
        agentId,
        conversationId,
        initialAgentVersionId: agentVersionId,
        apiEndpointMode: "agent",
        sourceFeature: REQUEST_MOD_SOURCE_FEATURE,
      }),
    ).unwrap();

    dispatch(addRequestModColumn({ columnId, conversationId, label }));
    return columnId;
  },
);

export const removeColumnFromRequestModBattle = createAsyncThunk<
  void,
  { columnId: string },
  ThunkApi
>(
  "agentComparisonRequestMod/removeColumn",
  async ({ columnId }, { dispatch, getState }) => {
    const state = getState();
    const col = state.agentComparisonRequestMod.columns.find(
      (c) => c.columnId === columnId,
    );
    if (col) {
      dispatch(destroyInstance(col.conversationId));
    }
    dispatch(removeRequestModColumn({ columnId }));
  },
);

// =============================================================================
// Submit All
// =============================================================================

export const submitAllRequestMod = createAsyncThunk<
  BattleSubmitResult,
  void,
  ThunkApi
>(
  "agentComparisonRequestMod/submitAll",
  async (_arg, { dispatch, getState }) => {
    dispatch(submitAllStarted());
    try {
      const state = getState();
      const { agentId } = state.agentComparisonRequestMod.locked;
      const columns = state.agentComparisonRequestMod.columns;

      if (!agentId || columns.length === 0) {
        return { launched: 0, failed: 0, skipped: columns.length };
      }

      // Each column sends its OWN request; an untouched column (no typed
      // message, no attachment, and an agent that needs a typed message —
      // see battleRequestEmpty.ts) has nothing for the provider to run and
      // is skipped rather than launched empty and rejected server-side.
      const runnableColumns = columns.filter(
        (col) => !isConversationRequestEmpty(state, col.conversationId),
      );
      if (runnableColumns.length === 0) {
        return { launched: 0, failed: 0, skipped: columns.length };
      }

      // One fan-out for every mode (battle-follow-up.ts): each column sends its
      // own composer, and a column that already ran needs typed text.
      return await runBattleFanOut({
        dispatch,
        getState,
        sourceConversationId: null,
        columns: runnableColumns,
        skipped: columns.length - runnableColumns.length,
        surfaceKey: REQUEST_MOD_SURFACE_KEY,
        persist: () => dispatch(persistRequestModBattle()).unwrap(),
        // Each column's composer empties the moment it sends. Keep what each
        // firing column is about to send, so the saved battle holds the
        // requests that actually ran — never the emptied composers.
        beforePersist: (firing) => {
          for (const col of runnableColumns) {
            if (!firing.includes(col.conversationId)) continue;
            dispatch(
              setRequestModColumnLastRequest({
                columnId: col.columnId,
                request: readLiveColumnRequest(state, col.conversationId),
              }),
            );
          }
        },
      });
    } finally {
      dispatch(submitAllFinished());
    }
  },
);

// =============================================================================
// Clear / reset
// =============================================================================

export const clearRequestModBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonRequestMod/clear",
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    for (const col of state.agentComparisonRequestMod.columns) {
      dispatch(destroyInstance(col.conversationId));
    }
    dispatch(resetRequestMod());
  },
);

export const resetAllRequestModConversations = createAsyncThunk<
  void,
  { preserveInputs?: boolean } | undefined,
  ThunkApi
>(
  "agentComparisonRequestMod/resetAllConversations",
  async (arg, { dispatch, getState }) => {
    const preserveInputs = arg?.preserveInputs ?? true;
    const state = getState();
    const { agentId, agentVersionId } = state.agentComparisonRequestMod.locked;
    if (!agentId) return;

    for (const col of state.agentComparisonRequestMod.columns) {
      const savedText = preserveInputs
        ? state.instanceUserInput.byConversationId[col.conversationId]?.text ??
          ""
        : "";
      const savedVars = preserveInputs
        ? state.instanceVariableValues.byConversationId[col.conversationId]
            ?.userValues ?? {}
        : {};

      dispatch(destroyInstance(col.conversationId));
      const conversationId = generateConversationId();
      await dispatch(
        createManualInstance({
          agentId,
          conversationId,
          initialAgentVersionId: agentVersionId,
          apiEndpointMode: "agent",
          sourceFeature: REQUEST_MOD_SOURCE_FEATURE,
        }),
      ).unwrap();
      if (savedText) {
        dispatch(setUserInputText({ conversationId, text: savedText }));
      }
      if (Object.keys(savedVars).length > 0) {
        dispatch(
          setUserVariableValues({ conversationId, values: savedVars }),
        );
      }
      dispatch(
        replaceRequestModColumn({
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

interface PersistedRequestModEntryMeta {
  label: string;
  user_message: string;
  variables: Record<string, unknown>;
  resolved_variables?: Record<string, unknown>;
  /** The complete request (absent on battles saved before it). */
  request?: unknown;
  omitted_attachments?: OmittedAttachment[];
}

function buildRequestModEntries(state: RootState): UpsertEntryInput[] {
  const out: UpsertEntryInput[] = [];
  const { agentId, agentVersion, agentVersionId } =
    state.agentComparisonRequestMod.locked;
  if (!agentId) return out;
  state.agentComparisonRequestMod.columns.forEach((col, idx) => {
    const request = columnRequestToSave(state, col);
    const meta: PersistedRequestModEntryMeta = {
      label: col.label,
      user_message: request.user_message,
      variables: request.variables,
      // What the column's run uses, defaults included — a record, not reloaded.
      resolved_variables: selectResolvedVariables(col.conversationId)(state),
      request: request.request ?? null,
      omitted_attachments: request.omitted_attachments ?? [],
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
    state.agentComparisonRequestMod.locked;
  return {
    mode: "request-mod",
    locked: {
      agent_id: agentId,
      agent_version: agentVersion,
      agent_version_id: agentVersionId,
    },
  };
}

export const saveRequestModBattleAs = createAsyncThunk<
  { id: string; name: string },
  { name: string },
  ThunkApi
>(
  "agentComparisonRequestMod/saveAs",
  async ({ name }, { dispatch, getState }) => {
    const state = getState();
    const userId = selectUserId(state);
    if (!userId) throw new Error("Not signed in");

    const set = await createComparisonSet({
      name,
      userId,
      metadata: buildSetMetadata(state),
    });
    const entries = buildRequestModEntries(state);
    if (entries.length > 0) {
      await replaceEntries(set.id, entries);
    }
    dispatch(setActiveRequestModSet({ id: set.id, name: set.name }));
    return { id: set.id, name: set.name };
  },
);

const requestModPersistence = createBattlePersistence({
  typePrefix: "agentComparisonRequestMod",
  modeLabel: "Request mod battle",
  selectActiveSetId: (state) => state.agentComparisonRequestMod.activeSetId,
  selectActiveSetName: (state) => state.agentComparisonRequestMod.activeSetName,
  selectNamingAgentId: (state) => state.agentComparisonRequestMod.locked.agentId,
  buildMetadata: buildSetMetadata,
  buildEntries: buildRequestModEntries,
  setActive: setActiveRequestModSet,
});

/** Create this battle on first call; afterwards keep its setup and columns current. */
export const persistRequestModBattle = requestModPersistence.persist;
export const renameRequestModBattle = requestModPersistence.rename;

interface LoadedLockedSpec {
  agent_id: string | null;
  agent_version: "current" | number | null;
  agent_version_id: string | null;
}

export const loadRequestModBattleSet = createAsyncThunk<
  void,
  { setId: string },
  ThunkApi
>(
  "agentComparisonRequestMod/loadSet",
  async ({ setId }, { dispatch, getState }) => {
    const before = getState();
    for (const col of before.agentComparisonRequestMod.columns) {
      dispatch(destroyInstance(col.conversationId));
    }
    dispatch(resetRequestMod());

    const { set, entries } = await loadComparisonSet(setId);
    const meta = (set.metadata ?? {}) as {
      mode?: string;
      locked?: LoadedLockedSpec;
    };
    if (meta.mode !== "request-mod") {
      throw new Error(
        `Comparison set "${set.name}" is not a request-mod-mode set (mode=${meta.mode ?? "?"})`,
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
    }

    const nextColumns: RequestModColumn[] = [];
    for (const entry of entries) {
      const columnId = crypto.randomUUID();
      try {
        await dispatch(
          createManualInstance({
            agentId: entry.agent_id,
            conversationId: entry.conversation_id,
            initialAgentVersionId: entry.agent_version_snapshot_id ?? null,
            apiEndpointMode: "agent",
            sourceFeature: REQUEST_MOD_SOURCE_FEATURE,
          }),
        ).unwrap();
      } catch {
        dispatch(
          createInstance({
            conversationId: entry.conversation_id,
            agentId: entry.agent_id,
            agentType: "user",
            origin: "manual",
            sourceFeature: REQUEST_MOD_SOURCE_FEATURE,
          }),
        );
      }

      const entryMeta = (entry.metadata ?? {}) as
        | Partial<PersistedRequestModEntryMeta>
        | undefined;
      const savedSnapshot = isRequestDraftSnapshot(entryMeta?.request)
        ? entryMeta.request
        : null;
      const savedRequest: RequestModColumnRequest | null =
        savedSnapshot ||
        entryMeta?.user_message ||
        (entryMeta?.variables && Object.keys(entryMeta.variables).length > 0)
          ? {
              user_message: entryMeta?.user_message ?? "",
              variables: entryMeta?.variables ?? {},
              request: savedSnapshot,
              omitted_attachments: entryMeta?.omitted_attachments ?? [],
            }
          : null;

      try {
        await dispatch(
          loadConversation({
            conversationId: entry.conversation_id,
            surfaceKey: REQUEST_MOD_SURFACE_KEY,
          }),
        ).unwrap();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[request-mod] loadConversation failed:", err);
      }
      // A saved run may still be answering on the server — rejoin it.
      followWhatIsStillInFlight(dispatch, entry.conversation_id);

      // A column that already ran shows its request in its history; putting
      // it back in the composer would send it a second time on Submit all.
      // Only a column that never ran gets its saved request back as a draft.
      const alreadyRan =
        selectMessageCount(entry.conversation_id)(getState()) > 0;
      if (savedSnapshot && !alreadyRan) {
        dispatch(
          applyRequestDraft({
            snapshot: savedSnapshot,
            conversationId: entry.conversation_id,
          }),
        );
      } else if (savedRequest && !alreadyRan) {
        if (savedRequest.user_message) {
          dispatch(
            setUserInputText({
              conversationId: entry.conversation_id,
              text: savedRequest.user_message,
            }),
          );
        }
        if (Object.keys(savedRequest.variables).length > 0) {
          dispatch(
            setUserVariableValues({
              conversationId: entry.conversation_id,
              values: savedRequest.variables,
            }),
          );
        }
      }

      nextColumns.push({
        columnId,
        conversationId: entry.conversation_id,
        label: entryMeta?.label ?? `Request ${nextColumns.length + 1}`,
        collapsed: false,
        lastRequest: savedRequest,
      });
    }

    dispatch(setRequestModColumns(nextColumns));
    dispatch(setActiveRequestModSet({ id: set.id, name: set.name }));
  },
);
