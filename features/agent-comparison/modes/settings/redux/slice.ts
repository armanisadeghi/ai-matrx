/**
 * Settings-mode slice.
 *
 * Page-local state: the locked-axis setup + the per-column metadata.
 * Per-column LLM overrides live in the existing `instanceModelOverrides`
 * slice keyed by conversationId — same source of truth the executor
 * already reads. The slice below only tracks the COLUMN list.
 *
 * Feedback state (ranks, snapshots, comparison set id) is read from the
 * shared `agentComparison` slice. That cross-mode reuse is intentional —
 * a comparison set is a comparison set regardless of which mode produced
 * it.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  SettingsBattleState,
  SettingsColumn,
  SettingsLockedSetup,
} from "../types";

const initialState: SettingsBattleState = {
  locked: {
    agentId: null,
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

const settingsSlice = createSlice({
  name: "agentComparisonSettings",
  initialState,
  reducers: {
    // ── Columns ────────────────────────────────────────────────
    addSettingsColumn(
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
    removeSettingsColumn(
      state,
      action: PayloadAction<{ columnId: string }>,
    ) {
      state.columns = state.columns.filter(
        (c) => c.columnId !== action.payload.columnId,
      );
    },
    replaceSettingsColumn(
      state,
      action: PayloadAction<{
        columnId: string;
        next: Partial<SettingsColumn>;
      }>,
    ) {
      const idx = state.columns.findIndex(
        (c) => c.columnId === action.payload.columnId,
      );
      if (idx === -1) return;
      state.columns[idx] = { ...state.columns[idx], ...action.payload.next };
    },
    setSettingsColumns(state, action: PayloadAction<SettingsColumn[]>) {
      state.columns = action.payload;
    },
    renameSettingsColumn(
      state,
      action: PayloadAction<{ columnId: string; label: string }>,
    ) {
      const col = state.columns.find(
        (c) => c.columnId === action.payload.columnId,
      );
      if (col) col.label = action.payload.label;
    },
    setSettingsColumnCollapsed(
      state,
      action: PayloadAction<{ columnId: string; collapsed: boolean }>,
    ) {
      const col = state.columns.find(
        (c) => c.columnId === action.payload.columnId,
      );
      if (col) col.collapsed = action.payload.collapsed;
    },
    reorderSettingsColumns(
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

    // ── Locked-axis setup ──────────────────────────────────────
    setLocked(
      state,
      action: PayloadAction<Partial<SettingsLockedSetup>>,
    ) {
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

    // ── Submit guard ───────────────────────────────────────────
    submitAllStarted(state) {
      state.isSubmittingAll = true;
    },
    submitAllFinished(state) {
      state.isSubmittingAll = false;
    },

    // ── Set persistence linkage ────────────────────────────────
    setActiveSettingsSet(
      state,
      action: PayloadAction<{ id: string; name: string } | null>,
    ) {
      state.activeSetId = action.payload?.id ?? null;
      state.activeSetName = action.payload?.name ?? null;
    },

    // ── Page-level reset ───────────────────────────────────────
    resetSettings(state) {
      state.locked = {
        agentId: null,
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
  addSettingsColumn,
  removeSettingsColumn,
  replaceSettingsColumn,
  setSettingsColumns,
  renameSettingsColumn,
  setSettingsColumnCollapsed,
  reorderSettingsColumns,
  setLocked,
  setLockedVariable,
  setLockedUserMessage,
  submitAllStarted,
  submitAllFinished,
  setActiveSettingsSet,
  resetSettings,
} = settingsSlice.actions;

export default settingsSlice.reducer;
