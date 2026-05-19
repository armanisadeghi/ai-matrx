import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  RequestModBattleState,
  RequestModColumn,
  RequestModLockedSetup,
} from "../types";

const initialState: RequestModBattleState = {
  locked: {
    agentId: null,
    agentVersion: null,
    agentVersionId: null,
  },
  columns: [],
  activeSetId: null,
  activeSetName: null,
  isSubmittingAll: false,
};

const slice = createSlice({
  name: "agentComparisonRequestMod",
  initialState,
  reducers: {
    addRequestModColumn(
      state,
      action: PayloadAction<{
        columnId: string;
        conversationId: string;
        label: string;
      }>,
    ) {
      state.columns.push({
        columnId: action.payload.columnId,
        conversationId: action.payload.conversationId,
        label: action.payload.label,
        collapsed: false,
      });
    },
    removeRequestModColumn(
      state,
      action: PayloadAction<{ columnId: string }>,
    ) {
      state.columns = state.columns.filter(
        (c) => c.columnId !== action.payload.columnId,
      );
    },
    replaceRequestModColumn(
      state,
      action: PayloadAction<{
        columnId: string;
        next: Partial<RequestModColumn>;
      }>,
    ) {
      const idx = state.columns.findIndex(
        (c) => c.columnId === action.payload.columnId,
      );
      if (idx === -1) return;
      state.columns[idx] = { ...state.columns[idx], ...action.payload.next };
    },
    setRequestModColumns(state, action: PayloadAction<RequestModColumn[]>) {
      state.columns = action.payload;
    },
    renameRequestModColumn(
      state,
      action: PayloadAction<{ columnId: string; label: string }>,
    ) {
      const col = state.columns.find(
        (c) => c.columnId === action.payload.columnId,
      );
      if (col) col.label = action.payload.label;
    },
    setRequestModColumnCollapsed(
      state,
      action: PayloadAction<{ columnId: string; collapsed: boolean }>,
    ) {
      const col = state.columns.find(
        (c) => c.columnId === action.payload.columnId,
      );
      if (col) col.collapsed = action.payload.collapsed;
    },
    reorderRequestModColumns(
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

    setLocked(
      state,
      action: PayloadAction<Partial<RequestModLockedSetup>>,
    ) {
      state.locked = { ...state.locked, ...action.payload };
    },

    submitAllStarted(state) {
      state.isSubmittingAll = true;
    },
    submitAllFinished(state) {
      state.isSubmittingAll = false;
    },

    setActiveRequestModSet(
      state,
      action: PayloadAction<{ id: string; name: string } | null>,
    ) {
      state.activeSetId = action.payload?.id ?? null;
      state.activeSetName = action.payload?.name ?? null;
    },

    resetRequestMod(state) {
      state.locked = {
        agentId: null,
        agentVersion: null,
        agentVersionId: null,
      };
      state.columns = [];
      state.activeSetId = null;
      state.activeSetName = null;
      state.isSubmittingAll = false;
    },
  },
});

export const {
  addRequestModColumn,
  removeRequestModColumn,
  replaceRequestModColumn,
  setRequestModColumns,
  renameRequestModColumn,
  setRequestModColumnCollapsed,
  reorderRequestModColumns,
  setLocked,
  submitAllStarted,
  submitAllFinished,
  setActiveRequestModSet,
  resetRequestMod,
} = slice.actions;

export default slice.reducer;
