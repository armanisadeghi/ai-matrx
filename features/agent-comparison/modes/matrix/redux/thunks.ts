/**
 * Matrix-mode thunks.
 *
 * 🚨 A matrix save writes ONLY the set row (its `metadata`). It never calls
 * `replaceEntries`: the entries are the server's cells, and replacing them
 * would archive every result.
 */

import { selectAgentById } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { softDeleteConversation } from "@ai-matrx/chat/agents/redux/execution-system/message-crud/soft-delete-conversation.thunk";
import {
  createComparisonSet,
  deleteComparisonSet,
  loadComparisonSet,
  renameComparisonSet,
  updateComparisonSetMetadata,
} from "../../../service/comparisonSetsService";
import { autoBattleName } from "../../../shared/battlePersistence";
import {
  allCellConversationIds,
  entryToCell,
  metadataToSetup,
  setupProblems,
  setupToMetadata,
} from "../model";
import {
  archiveMatrixEntries,
  cancelMatrixRun,
  listMatrixEntries,
  runMatrixCells,
  type MatrixRunBody,
} from "../service";
import {
  loadMatrix,
  markSaved,
  resetMatrix,
  setActiveMatrixSet,
  setCells,
  setReadError,
  setRunError,
  setRunInFlight,
} from "./slice";

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

export interface SavedMatrix {
  id: string;
  name: string;
  created: boolean;
}

function baseAgentName(state: RootState): string | null {
  const agentId = state.agentComparisonMatrix.setup.base.agent_id;
  return agentId ? (selectAgentById(state, agentId)?.name ?? null) : null;
}

/** Create the battle on first save; afterwards rewrite only its setup. */
export const saveMatrixBattle = createAsyncThunk<SavedMatrix, void, ThunkApi>(
  "agentComparisonMatrix/save",
  async (_arg, { dispatch, getState }) => {
    const state = getState();
    const userId = selectUserId(state);
    if (!userId) throw new Error("Sign in to save this battle.");
    const { setup, activeSetId, activeSetName } = state.agentComparisonMatrix;
    const metadata = setupToMetadata(setup);
    if (activeSetId) {
      await updateComparisonSetMetadata(activeSetId, metadata);
      dispatch(markSaved());
      return { id: activeSetId, name: activeSetName ?? "Matrix battle", created: false };
    }
    const organizationId = await ensureOrgId(null);
    const set = await createComparisonSet({
      name: autoBattleName("Matrix battle", baseAgentName(state)),
      userId,
      organizationId,
      metadata,
    });
    dispatch(setActiveMatrixSet({ id: set.id, name: set.name }));
    dispatch(markSaved());
    return { id: set.id, name: set.name, created: true };
  },
);

export const saveMatrixBattleAs = createAsyncThunk<SavedMatrix, { name: string }, ThunkApi>(
  "agentComparisonMatrix/saveAs",
  async ({ name }, { dispatch, getState }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("A battle needs a name.");
    const state = getState();
    const userId = selectUserId(state);
    if (!userId) throw new Error("Sign in to save this battle.");
    const organizationId = await ensureOrgId(null);
    const set = await createComparisonSet({
      name: trimmed,
      userId,
      organizationId,
      metadata: setupToMetadata(state.agentComparisonMatrix.setup),
    });
    // The copy is a new battle: same setup, no cells yet.
    dispatch(setActiveMatrixSet({ id: set.id, name: set.name }));
    dispatch(setCells([]));
    dispatch(markSaved());
    return { id: set.id, name: set.name, created: true };
  },
);

export const renameMatrixBattle = createAsyncThunk<void, { name: string }, ThunkApi>(
  "agentComparisonMatrix/rename",
  async ({ name }, { dispatch, getState }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("A battle needs a name.");
    const setId = getState().agentComparisonMatrix.activeSetId;
    if (!setId) throw new Error("This battle has not been saved yet.");
    await renameComparisonSet(setId, trimmed);
    dispatch(setActiveMatrixSet({ id: setId, name: trimmed }));
  },
);

