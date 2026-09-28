/**
 * Agent Battle — selectors
 *
 * One selector per discrete property. All memoized via createSelector
 * (per CLAUDE.md).
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { isConversationRequestEmpty } from "../shared/battleRequestEmpty";
import type { BattleColumn, BlindState, MasterField } from "../types";

const EMPTY_COLUMNS: BattleColumn[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_FIELDS: MasterField[] = [];
const DEFAULT_BLIND: BlindState = {
  enabled: false,
  active: false,
  revealed: false,
  order: [],
};

const DEFAULT_BATTLE_ROOT = {
  columns: EMPTY_COLUMNS,
  activeSetId: null,
  activeSetName: null,
  isSubmittingAll: false,
  masterFields: EMPTY_FIELDS,
} as const;

const selectBattleRoot = (state: RootState) =>
  state.agentComparison ?? DEFAULT_BATTLE_ROOT;

export const selectBattleColumns = createSelector(
  [selectBattleRoot],
  (root) => root.columns ?? EMPTY_COLUMNS,
);

export const selectBattleColumnIds = createSelector(
  [selectBattleColumns],
  (columns) =>
    columns.length === 0 ? EMPTY_IDS : columns.map((c) => c.columnId),
);

export const selectBattleColumnById = (columnId: string) =>
  createSelector(
    [selectBattleColumns],
    (columns) => columns.find((c) => c.columnId === columnId) ?? null,
  );

export const selectActiveBattleSetId = createSelector(
  [selectBattleRoot],
  (root) => root.activeSetId,
);

export const selectActiveBattleSetName = createSelector(
  [selectBattleRoot],
  (root) => root.activeSetName,
);

export const selectIsSubmittingAllBattle = createSelector(
  [selectBattleRoot],
  (root) => root.isSubmittingAll,
);

export const selectBattleConversationIds = createSelector(
  [selectBattleColumns],
  (columns) =>
    columns.length === 0 ? EMPTY_IDS : columns.map((c) => c.conversationId),
);

/** Columns that are ready to be submitted (agent picked). */
export const selectSubmittableBattleColumns = createSelector(
  [selectBattleColumns],
  (columns) => columns.filter((c) => c.agentId != null),
);

// Not memoized via createSelector: isConversationRequestEmpty reads across
// several other slices (user-input, resources, variable-values), so it needs
// full state, not a derived slice — see battleRequestEmpty.ts. A column with
// an agent but nothing typed has nothing for the provider to run — Submit
// all skips it rather than launching it empty (see submitAllBattleColumns).
export const selectHasRunnableBattleColumn = (state: RootState): boolean =>
  selectSubmittableBattleColumns(state).some(
    (c) => !isConversationRequestEmpty(state, c.conversationId),
  );

/** How many columns are currently collapsed — drives the toolbar badge. */
export const selectCollapsedBattleColumnCount = createSelector(
  [selectBattleColumns],
  (columns) => columns.filter((c) => c.collapsed).length,
);

export const selectMasterFields = createSelector(
  [selectBattleRoot],
  (root) => root.masterFields ?? EMPTY_FIELDS,
);

// =============================================================================
// Blind test (cross-mode)
// =============================================================================

const selectBlindRaw = (state: RootState) => state.agentComparison?.blind;

export const selectBlindState = createSelector(
  [selectBlindRaw],
  (blind) => blind ?? DEFAULT_BLIND,
);

/** The pre-submit checkbox value. */
export const selectBlindEnabled = createSelector(
  [selectBlindState],
  (blind) => blind.enabled,
);

/**
 * True while masking should be ON — a blind run is locked in and the
 * user hasn't revealed yet. This is the flag every masking surface reads.
 */
export const selectBlindActive = createSelector(
  [selectBlindState],
  (blind) => blind.active && !blind.revealed,
);

/** True once a blind run exists (active regardless of reveal). */
export const selectBlindSessionExists = createSelector(
  [selectBlindState],
  (blind) => blind.active,
);

export const selectBlindRevealed = createSelector(
  [selectBlindState],
  (blind) => blind.revealed,
);

export const selectBlindOrder = createSelector(
  [selectBlindState],
  (blind) => blind.order,
);
