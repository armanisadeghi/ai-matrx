import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  VariationsBattleState,
  VariationColumn,
  VariationsLockedSetup,
} from "../types";

const initialState: VariationsBattleState = {
  locked: {
    sourceAgentId: null,
    agentVersion: null,
    agentVersionId: null,
    variables: {},
    userMessage: "",
  },
  columns: [],
  activeSetId: null,
  activeSetName: null,
  isSubmittingAll: false,
};

const slice = createSlice({
  name: "agentComparisonVariations",
  initialState,
  reducers: {
    addVariationColumn(
      state,
      action: PayloadAction<{
        columnId: string;
        conversationId: string;
        syntheticAgentId: string;
        label: string;
      }>,
    ) {
      state.columns.push({
        columnId: action.payload.columnId,
        conversationId: action.payload.conversationId,
        syntheticAgentId: action.payload.syntheticAgentId,
        label: action.payload.label,
        collapsed: false,
        paused: false,
      });
    },
    removeVariationColumn(state, action: PayloadAction<{ columnId: string }>) {
      state.columns = state.columns.filter(
        (c) => c.columnId !== action.payload.columnId,
      );
    },
    replaceVariationColumn(
      state,
      action: PayloadAction<{
        columnId: string;
        next: Partial<VariationColumn>;
      }>,
    ) {
      const idx = state.columns.findIndex(
        (c) => c.columnId === action.payload.columnId,
      );
      if (idx === -1) return;
      state.columns[idx] = { ...state.columns[idx], ...action.payload.next };
    },
    setVariationColumns(state, action: PayloadAction<VariationColumn[]>) {
      state.columns = action.payload;
    },
    renameVariationColumn(
      state,
      action: PayloadAction<{ columnId: string; label: string }>,
    ) {
      const col = state.columns.find(
        (c) => c.columnId === action.payload.columnId,
      );
      if (col) col.label = action.payload.label;
    },
    setVariationColumnCollapsed(
      state,
      action: PayloadAction<{ columnId: string; collapsed: boolean }>,
    ) {
      const col = state.columns.find(
        (c) => c.columnId === action.payload.columnId,
      );
      if (col) col.collapsed = action.payload.collapsed;
    },
    setVariationColumnPaused(
      state,
      action: PayloadAction<{ columnId: string; paused: boolean }>,
    ) {
      const col = state.columns.find(
        (c) => c.columnId === action.payload.columnId,
      );
      if (col) col.paused = action.payload.paused;
    },
    reorderVariationColumns(
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

    setLocked(state, action: PayloadAction<Partial<VariationsLockedSetup>>) {
      state.locked = { ...state.locked, ...action.payload };
    },
    setLockedVariable(
      state,
      action: PayloadAction<{ name: string; value: unknown }>,
    ) {
      state.locked.variables[action.payload.name] = action.payload.value;
    },
    setLockedUserMessage(state, action: PayloadAction<string>) {
      state.locked.userMessage = action.payload;
    },

    submitAllStarted(state) {
      state.isSubmittingAll = true;
    },
    submitAllFinished(state) {
      state.isSubmittingAll = false;
    },

    setActiveVariationsSet(
      state,
      action: PayloadAction<{ id: string; name: string } | null>,
    ) {
      state.activeSetId = action.payload?.id ?? null;
      state.activeSetName = action.payload?.name ?? null;
    },

    resetVariations(state) {
      state.locked = {
        sourceAgentId: null,
        agentVersion: null,
        agentVersionId: null,
        variables: {},
        userMessage: "",
      };
      state.columns = [];
      state.activeSetId = null;
      state.activeSetName = null;
      state.isSubmittingAll = false;
    },
  },
});

export const {
  addVariationColumn,
  removeVariationColumn,
  replaceVariationColumn,
  setVariationColumns,
  renameVariationColumn,
  setVariationColumnCollapsed,
  setVariationColumnPaused,
  reorderVariationColumns,
  setLocked,
  setLockedVariable,
  setLockedUserMessage,
  submitAllStarted,
  submitAllFinished,
  setActiveVariationsSet,
  resetVariations,
} = slice.actions;

export default slice.reducer;
