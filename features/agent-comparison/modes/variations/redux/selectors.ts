/**
 * Variations-mode selectors. All memoized via createSelector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { VariationColumn, VariationsLockedSetup } from "../types";

const EMPTY_COLUMNS: VariationColumn[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_LOCKED: VariationsLockedSetup = {
  sourceAgentId: null,
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
  state.agentComparisonVariations ?? DEFAULT_ROOT;

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

export const selectVariationColumns = createSelector(
  [selectRoot],
  (r) => r.columns ?? EMPTY_COLUMNS,
);

export const selectVariationColumnIds = createSelector(
  [selectVariationColumns],
  (cols) => (cols.length === 0 ? EMPTY_IDS : cols.map((c) => c.columnId)),
);

export const selectVariationColumnById = (columnId: string) =>
  createSelector(
    [selectVariationColumns],
    (cols) => cols.find((c) => c.columnId === columnId) ?? null,
  );

export const selectActiveVariationsSetId = createSelector(
  [selectRoot],
  (r) => r.activeSetId,
);

export const selectActiveVariationsSetName = createSelector(
  [selectRoot],
  (r) => r.activeSetName,
);

export const selectIsSubmittingAllVariations = createSelector(
  [selectRoot],
  (r) => r.isSubmittingAll,
);

export const selectCollapsedVariationColumnCount = createSelector(
  [selectVariationColumns],
  (cols) => cols.filter((c) => c.collapsed).length,
);

export const selectCanSubmitVariations = createSelector(
  [selectLockedSetup, selectVariationColumns],
  (locked, cols) => {
    if (!locked.sourceAgentId) return false;
    if (cols.length === 0) return false;
    return true;
  },
);
