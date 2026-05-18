/**
 * Agent Battle Slice
 *
 * Thin per-column state for the /agents/battle page. Heavy lifting (variable
 * values, context entries, streaming) lives in the existing execution-system
 * slices keyed by conversationId — we only hold the column layout + the
 * link to a persisted comparison set.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  BattleAgentVersion,
  BattleColumn,
  BattleState,
} from "../types";

const initialState: BattleState = {
  columns: [],
  activeSetId: null,
  activeSetName: null,
  isSubmittingAll: false,
};

const battleSlice = createSlice({
  name: "agentBattle",
  initialState,
  reducers: {
    addColumn(
      state,
      action: PayloadAction<{ columnId: string; conversationId: string }>,
    ) {
      state.columns.push({
        columnId: action.payload.columnId,
        conversationId: action.payload.conversationId,
        agentId: null,
        agentVersion: null,
        collapsed: false,
      });
    },

    removeColumn(state, action: PayloadAction<{ columnId: string }>) {
      state.columns = state.columns.filter(
        (c) => c.columnId !== action.payload.columnId,
      );
    },

    /**
     * Replace a column wholesale (e.g. after we mint a fresh conversationId
     * because the user changed the agent). Identified by columnId.
     */
    replaceColumn(
      state,
      action: PayloadAction<{ columnId: string; next: Partial<BattleColumn> }>,
    ) {
      const idx = state.columns.findIndex(
        (c) => c.columnId === action.payload.columnId,
      );
      if (idx === -1) return;
      state.columns[idx] = {
        ...state.columns[idx],
        ...action.payload.next,
      };
    },

    setColumnAgentVersion(
      state,
      action: PayloadAction<{
        columnId: string;
        agentVersion: BattleAgentVersion | null;
      }>,
    ) {
      const col = state.columns.find(
        (c) => c.columnId === action.payload.columnId,
      );
      if (col) col.agentVersion = action.payload.agentVersion;
    },

    setColumnCollapsed(
      state,
      action: PayloadAction<{ columnId: string; collapsed: boolean }>,
    ) {
      const col = state.columns.find(
        (c) => c.columnId === action.payload.columnId,
      );
      if (col) col.collapsed = action.payload.collapsed;
    },

    reorderColumns(
      state,
      action: PayloadAction<{ fromIndex: number; toIndex: number }>,
    ) {
      const { fromIndex, toIndex } = action.payload;
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.columns.length ||
        toIndex >= state.columns.length ||
        fromIndex === toIndex
      ) {
        return;
      }
      const [moved] = state.columns.splice(fromIndex, 1);
      state.columns.splice(toIndex, 0, moved);
    },

    /** Replace all columns at once. Used by Load Set. */
    setColumns(state, action: PayloadAction<BattleColumn[]>) {
      state.columns = action.payload;
    },

    resetBattle(state) {
      state.columns = [];
      state.activeSetId = null;
      state.activeSetName = null;
      state.isSubmittingAll = false;
    },

    // ── Submit-all guard ─────────────────────────────────────────
    submitAllStarted(state) {
      state.isSubmittingAll = true;
    },
    submitAllFinished(state) {
      state.isSubmittingAll = false;
    },

    // ── Persisted set linkage ────────────────────────────────────
    setActiveSet(
      state,
      action: PayloadAction<{ id: string; name: string } | null>,
    ) {
      state.activeSetId = action.payload?.id ?? null;
      state.activeSetName = action.payload?.name ?? null;
    },
  },
});

export const {
  addColumn,
  removeColumn,
  replaceColumn,
  setColumnAgentVersion,
  setColumnCollapsed,
  reorderColumns,
  setColumns,
  resetBattle,
  submitAllStarted,
  submitAllFinished,
  setActiveSet,
} = battleSlice.actions;

export default battleSlice.reducer;
