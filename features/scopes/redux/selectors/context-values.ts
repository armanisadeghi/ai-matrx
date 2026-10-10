// features/scopes/redux/selectors/context-values.ts
//
// Selectors over the contextValues sidecar slice. Per-scope shape; consumers
// pass the scopeId.

import type { ContextValue } from "@ai-matrx/records/scopes";
import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type {
  ScopeValuesEntry,
} from "@/features/scopes/types";

const emptyEntry: ScopeValuesEntry = {
  status: "idle",
  fetchedAt: null,
  values: {},
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
    (slice, scopeId): Record<string, ContextValue> =>
      (scopeId && slice.byScope[scopeId]?.values) || emptyEntry.values,
  );

export const makeSelectScopeValuesStatus = () =>
  createSelector(
    selectContextValuesSlice,
    (_: RootState, scopeId: string | null | undefined) => scopeId,
    (slice, scopeId): ScopeValuesEntry["status"] =>
      (scopeId && slice.byScope[scopeId]?.status) || "idle",
  );

/** The scope's last read failure (null unless status is "error"). Returns a primitive, so no memo. */
export const selectScopeValuesError = (
  state: RootState,
  scopeId: string | null | undefined,
): string | null => (scopeId && state.contextValues.byScope[scopeId]?.error) || null;
