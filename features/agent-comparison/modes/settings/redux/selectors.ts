/**
 * Settings-mode selectors. All memoized via createSelector.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { SettingsColumn, SettingsLockedSetup } from "../types";

const EMPTY_COLUMNS: SettingsColumn[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_LOCKED: SettingsLockedSetup = {
  agentId: null,
  agentVersion: null,
  agentVersionId: null,
  variables: {},
  userMessage: "",
};

const selectRoot = (state: RootState) =>
  state.agentComparisonSettings ?? {
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

export const selectSettingsColumns = createSelector(
  [selectRoot],
  (r) => r.columns ?? EMPTY_COLUMNS,
);

export const selectSettingsColumnIds = createSelector(
  [selectSettingsColumns],
  (cols) => (cols.length === 0 ? EMPTY_IDS : cols.map((c) => c.columnId)),
);

export const selectSettingsColumnById = (columnId: string) =>
  createSelector(
    [selectSettingsColumns],
    (cols) => cols.find((c) => c.columnId === columnId) ?? null,
  );

export const selectActiveSettingsSetId = createSelector(
  [selectRoot],
  (r) => r.activeSetId,
);

export const selectActiveSettingsSetName = createSelector(
  [selectRoot],
  (r) => r.activeSetName,
);

export const selectIsSubmittingAllSettings = createSelector(
  [selectRoot],
  (r) => r.isSubmittingAll,
);

export const selectCollapsedSettingsColumnCount = createSelector(
  [selectSettingsColumns],
  (cols) => cols.filter((c) => c.collapsed).length,
);

/**
 * Whether the Submit-all button should be enabled. We keep this
 * permissive (agent + at least one variant) — the toolbar's submit
 * handler runs a stricter preflight on click so the user always gets a
 * specific "what's missing" toast instead of a silently-disabled button.
 */
export const selectCanSubmitSettings = createSelector(
  [selectLockedSetup, selectSettingsColumns],
  (locked, cols) => {
    if (!locked.agentId) return false;
    if (cols.length === 0) return false;
    return true;
  },
);
