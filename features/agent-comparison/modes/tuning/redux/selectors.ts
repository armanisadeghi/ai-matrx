/**
 * Tuning-mode selectors. All memoized via createSelector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { isConversationRequestEmpty } from "@/features/agent-comparison/shared/battleRequestEmpty";
import type { TuningColumn, TuningLockedSetup } from "../types";

const EMPTY_COLUMNS: TuningColumn[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_LOCKED: TuningLockedSetup = {
  sourceAgentId: null,
  agentVersion: null,
  agentVersionId: null,
};

const DEFAULT_ROOT = {
  locked: EMPTY_LOCKED,
  inputConversationId: null,
  columns: EMPTY_COLUMNS,
  activeSetId: null,
  activeSetName: null,
  isSubmittingAll: false,
} as const;

const selectRoot = (state: RootState) =>
  state.agentComparisonTuning ?? DEFAULT_ROOT;

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

export const selectTuningInputConversationId = createSelector(
  [selectRoot],
  (r) => r.inputConversationId,
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

// Not memoized via createSelector: isConversationRequestEmpty reads across
// several other slices (user-input, resources, variable-values), so it needs
// full state, not a derived slice — see battleRequestEmpty.ts.
export const selectCanSubmitTuning = (state: RootState): boolean => {
  const locked = selectLockedSetup(state);
  const cols = selectTuningColumns(state);
  if (!locked.sourceAgentId) return false;
  if (cols.length === 0) return false;
  const inputConversationId = selectTuningInputConversationId(state);
  if (isConversationRequestEmpty(state, inputConversationId)) return false;
  return true;
};
