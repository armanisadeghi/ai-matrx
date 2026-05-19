/**
 * Request-Modification-mode selectors. All memoized via createSelector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { RequestModColumn, RequestModLockedSetup } from "../types";

const EMPTY_COLUMNS: RequestModColumn[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_LOCKED: RequestModLockedSetup = {
  agentId: null,
  agentVersion: null,
  agentVersionId: null,
};

const DEFAULT_ROOT = {
  locked: EMPTY_LOCKED,
  columns: EMPTY_COLUMNS,
  activeSetId: null,
  activeSetName: null,
  isSubmittingAll: false,
} as const;

const selectRoot = (state: RootState) =>
  state.agentComparisonRequestMod ?? DEFAULT_ROOT;

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

export const selectRequestModColumns = createSelector(
  [selectRoot],
  (r) => r.columns ?? EMPTY_COLUMNS,
);

export const selectRequestModColumnIds = createSelector(
  [selectRequestModColumns],
  (cols) => (cols.length === 0 ? EMPTY_IDS : cols.map((c) => c.columnId)),
);

export const selectRequestModColumnById = (columnId: string) =>
  createSelector(
    [selectRequestModColumns],
    (cols) => cols.find((c) => c.columnId === columnId) ?? null,
  );

export const selectActiveRequestModSetId = createSelector(
  [selectRoot],
  (r) => r.activeSetId,
);

export const selectActiveRequestModSetName = createSelector(
  [selectRoot],
  (r) => r.activeSetName,
);

export const selectIsSubmittingAllRequestMod = createSelector(
  [selectRoot],
  (r) => r.isSubmittingAll,
);

export const selectCollapsedRequestModColumnCount = createSelector(
  [selectRequestModColumns],
  (cols) => cols.filter((c) => c.collapsed).length,
);

export const selectCanSubmitRequestMod = createSelector(
  [selectLockedSetup, selectRequestModColumns],
  (locked, cols) => {
    if (!locked.agentId) return false;
    if (cols.length === 0) return false;
    return true;
  },
);
