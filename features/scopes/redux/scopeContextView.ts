"use client";

// features/scopes/redux/scopeContextView.ts
//
// One scope's fields beside its values, for the scope screens and chat: the join is
// `joinFieldValues` from `@ai-matrx/records/scopes`; this file is the holder's thin selectors and
// the two thunks a screen dispatches (`getScopeContext` to read, `setScopeContextValue` to write a
// `ContextValueWrite`).

import { createAsyncThunk, createSelector, weakMapMemoize } from "@reduxjs/toolkit";
import { joinFieldValues, type ContextValueWrite, type ScopeFieldValue } from "@ai-matrx/records/scopes";
import { scopeDoors, unwrapRecords } from "@/features/scopes/service/scopeDoors";
import { ensureScopeTypeItems } from "@/features/scopes/redux/thunks/ensureScopeTypeItems";
import { ensureContextValues } from "@/features/scopes/redux/thunks/ensureContextValues";
import { setContextValue } from "@/features/scopes/redux/thunks/setContextValue";
import { cellKey, contextValuesActions } from "@/features/scopes/redux/contextValuesSlice";
import type { ContextItemsEntry, OrgNode, ScopeValuesEntry } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";

/** One field of a scope's type beside the scope's value for it. */
export type ScopeContextRow = ScopeFieldValue;

const EMPTY_INDEX: Record<string, string> = {};

/** scope id → scope type id, from the tree. */
const selectScopeTypeIndex = createSelector(
  [(s: RootState) => s.scopesTree.organizations],
  (orgs: Record<string, OrgNode>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const org of Object.values(orgs)) {
      for (const t of org.scope_types) for (const sc of t.scopes) out[sc.id] = t.id;
    }
    return Object.keys(out).length === 0 ? EMPTY_INDEX : out;
  },
);

const scopeTypeIdFor = (s: RootState, scopeId: string): string | undefined =>
  selectScopeTypeIndex(s)[scopeId] ?? s.contextValues.byScope[scopeId]?.scopeTypeId;

/** Read a scope's fields and values (the type is learned from the scope door when the tree lacks it). */
export const getScopeContext = createAsyncThunk<
  { scopeId: string; rows: ScopeContextRow[] },
  { scope_id: string; item_ids?: string[]; include_empty?: boolean; refresh?: boolean },
  { state: RootState }
>("contextValues/getScopeContext", async (params, { dispatch, getState }) => {
  const scopeId = params.scope_id;
  let typeId = scopeTypeIdFor(getState(), scopeId);
  if (!typeId) {
    const scope = unwrapRecords(await scopeDoors().scopes([scopeId]))[0];
    if (!scope) throw new Error("This scope was not found.");
    typeId = scope.scope_type_id;
    dispatch(contextValuesActions.scopeTypeResolved({ scopeId, scopeTypeId: typeId }));
  }
  await Promise.all([
    dispatch(ensureScopeTypeItems(typeId)),
    dispatch(ensureContextValues(scopeId, { refresh: !!params.refresh })),
  ]);
  const state = getState();
  const catalog = state.scopesTree.contextItemsByTypeId[typeId];
  if (catalog?.status === "error") throw new Error(catalog.error ?? "Could not load fields");
  const values = state.contextValues.byScope[scopeId];
  if (values?.status === "error") throw new Error(values.error ?? "Could not load values");
  let rows = selectValuesByScope(state, scopeId) ?? [];
  if (params.item_ids) {
    const wanted = new Set(params.item_ids);
    rows = rows.filter((r) => wanted.has(r.field.id));
  }
  if (params.include_empty === false) rows = rows.filter((r) => r.has_value);
  return { scopeId, rows };
});

/** Write one cell from a person's edit (saving state is tracked per cell). */
export const setScopeContextValue = createAsyncThunk<
  { scopeId: string; itemId: string },
  ContextValueWrite,
  { state: RootState }
>("contextValues/setScopeContextValue", async (write, { dispatch }) => {
  const cell = { scopeId: write.scope_id, contextItemId: write.field_id };
  dispatch(contextValuesActions.valueSavePending(cell));
  const res = await dispatch(setContextValue({ source_type: "manual", ...write }));
  dispatch(contextValuesActions.valueSaveSettled({ ...cell, saved: res.ok }));
  unwrapRecords(res);
  return { scopeId: write.scope_id, itemId: write.field_id };
});

const answered = (e: { status: string; fetchedAt: number | null } | undefined) =>
  !!e && (e.status === "ready" || e.fetchedAt !== null);

/** A scope's fields beside its values; `undefined` until both have answered. */
export const selectValuesByScope = createSelector(
  [
    (s: RootState, scopeId: string): ContextItemsEntry | undefined => {
      const typeId = scopeId ? scopeTypeIdFor(s, scopeId) : undefined;
      return typeId ? s.scopesTree.contextItemsByTypeId[typeId] : undefined;
    },
    (s: RootState, scopeId: string): ScopeValuesEntry | undefined => (scopeId ? s.contextValues.byScope[scopeId] : undefined),
  ],
  (catalog, values): ScopeContextRow[] | undefined => {
    if (!catalog || !values || !answered(catalog) || !answered(values)) return undefined;
    return joinFieldValues(catalog.items, values.values);
  },
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

export const selectScopeValuesLoading = (state: RootState, scopeId: string): boolean => {
  if (!scopeId) return false;
  if (state.contextValues.byScope[scopeId]?.status === "loading") return true;
  const typeId = scopeTypeIdFor(state, scopeId);
  return !!typeId && state.scopesTree.contextItemsByTypeId[typeId]?.status === "loading";
};

export const selectScopeValuesReadError = (state: RootState, scopeId: string): string | null => {
  if (!scopeId) return null;
  const values = state.contextValues.byScope[scopeId];
  if (values?.status === "error") return values.error ?? "The values could not be read.";
  const typeId = scopeTypeIdFor(state, scopeId);
  const catalog = typeId ? state.scopesTree.contextItemsByTypeId[typeId] : undefined;
  if (catalog?.status === "error") return catalog.error ?? "The fields could not be read.";
  return null;
};

export const selectIsSavingPair = (state: RootState, scopeId: string, itemId: string): boolean =>
  !!state.contextValues.savingPairs?.[cellKey(scopeId, itemId)];

export const selectLastSavedAt = (state: RootState, scopeId: string, itemId: string): number | undefined =>
  state.contextValues.lastSavedAt?.[cellKey(scopeId, itemId)];

export const selectFilledCount = createSelector(
  [(state: RootState, scopeId: string) => selectValuesByScope(state, scopeId)],
  (rows) => (rows ? { filled: rows.filter((r) => r.has_value).length, total: rows.length } : null),
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);