export const loadMatrixBattleSet = createAsyncThunk<void, { setId: string }, ThunkApi>(
  "agentComparisonMatrix/load",
  async ({ setId }, { dispatch }) => {
    const { set, entries } = await loadComparisonSet(setId);
    const setup = metadataToSetup(set.metadata);
    const now = Date.now();
    const cells = entries.map((e) => entryToCell(e, now)).filter((c) => c !== null);
    dispatch(loadMatrix({ id: set.id, name: set.name, setup, cells }));
  },
);

/** Re-read every cell from the database. */
export const refreshMatrixCells = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonMatrix/refreshCells",
  async (_arg, { dispatch, getState }) => {
    const setId = getState().agentComparisonMatrix.activeSetId;
    if (!setId) return;
    try {
      const rows = await listMatrixEntries(setId);
      if (getState().agentComparisonMatrix.activeSetId !== setId) return;
      const now = Date.now();
      dispatch(setCells(rows.map((e) => entryToCell(e, now)).filter((c) => c !== null)));
    } catch (err) {
      dispatch(setReadError(err instanceof Error ? err.message : String(err)));
    }
  },
);

/**
 * Run cells on the server. Saves first (the server reads the setup from the
 * set row), then calls the run endpoint in the active organization. Resolves
 * when the server's stream ends; throws the server's error.
 */
export const runMatrixBattle = createAsyncThunk<void, MatrixRunBody, ThunkApi>(
  "agentComparisonMatrix/run",
  async (body, { dispatch, getState }) => {
    const problems = setupProblems(getState().agentComparisonMatrix.setup);
    if (problems.length > 0) throw new Error(problems.join(" "));
    const saved = await dispatch(saveMatrixBattle()).unwrap();
    const organizationId = await ensureOrgId(null);
    dispatch(setRunError(null));
    dispatch(setRunInFlight(true));
    try {
      const outcome = await runMatrixCells(dispatch, saved.id, organizationId, body);
      const message = outcome.error ?? (outcome.streamErrors.join(" · ") || null);
      // The page's alert bar shows it, in the server's words.
      dispatch(setRunError(message ? `Run failed: ${message}` : null));
    } finally {
      dispatch(setRunInFlight(false));
      void dispatch(refreshMatrixCells());
    }
  },
);

export const cancelMatrixBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonMatrix/cancel",
  async (_arg, { dispatch, getState }) => {
    const setId = getState().agentComparisonMatrix.activeSetId;
    if (!setId) throw new Error("This battle has not been saved yet.");
    const organizationId = await ensureOrgId(null);
    const outcome = await cancelMatrixRun(dispatch, setId, organizationId);
    void dispatch(refreshMatrixCells());
    if (outcome.error) dispatch(setRunError(`Cancel failed: ${outcome.error}`));
  },
);

/**
 * Archive the battle: every cell conversation, every cell row, then the set.
 * Reports conversations it could not archive by count instead of hiding them.
 */
export const archiveMatrixBattle = createAsyncThunk<
  { archivedConversations: number; failedConversations: number },
  void,
  ThunkApi
>("agentComparisonMatrix/archive", async (_arg, { dispatch, getState }) => {
  const setId = getState().agentComparisonMatrix.activeSetId;
  if (!setId) throw new Error("This battle has not been saved yet.");
  const rows = await listMatrixEntries(setId);
  // Every attempt's conversation, not only the current one (contract `history`).
  const conversationIds = allCellConversationIds(rows);
  const results = await Promise.allSettled(
    conversationIds.map((conversationId) =>
      dispatch(softDeleteConversation({ conversationId })).unwrap(),
    ),
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  await archiveMatrixEntries(setId);
  await deleteComparisonSet(setId);
  dispatch(resetMatrix());
  return { archivedConversations: conversationIds.length - failed, failedConversations: failed };
});

export const clearMatrixBattle = createAsyncThunk<void, void, ThunkApi>(
  "agentComparisonMatrix/clear",
  async (_arg, { dispatch }) => {
    dispatch(resetMatrix());
  },
);
