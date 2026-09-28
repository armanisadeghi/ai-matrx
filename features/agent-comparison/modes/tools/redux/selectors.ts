/**
 * Tools-mode selectors. All memoized via createSelector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { isConversationRequestEmpty } from "@/features/agent-comparison/shared/battleRequestEmpty";
import type { ToolsColumn, ToolsLockedSetup } from "../types";

const EMPTY_COLUMNS: ToolsColumn[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_LOCKED: ToolsLockedSetup = {
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

export const selectToolsInputConversationId = createSelector(
  [selectRoot],
  (r) => r.inputConversationId,
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

// Not memoized via createSelector: isConversationRequestEmpty reads across
// several other slices (user-input, resources, variable-values), so it needs
// full state, not a derived slice — see battleRequestEmpty.ts.
export const selectCanSubmitTools = (state: RootState): boolean => {
  const locked = selectLockedSetup(state);
  const cols = selectToolsColumns(state);
  if (!locked.sourceAgentId) return false;
  if (cols.length === 0) return false;
  const inputConversationId = selectToolsInputConversationId(state);
  if (isConversationRequestEmpty(state, inputConversationId)) return false;
  return true;
};
