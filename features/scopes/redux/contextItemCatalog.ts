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

import {
  createAsyncThunk,
  createSelector,
  weakMapMemoize,
} from "@reduxjs/toolkit";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import type { Json } from "@/types/database.types";
import { ensureScopeTypeItems } from "@/features/scopes/redux/thunks/ensureScopeTypeItems";
import {
  createContextItem as createContextItemDoor,
  deleteContextItem as deleteContextItemDoor,
  updateContextItem as updateContextItemDoor,
} from "@/features/scopes/redux/thunks/contextItemMutations";
import { unwrapScopesRpc } from "@/features/scopes/types";
import type { ContextItemsEntry } from "@/features/scopes/types";
import { SYSTEM_ITEMS_KEY } from "@/features/scopes/constants/contextItems";
import type { RootState } from "@/lib/redux/rootReducer";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";
import type { ReferenceSource } from "@/features/scopes/utils/referenceSource";
import type {
  ContextValueType,
  ContextFetchHint,
  ContextSensitivity,
  ContextItemStatus,
} from "@/features/agent-context/types";

export { SYSTEM_ITEMS_KEY };

export type SystemItemClass = "ambient" | "curated" | "dataset";

export type {
  ContextValueType,
  ContextFetchHint,
  ContextSensitivity,
  ContextItemStatus,
};

/** One context item (a column of a scope type), as the scope screens use it. */
export interface ContextItem {
  id: string;
  scope_type_id: string;
  key: string;
  /** Server-maintained kebab-case mirror of `key`; never authored by the UI. */
  slug?: string | null;
  display_name: string;
  description: string;
  category: string | null;
  value_type: ContextValueType;
  /**
   * Optional custom input component (the Agent-Builder VariableCustomComponent
   * shape). When set, the per-scope value is authored and entered with the
   * matching Smart-Input component instead of a bare textarea.
   */
  custom_component?: VariableCustomComponent | null;
  fetch_hint: ContextFetchHint;
  sensitivity: ContextSensitivity;
  status: ContextItemStatus | string;
  tags: string[];
  sort_order?: number;
  status_note?: string | null;
  review_interval_days?: number | null;
  /** Reference-cell config (value_type "reference" only) — features/scopes/utils/referenceCell.ts. */
  allowed_reference_types?: string[] | null;
  max_items?: number;
  allowed_scope_type_ids?: string[] | null;
  /** Dimensional reference binding (INTERIM jsonb) — features/scopes/utils/referenceSource.ts. */
  reference_source?: ReferenceSource | null;
  /** Set ONLY on System Context Items (the `SYSTEM_ITEMS_KEY` catalog). */
  system_item_class?: SystemItemClass;
}

/** Stable empty list for selectors — never mutate. */
const EMPTY_CONTEXT_ITEMS: ContextItem[] = [];

// ─── Reads ─────────────────────────────────────────────────────────────

/** Load one scope type's catalog (no refetch when it is already loaded). */
export const listScopeTypeItems = (scopeTypeId: string) =>
  ensureScopeTypeItems(scopeTypeId);

/** Load the System Context catalog (`SYSTEM_ITEMS_KEY`). */
export const listSystemContextItems = () =>
  ensureScopeTypeItems(SYSTEM_ITEMS_KEY);

// ─── Writes — each through its scopesService door ──────────────────────

export interface UpdateContextItemInput {
  id: string;
  display_name?: string;
  description?: string;
  category?: string | null;
  value_type?: ContextValueType;
  custom_component?: VariableCustomComponent | null;
  fetch_hint?: ContextFetchHint;
  sensitivity?: ContextSensitivity;
  tags?: string[];
  status?: ContextItemStatus;
  status_note?: string | null;
  review_interval_days?: number | null;
  sort_order?: number;
  allowed_reference_types?: string[] | null;
  max_items?: number;
  allowed_scope_type_ids?: string[] | null;
  reference_source?: ReferenceSource | null;
}

export const updateContextItem = createAsyncThunk<
  ContextItem,
  UpdateContextItemInput,
  { state: RootState }
>("scopesTree/contextItemUpdate", async (params, { dispatch }) => {
  const { id, custom_component, reference_source, ...rest } = params;
  const row = unwrapScopesRpc(
    await dispatch(
      updateContextItemDoor({
        item_id: id,
        ...rest,
        ...(custom_component !== undefined
          ? { custom_component: custom_component as unknown as Json | null }
          : {}),
        ...(reference_source !== undefined
          ? { reference_source: reference_source as unknown as Json | null }
          : {}),
      }),
    ),
  );
  return row as unknown as ContextItem;
});

