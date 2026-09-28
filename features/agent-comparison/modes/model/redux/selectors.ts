/**
 * Model-mode selectors. All memoized via createSelector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { isConversationRequestEmpty } from "@/features/agent-comparison/shared/battleRequestEmpty";
import type { ModelColumn, ModelLockedSetup } from "../types";

const EMPTY_COLUMNS: ModelColumn[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_LOCKED: ModelLockedSetup = {
  agentId: null,
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
  state.agentComparisonModel ?? DEFAULT_ROOT;

export const selectLockedSetup = createSelector(
  [selectRoot],
  (r) => r.locked ?? EMPTY_LOCKED,
);

export const selectLockedAgentId = createSelector(
  [selectLockedSetup],
  (l) => l.agentId,
);

export const selectLockedAgentVersion = createSelector(
  [selectLockedSetup],
  (l) => l.agentVersion,
);

export const selectModelInputConversationId = createSelector(
  [selectRoot],
  (r) => r.inputConversationId,
);

export const selectModelColumns = createSelector(
  [selectRoot],
  (r) => r.columns ?? EMPTY_COLUMNS,
);

export const selectModelColumnIds = createSelector(
  [selectModelColumns],
  (cols) => (cols.length === 0 ? EMPTY_IDS : cols.map((c) => c.columnId)),
);

export const selectModelColumnById = (columnId: string) =>
  createSelector(
    [selectModelColumns],
    (cols) => cols.find((c) => c.columnId === columnId) ?? null,
  );

export const selectActiveModelSetId = createSelector(
  [selectRoot],
  (r) => r.activeSetId,
);

export const selectActiveModelSetName = createSelector(
  [selectRoot],
  (r) => r.activeSetName,
);

export const selectIsSubmittingAllModel = createSelector(
  [selectRoot],
  (r) => r.isSubmittingAll,
);

export const selectCollapsedModelColumnCount = createSelector(
  [selectModelColumns],
  (cols) => cols.filter((c) => c.collapsed).length,
);

// Not memoized via createSelector: isConversationRequestEmpty reads across
// several other slices (user-input, resources, variable-values), so it needs
// full state, not a derived slice — see battleRequestEmpty.ts.
export const selectCanSubmitModel = (state: RootState): boolean => {
  const locked = selectLockedSetup(state);
  const cols = selectModelColumns(state);
  if (!locked.agentId) return false;
  if (cols.length === 0) return false;
  const inputConversationId = selectModelInputConversationId(state);
  if (isConversationRequestEmpty(state, inputConversationId)) return false;
  return true;
};
