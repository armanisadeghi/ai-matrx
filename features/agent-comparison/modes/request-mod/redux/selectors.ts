/**
 * Request-Modification-mode selectors. All memoized via createSelector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { isConversationRequestEmpty } from "@/features/agent-comparison/shared/battleRequestEmpty";
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

// Not memoized via createSelector: isConversationRequestEmpty reads across
// several other slices (user-input, resources, variable-values), so it needs
// full state, not a derived slice — see battleRequestEmpty.ts. Each column
// here carries its own request (per-column composer, not a shared draft), so
// the check is "at least one column has something to send", not "every one
// does" — a run that skips an untouched column is the correct behavior for
// this mode (mirrors selectSubmittableBattleColumns in Open mode).
export const selectCanSubmitRequestMod = (state: RootState): boolean => {
  const locked = selectLockedSetup(state);
  const cols = selectRequestModColumns(state);
  if (!locked.agentId) return false;
  if (cols.length === 0) return false;
  return cols.some((c) => !isConversationRequestEmpty(state, c.conversationId));
};
