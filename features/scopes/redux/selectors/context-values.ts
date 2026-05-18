// features/scopes/redux/selectors/context-values.ts
//
// Selectors over the contextValues sidecar slice. Per-scope shape; consumers
// pass the scopeId.

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type {
  ContextItemValue,
  ScopeValuesEntry,
} from "@/features/scopes/types";

const emptyEntry: ScopeValuesEntry = {
  status: "idle",
  fetchedAt: null,
  values: {},
  drafts: {},
  error: null,
};

const selectContextValuesSlice = (state: RootState) => state.contextValues;

export const makeSelectScopeValuesEntry = () =>
  createSelector(
    selectContextValuesSlice,
    (_: RootState, scopeId: string | null | undefined) => scopeId,
    (slice, scopeId): ScopeValuesEntry =>
      (scopeId && slice.byScope[scopeId]) || emptyEntry,
  );

export const makeSelectScopeValues = () =>
  createSelector(
    selectContextValuesSlice,
    (_: RootState, scopeId: string | null | undefined) => scopeId,
    (slice, scopeId): Record<string, ContextItemValue> =>
      (scopeId && slice.byScope[scopeId]?.values) || emptyEntry.values,
  );

export const makeSelectScopeDrafts = () =>
  createSelector(
    selectContextValuesSlice,
    (_: RootState, scopeId: string | null | undefined) => scopeId,
    (slice, scopeId): Record<string, Partial<ContextItemValue>> =>
      (scopeId && slice.byScope[scopeId]?.drafts) || emptyEntry.drafts,
  );

export const makeSelectScopeHasDrafts = () =>
  createSelector(
    selectContextValuesSlice,
    (_: RootState, scopeId: string | null | undefined) => scopeId,
    (slice, scopeId): boolean => {
      const entry = scopeId ? slice.byScope[scopeId] : null;
      return !!entry && Object.keys(entry.drafts).length > 0;
    },
  );

export const makeSelectScopeValuesStatus = () =>
  createSelector(
    selectContextValuesSlice,
    (_: RootState, scopeId: string | null | undefined) => scopeId,
    (slice, scopeId): ScopeValuesEntry["status"] =>
      (scopeId && slice.byScope[scopeId]?.status) || "idle",
  );
