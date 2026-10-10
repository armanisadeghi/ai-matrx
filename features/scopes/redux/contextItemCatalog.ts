"use client";

// features/scopes/redux/contextItemCatalog.ts
//
// The context-item CATALOG surface every scope screen reads: the item
// definitions of a scope type (and the System Context sentinel catalog), held
// ON THE CANONICAL TREE (`scopesTree.contextItemsByTypeId`) and loaded by the
// one catalog loader (`ensureScopeTypeItems`). Writes go through the one set of
// doors (`thunks/contextItemMutations` → `scopesService`), which fold the
// authoritative row into the same catalog — no refetch, no second cache.
//
// This replaces `features/scope-system/redux/contextItemsSlice.ts` (deleted
// 2026-09-25, lane SCOPE-ADMIN-2), which held a SECOND copy of the catalogs
// (`state.contextItems`) behind its own `list_scope_type_items` read and the
// only other `context.system_context_item` reader. The names below are the
// ones its consumers already used, so a screen moved by changing one import:
//
//   listScopeTypeItems(typeId)   → ensureScopeTypeItems(typeId) (no refetch;
//                                  the doors keep the catalog current)
//   listSystemContextItems()     → ensureScopeTypeItems(SYSTEM_ITEMS_KEY)
//   create/update/deleteContextItem → the canonical door thunks, with the
//                                  `.unwrap()` contract these screens rely on
//                                  (a refused write THROWS its sentence)
//   select*                      → selectors over the tree's catalogs

import { createAsyncThunk, createSelector, weakMapMemoize } from "@reduxjs/toolkit";
import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import { sameSlug, type ContextField, type ContextFieldSpec } from "@ai-matrx/records/scopes";
import { unwrapRecords } from "@ai-matrx/records";
import { ensureScopeTypeItems } from "@/features/scopes/redux/thunks/ensureScopeTypeItems";
import {
  createContextItem as createContextItemDoor,
  deleteContextItem as deleteContextItemDoor,
  updateContextItem as updateContextItemDoor,
} from "@/features/scopes/redux/thunks/contextItemMutations";
import type { ContextItemsEntry } from "@/features/scopes/types";
import { SYSTEM_ITEMS_KEY } from "@/features/scopes/constants/contextItems";
import type { RootState } from "@/lib/redux/rootReducer";

export { SYSTEM_ITEMS_KEY };

const EMPTY_CONTEXT_ITEMS: ContextField[] = [];

/** Ensure a scope type's fields are in the catalog (chat's `listScopeTypeItems`). */
export const listScopeTypeItems = (scopeTypeId: string) => ensureScopeTypeItems(scopeTypeId);

/** Read the canonical catalog, preserving its refusal for imperative consumers. */
export const readScopeTypeFields = (scopeTypeId: string): ThunkAction<Promise<ContextField[]>, RootState, unknown, UnknownAction> =>
  async (dispatch, getState) => {
    await dispatch(ensureScopeTypeItems(scopeTypeId));
    const state = getState();
    const error = selectItemsErrorForType(state, scopeTypeId);
    if (error) throw new Error(error);
    return selectItemsByType(state, scopeTypeId);
  };

/** Ensure the System Context items are in the catalog. */
export const listSystemContextItems = () => ensureScopeTypeItems(SYSTEM_ITEMS_KEY);

/** Change a field (`null` clears); the catalog takes the store's answer. */
export const updateContextItem = createAsyncThunk<
  ContextField,
  { id: string } & ContextFieldSpec,
  { state: RootState }
>("scopesTree/contextItemUpdate", async ({ id, ...spec }, { dispatch, getState }) => {
  const scopeTypeId = selectContextItemById(getState(), id)?.scope_type_id ?? "";
  return unwrapRecords(await dispatch(updateContextItemDoor({ item_id: id, scope_type_id: scopeTypeId, ...spec })));
});

/** Add a field to a scope type. */
export const createContextItem = createAsyncThunk<
  ContextField,
  { scope_type_id: string } & ContextFieldSpec,
  { state: RootState }
>("scopesTree/contextItemCreate", async (params, { dispatch }) =>
  unwrapRecords(await dispatch(createContextItemDoor(params))),
);

/** Archive a field. */
export const deleteContextItem = createAsyncThunk<string, string, { state: RootState }>(
  "scopesTree/contextItemDelete",
  async (id, { dispatch, getState }) => {
    const scopeTypeId = selectContextItemById(getState(), id)?.scope_type_id ?? "";
    unwrapRecords(await dispatch(deleteContextItemDoor({ item_id: id, scope_type_id: scopeTypeId })));
    return id;
  },
);

const selectCatalogs = (state: RootState) => state.scopesTree.contextItemsByTypeId;
const catalogItems = (entry: ContextItemsEntry | undefined): ContextField[] => entry?.items ?? EMPTY_CONTEXT_ITEMS;

export const selectAllContextItems = createSelector([selectCatalogs], (catalogs): ContextField[] => {
  const out = Object.values(catalogs).flatMap((e) => catalogItems(e));
  return out.length === 0 ? EMPTY_CONTEXT_ITEMS : out;
});

const selectItemsById = createSelector([selectAllContextItems], (items) => new Map(items.map((i) => [i.id, i])));

export const selectContextItemById = (state: RootState, id: string): ContextField | undefined =>
  selectItemsById(state).get(id);

export const selectItemsByType = createSelector(
  [(state: RootState, typeId: string) => (typeId ? selectCatalogs(state)[typeId] : undefined)],
  (entry) => {
    const items = catalogItems(entry);
    return items.length > 0 ? items : EMPTY_CONTEXT_ITEMS;
  },
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

/** A field by id, or by its key within a type (a URL may say `practice-areas` for `practice_areas`). */
export const selectItemBySlugOrId = createSelector(
  [
    selectAllContextItems,
    (_s: RootState, typeId: string | undefined) => typeId,
    (_s: RootState, _typeId: string | undefined, slugOrId: string) => slugOrId,
  ],
  (items, typeId, slugOrId) =>
    isUuidShape(slugOrId)
      ? items.find((i) => i.id === slugOrId)
      : items.find((i) => i.scope_type_id === typeId && sameSlug(i.key, slugOrId)),
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

const EMPTY_IDS: string[] = [];

export const selectLoadedCatalogTypeIds = createSelector([selectCatalogs], (catalogs): string[] => {
  const ids = Object.entries(catalogs)
    .filter(([, e]) => e.status === "ready" || e.fetchedAt !== null)
    .map(([id]) => id);
  return ids.length === 0 ? EMPTY_IDS : ids;
});

export const selectItemsLoadedForType = (state: RootState, typeId: string): boolean => {
  const entry = selectCatalogs(state)[typeId];
  return !!entry && (entry.status === "ready" || entry.fetchedAt !== null);
};

export const selectItemsErrorForType = (state: RootState, typeId: string): string | null => {
  const entry = selectCatalogs(state)[typeId];
  return entry?.status === "error" ? (entry.error ?? "The read failed.") : null;
};
