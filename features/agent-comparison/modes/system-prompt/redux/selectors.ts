/**
 * System-Prompt-mode selectors. All memoized via createSelector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { isConversationRequestEmpty } from "@/features/agent-comparison/shared/battleRequestEmpty";
import type { SystemPromptColumn, SystemPromptLockedSetup } from "../types";

const EMPTY_COLUMNS: SystemPromptColumn[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_LOCKED: SystemPromptLockedSetup = {
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
  state.agentComparisonSystemPrompt ?? DEFAULT_ROOT;

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

export const selectSystemPromptInputConversationId = createSelector(
  [selectRoot],
  (r) => r.inputConversationId,
);

export const selectSystemPromptColumns = createSelector(
  [selectRoot],
  (r) => r.columns ?? EMPTY_COLUMNS,
);

export const selectSystemPromptColumnIds = createSelector(
  [selectSystemPromptColumns],
  (cols) => (cols.length === 0 ? EMPTY_IDS : cols.map((c) => c.columnId)),
);

export const selectSystemPromptColumnById = (columnId: string) =>
  createSelector(
    [selectSystemPromptColumns],
    (cols) => cols.find((c) => c.columnId === columnId) ?? null,
  );

export const selectActiveSystemPromptSetId = createSelector(
  [selectRoot],
  (r) => r.activeSetId,
);

export const selectActiveSystemPromptSetName = createSelector(
  [selectRoot],
  (r) => r.activeSetName,
);

export const selectIsSubmittingAllSystemPrompt = createSelector(
  [selectRoot],
  (r) => r.isSubmittingAll,
);

export const selectCollapsedSystemPromptColumnCount = createSelector(
  [selectSystemPromptColumns],
  (cols) => cols.filter((c) => c.collapsed).length,
);

// Not memoized via createSelector: isConversationRequestEmpty reads across
// several other slices (user-input, resources, variable-values), so it needs
// full state, not a derived slice — see battleRequestEmpty.ts.
export const selectCanSubmitSystemPrompt = (state: RootState): boolean => {
  const locked = selectLockedSetup(state);
  const cols = selectSystemPromptColumns(state);
  if (!locked.sourceAgentId) return false;
  if (cols.length === 0) return false;
  const inputConversationId = selectSystemPromptInputConversationId(state);
  if (isConversationRequestEmpty(state, inputConversationId)) return false;
  return true;
};
