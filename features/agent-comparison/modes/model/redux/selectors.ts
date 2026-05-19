/**
 * Model-mode selectors. All memoized via createSelector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { ModelColumn, ModelLockedSetup } from "../types";

const EMPTY_COLUMNS: ModelColumn[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_LOCKED: ModelLockedSetup = {
  agentId: null,
  agentVersion: null,
  agentVersionId: null,
  variables: {},
  userMessage: "",
};

const DEFAULT_ROOT = {
  locked: EMPTY_LOCKED,
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

export const selectLockedUserMessage = createSelector(
  [selectLockedSetup],
  (l) => l.userMessage,
);

export const selectLockedVariables = createSelector(
  [selectLockedSetup],
  (l) => l.variables,
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

export const selectCanSubmitModel = createSelector(
  [selectLockedSetup, selectModelColumns],
  (locked, cols) => {
    if (!locked.agentId) return false;
    if (cols.length === 0) return false;
    return true;
  },
);
