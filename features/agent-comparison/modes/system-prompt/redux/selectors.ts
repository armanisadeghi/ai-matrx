/**
 * System-Prompt-mode selectors. All memoized via createSelector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  SystemPromptColumn,
  SystemPromptLockedSetup,
} from "../types";

const EMPTY_COLUMNS: SystemPromptColumn[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_LOCKED: SystemPromptLockedSetup = {
  sourceAgentId: null,
  agentVersion: null,
  agentVersionId: null,
  variables: {},
  userMessage: "",
};

const selectRoot = (state: RootState) =>
  state.agentComparisonSystemPrompt ?? {
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

export const selectCanSubmitSystemPrompt = createSelector(
  [selectLockedSetup, selectSystemPromptColumns],
  (locked, cols) => {
    if (!locked.sourceAgentId) return false;
    if (cols.length === 0) return false;
    return true;
  },
);
