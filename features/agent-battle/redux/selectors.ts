/**
 * Agent Battle — selectors
 *
 * One selector per discrete property. All memoized via createSelector
 * (per CLAUDE.md).
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type { BattleColumn, MasterField } from "../types";

const EMPTY_COLUMNS: BattleColumn[] = [];
const EMPTY_IDS: string[] = [];
const EMPTY_FIELDS: MasterField[] = [];

const selectBattleRoot = (state: RootState) =>
  state.agentBattle ?? {
    columns: EMPTY_COLUMNS,
    activeSetId: null,
    activeSetName: null,
    isSubmittingAll: false,
    masterFields: EMPTY_FIELDS,
  };

export const selectBattleColumns = createSelector(
  [selectBattleRoot],
  (root) => root.columns ?? EMPTY_COLUMNS,
);

export const selectBattleColumnIds = createSelector(
  [selectBattleColumns],
  (columns) => (columns.length === 0 ? EMPTY_IDS : columns.map((c) => c.columnId)),
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

export const selectMasterFields = createSelector(
  [selectBattleRoot],
  (root) => root.masterFields ?? EMPTY_FIELDS,
);