export interface CreateContextItemInput {
  scope_type_id: string;
  key: string;
  display_name: string;
  value_type?: ContextValueType;
  description?: string;
  category?: string;
  fetch_hint?: ContextFetchHint;
  sensitivity?: ContextSensitivity;
  tags?: string[];
  sort_order?: number;
  allowed_reference_types?: string[];
  max_items?: number;
  allowed_scope_type_ids?: string[];
  reference_source?: ReferenceSource | null;
}

export const createContextItem = createAsyncThunk<
  ContextItem,
  CreateContextItemInput,
  { state: RootState }
>("scopesTree/contextItemCreate", async (params, { dispatch }) => {
  const { reference_source, ...rest } = params;
  const row = unwrapScopesRpc(
    await dispatch(
      createContextItemDoor({
        ...rest,
        ...(reference_source
          ? { reference_source: reference_source as unknown as Json }
          : {}),
      }),
    ),
  );
  return row as unknown as ContextItem;
});

/** Archive (soft: `is_active=false`, values retained) through `delete_context_item`. */
export const deleteContextItem = createAsyncThunk<
  string,
  string,
  { state: RootState }
>("scopesTree/contextItemDelete", async (id, { dispatch, getState }) => {
  const scopeTypeId =
    selectContextItemById(getState(), id)?.scope_type_id ?? "";
  unwrapScopesRpc(
    await dispatch(
      deleteContextItemDoor({ item_id: id, scope_type_id: scopeTypeId }),
    ),
  );
  return id;
});

// ─── Selectors over the tree's catalogs ────────────────────────────────

const selectCatalogs = (state: RootState) =>
  state.scopesTree.contextItemsByTypeId;

const catalogItems = (entry: ContextItemsEntry | undefined): ContextItem[] =>
  (entry?.items as unknown as ContextItem[] | undefined) ?? EMPTY_CONTEXT_ITEMS;

/** Every loaded catalog's items, flattened. */
export const selectAllContextItems = createSelector(
  [selectCatalogs],
  (catalogs): ContextItem[] => {
    const out = Object.values(catalogs).flatMap((e) => catalogItems(e));
    return out.length === 0 ? EMPTY_CONTEXT_ITEMS : out;
  },
);

const selectItemsById = createSelector(
  [selectAllContextItems],
  (items) => new Map(items.map((i) => [i.id, i])),
);

export const selectContextItemById = (
  state: RootState,
  id: string,
): ContextItem | undefined => selectItemsById(state).get(id);

/** One scope type's catalog (weakMapMemoize: many callers, many type ids). */
export const selectItemsByType = createSelector(
  [
    (state: RootState, typeId: string) =>
      typeId ? selectCatalogs(state)[typeId] : undefined,
  ],
  (entry) => {
    const items = catalogItems(entry);
    return items.length > 0 ? items : EMPTY_CONTEXT_ITEMS;
  },
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

/**
 * Resolve a route segment (UUID or kebab slug) to a context item within a scope
 * type. Slugs are unique per scope type; ids are globally unique.
 */
export const selectItemBySlugOrId = createSelector(
  [
    selectAllContextItems,
    (_s: RootState, typeId: string | undefined) => typeId,
    (_s: RootState, _typeId: string | undefined, slugOrId: string) => slugOrId,
  ],
  (items, typeId, slugOrId) =>
    isUuidShape(slugOrId)
      ? items.find((i) => i.id === slugOrId)
      : items.find((i) => i.scope_type_id === typeId && i.slug === slugOrId),
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

const EMPTY_IDS: string[] = [];

/** Every scope type whose catalog has answered at least once. */
export const selectLoadedCatalogTypeIds = createSelector(
  [selectCatalogs],
  (catalogs): string[] => {
    const ids = Object.entries(catalogs)
      .filter(([, e]) => e.status === "ready" || e.fetchedAt !== null)
      .map(([id]) => id);
    return ids.length === 0 ? EMPTY_IDS : ids;
  },
);

/** Has this type's catalog answered at least once? */
export const selectItemsLoadedForType = (
  state: RootState,
  typeId: string,
): boolean => {
  const entry = selectCatalogs(state)[typeId];
  return !!entry && (entry.status === "ready" || entry.fetchedAt !== null);
};
