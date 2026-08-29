// features/scopes/redux/selectors/context-items.ts
//
// Selectors over the per-scope-type context-item CATALOGS cached on the
// canonical scope tree slice (`scopesTree.contextItemsByTypeId`). Item
// definitions only — per-scope cell values live in ./context-values.ts.
// Consumers pass the scopeTypeId.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type { ContextItemRow, ContextItemsEntry } from "@/features/scopes/types";

const emptyEntry: ContextItemsEntry = {
  status: "idle",
  items: [],
  fetchedAt: null,
  error: null,
};

const selectScopesSlice = (state: RootState) => state.scopesTree;

export const makeSelectItemsForType = () =>
  createSelector(
    selectScopesSlice,
    (_: RootState, scopeTypeId: string | null | undefined) => scopeTypeId,
    (slice, scopeTypeId): ContextItemRow[] =>
      (scopeTypeId && slice.contextItemsByTypeId[scopeTypeId]?.items) ||
      emptyEntry.items,
  );

export const makeSelectItemsStatusForType = () =>
  createSelector(
    selectScopesSlice,
    (_: RootState, scopeTypeId: string | null | undefined) => scopeTypeId,
    (slice, scopeTypeId): ContextItemsEntry["status"] =>
      (scopeTypeId && slice.contextItemsByTypeId[scopeTypeId]?.status) ||
      emptyEntry.status,
  );
