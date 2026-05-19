/**
 * Tools-mode selectors. All memoized via createSelector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { ToolsColumn, ToolsLockedSetup } from "../types";

const EMPTY_COLUMNS: ToolsColumn[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_LOCKED: ToolsLockedSetup = {
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
  state.agentComparisonTools ?? DEFAULT_ROOT;

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

export const selectToolsColumns = createSelector(
  [selectRoot],
  (r) => r.columns ?? EMPTY_COLUMNS,
);

export const selectToolsColumnIds = createSelector(
  [selectToolsColumns],
  (cols) => (cols.length === 0 ? EMPTY_IDS : cols.map((c) => c.columnId)),
);

export const selectToolsColumnById = (columnId: string) =>
  createSelector(
    [selectToolsColumns],
    (cols) => cols.find((c) => c.columnId === columnId) ?? null,
  );

export const selectActiveToolsSetId = createSelector(
  [selectRoot],
  (r) => r.activeSetId,
);

export const selectActiveToolsSetName = createSelector(
  [selectRoot],
  (r) => r.activeSetName,
);

export const selectIsSubmittingAllTools = createSelector(
  [selectRoot],
  (r) => r.isSubmittingAll,
);

export const selectCollapsedToolsColumnCount = createSelector(
  [selectToolsColumns],
  (cols) => cols.filter((c) => c.collapsed).length,
);

export const selectCanSubmitTools = createSelector(
  [selectLockedSetup, selectToolsColumns],
  (locked, cols) => {
    if (!locked.sourceAgentId) return false;
    if (cols.length === 0) return false;
    return true;
  },
);
