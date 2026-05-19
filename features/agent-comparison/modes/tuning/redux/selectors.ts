/**
 * Tuning-mode selectors. All memoized via createSelector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  TuningColumn,
  TuningLockedSetup,
} from "../types";

const EMPTY_COLUMNS: TuningColumn[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_LOCKED: TuningLockedSetup = {
  sourceAgentId: null,
  agentVersion: null,
  agentVersionId: null,
  variables: {},
  userMessage: "",
};

const selectRoot = (state: RootState) =>
  state.agentComparisonTuning ?? {
    locked: EMPTY_LOCKED,
    columns: EMPTY_COLUMNS,
    activeSetId: null,
    activeSetName: null,
    isSubmittingAll: false,
  };

export const selectLockedSetup = createSelector(
  [selectRoot],
  (r) => r.locked ?? EMPTY_LOCKED,
);

export const selectSourceAgentId = createSelector(
  [selectLockedSetup],
  (l) => l.sourceAgentId,
);

export const selectLockedAgentVersion = createSelector(
  [selectLockedSetup],
  (l) => l.agentVersion,
);

export const selectLockedUserMessage = createSelector(
  [selectLockedSetup],
  (l) => l.userMessage,
);

export const selectLockedVariables = createSelector(
  [selectLockedSetup],
  (l) => l.variables,
);

export const selectTuningColumns = createSelector(
  [selectRoot],
  (r) => r.columns ?? EMPTY_COLUMNS,
);

export const selectTuningColumnIds = createSelector(
  [selectTuningColumns],
  (cols) => (cols.length === 0 ? EMPTY_IDS : cols.map((c) => c.columnId)),
);

export const selectTuningColumnById = (columnId: string) =>
  createSelector(
    [selectTuningColumns],
    (cols) => cols.find((c) => c.columnId === columnId) ?? null,
  );

export const selectActiveTuningSetId = createSelector(
  [selectRoot],
  (r) => r.activeSetId,
);

export const selectActiveTuningSetName = createSelector(
  [selectRoot],
  (r) => r.activeSetName,
);

export const selectIsSubmittingAllTuning = createSelector(
  [selectRoot],
  (r) => r.isSubmittingAll,
);

export const selectCollapsedTuningColumnCount = createSelector(
  [selectTuningColumns],
  (cols) => cols.filter((c) => c.collapsed).length,
);

export const selectCanSubmitTuning = createSelector(
  [selectLockedSetup, selectTuningColumns],
  (locked, cols) => {
    if (!locked.sourceAgentId) return false;
    if (cols.length === 0) return false;
    return true;
  },
);
