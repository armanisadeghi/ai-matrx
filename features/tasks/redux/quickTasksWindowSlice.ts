"use client";

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface QuickTasksWindowState {
  selectedOrgId: string | null;
  selectedTaskId: string | null;
  searchQuery: string;
}

const initialState: QuickTasksWindowState = {
  selectedOrgId: null,
  selectedTaskId: null,
  searchQuery: "",
};

const slice = createSlice({
  name: "quickTasksWindow",
  initialState,
  reducers: {
    setQuickTasksSelectedOrgId(state, action: PayloadAction<string | null>) {
      state.selectedOrgId = action.payload;
    },
    setQuickTasksSelectedTaskId(state, action: PayloadAction<string | null>) {
      state.selectedTaskId = action.payload;
    },
    setQuickTasksSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    resetQuickTasksWindow() {
      return initialState;
    },
  },
});

export const {
  setQuickTasksSelectedOrgId,
  setQuickTasksSelectedTaskId,
  setQuickTasksSearchQuery,
  resetQuickTasksWindow,
} = slice.actions;

export default slice.reducer;

type StateWithQuick = { quickTasksWindow: QuickTasksWindowState };

export const selectQuickTasksSelectedOrgId = (s: StateWithQuick) =>
  s.quickTasksWindow.selectedOrgId;
export const selectQuickTasksSelectedTaskId = (s: StateWithQuick) =>
  s.quickTasksWindow.selectedTaskId;
export const selectQuickTasksSearchQuery = (s: StateWithQuick) =>
  s.quickTasksWindow.searchQuery;
