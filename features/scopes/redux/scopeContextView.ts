"use client";

// features/scopes/redux/scopeContextView.ts
//
// THE SCOPE-CONTEXT VIEW: one scope's fields joined to their current values —
// the row every scope page, field editor and value sheet renders. It is NOT a
// cache of its own. It is derived from the two canonical stores:
//
//   definitions  scopesTree.contextItemsByTypeId[<the scope's type>]
//                (loader: ensureScopeTypeItems; writes: contextItemMutations)
//   values       contextValues.byScope[<scope>]
//                (loader: ensureContextValues; writes: setContextValue →
//                 scopesService.setContextValue → `set_context_value`)
//
// so an edited field definition, an archived field, a new field and a saved
// value all show in every open view at once, with no refetch and no
// cross-slice mirroring.
//
// This replaces `features/scope-system/redux/scopeValuesSlice.ts` (deleted
// 2026-09-25, lane SCOPE-ADMIN-2), which held a THIRD copy of the definitions
// (denormalized into every scope's rows from `get_scope_context`) and a SECOND
// write path to the same cell (`set_scope_context_value`). The exported names
// are the ones its consumers used.

import {
  createAsyncThunk,
  createSelector,
  weakMapMemoize,
} from "@reduxjs/toolkit";
import type { Json } from "@/types/database.types";
import { scopesService } from "@/features/scopes/service/scopesService";
import { ensureScopeTypeItems } from "@/features/scopes/redux/thunks/ensureScopeTypeItems";
import { ensureContextValues } from "@/features/scopes/redux/thunks/ensureContextValues";
import { setContextValue } from "@/features/scopes/redux/thunks/setContextValue";
import {
  cellKey,
  contextValuesActions,
} from "@/features/scopes/redux/contextValuesSlice";
import { isScopesRpcErr, unwrapScopesRpc } from "@/features/scopes/types";
import type {
  ContextItemRow,
  ContextItemValue,
  ContextItemsEntry,
  OrgNode,
  ScopeValuesEntry,
} from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";
import type { ReferenceSource } from "@/features/scopes/utils/referenceSource";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";
import type {
  ContextItem,
  ContextValueType,
} from "@/features/scopes/redux/contextItemCatalog";

/** One field of one scope: its definition plus its current value (if any). */
export interface ScopeContextRow {
  item_id: string;
  key: string;
  slug?: string | null;
  display_name: string;
  description?: string;
  category?: string | null;
  value_type: ContextValueType;
  /** When set, the value is entered with this Smart-Input component (Agent-Builder parity). */
  custom_component?: VariableCustomComponent | null;
  fetch_hint?: string;
  sensitivity?: string;
  has_value: boolean;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_json: unknown | null;
  value_date: string | null;
  value_timestamp: string | null;
  value_time: string | null;
  value_document_url: string | null;
  version: number | null;
  updated_at: string | null;
  /** Reference-cell config (value_type "reference" only) — see contextItemCatalog.ContextItem. */
  allowed_reference_types?: string[] | null;
  max_items?: number;
  allowed_scope_type_ids?: string[] | null;
  /** Dimensional reference binding (INTERIM jsonb) — features/scopes/utils/referenceSource.ts. */
  reference_source?: ReferenceSource | null;
}

// ─── The scope → type index (from the tree, else the recorded one) ─────

const EMPTY_INDEX: Record<string, string> = {};

const selectScopeTypeIndex = createSelector(
  [(s: RootState) => s.scopesTree.organizations],
  (orgs: Record<string, OrgNode>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const org of Object.values(orgs)) {
      for (const t of org.scope_types) {
        for (const sc of t.scopes) out[sc.id] = t.id;
      }
    }
    return Object.keys(out).length === 0 ? EMPTY_INDEX : out;
  },
);

const scopeTypeIdFor = (s: RootState, scopeId: string): string | undefined =>
  selectScopeTypeIndex(s)[scopeId] ?? s.contextValues.byScope[scopeId]?.scopeTypeId;

// ─── Loader ─────────────────────────────────────────────────────────────

/**
 * Load one scope's view: its type's field catalog and its current values, in
 * parallel. Cached by both loaders; `refresh: true` re-reads the VALUES (for
 * a write that happened outside these doors, e.g. an accepted suggestion).
 * `item_ids` narrows the returned rows; `include_empty: false` returns only
 * filled cells. Rejects with the database's sentence when either read fails.
 */
export const getScopeContext = createAsyncThunk<
  { scopeId: string; rows: ScopeContextRow[] },
  {
    scope_id: string;
    item_ids?: string[];
    include_empty?: boolean;
    refresh?: boolean;
  },
  { state: RootState }
>("contextValues/getScopeContext", async (params, { dispatch, getState }) => {
  const scopeId = params.scope_id;
  let typeId = scopeTypeIdFor(getState(), scopeId);
  if (!typeId) {
    const home = unwrapScopesRpc(await scopesService.getScopeHome(scopeId));
    if (!home.scope) throw new Error("This scope was not found.");
    typeId = home.scope.scope_type_id;
    dispatch(
      contextValuesActions.scopeTypeResolved({ scopeId, scopeTypeId: typeId }),
    );
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
    rows = rows.filter((r) => wanted.has(r.item_id));
  }
  if (params.include_empty === false) rows = rows.filter((r) => r.has_value);
  return { scopeId, rows };
});

// ─── Write ──────────────────────────────────────────────────────────────

/**
 * A person's edit of one cell, through THE value door
 * (`scopesService.setContextValue` → `set_context_value`, source `manual`).
 * The written cell folds into the values store; the view updates everywhere.
 * Rejects with the database's sentence on a refusal.
 */
export const setScopeContextValue = createAsyncThunk<
  { scopeId: string; itemId: string },
  {
    scope_id: string;
    context_item_id: string;
    value_text?: string | null;
    value_number?: number | null;
    value_boolean?: boolean | null;
    value_json?: unknown;
    value_date?: string | null;
    value_timestamp?: string | null;
    value_time?: string | null;
    value_document_url?: string | null;
    change_summary?: string;
  },
  { state: RootState }
>("contextValues/setScopeContextValue", async (params, { dispatch }) => {
  const { scope_id, context_item_id, value_json, ...rest } = params;
  dispatch(
    contextValuesActions.valueSavePending({
      scopeId: scope_id,
      contextItemId: context_item_id,
    }),
  );
  const res = await dispatch(
    setContextValue({
      scope_id,
      context_item_id,
      ...rest,
      ...(value_json !== undefined ? { value_json: value_json as Json } : {}),
      source_type: "manual",
    }),
  );
  dispatch(
    contextValuesActions.valueSaveSettled({
      scopeId: scope_id,
      contextItemId: context_item_id,
      saved: !isScopesRpcErr(res),
    }),
  );
  unwrapScopesRpc(res);
  return { scopeId: scope_id, itemId: context_item_id };
});

// ─── The derived view ──────────────────────────────────────────────────

function toRow(item: ContextItem, value: ContextItemValue | undefined): ScopeContextRow {
  return {
    item_id: item.id,
    key: item.key,
    slug: item.slug ?? null,
    display_name: item.display_name,
    description: item.description ?? "",
    category: item.category,
    value_type: item.value_type,
    custom_component: item.custom_component ?? null,
    fetch_hint: item.fetch_hint,
    sensitivity: item.sensitivity,
    has_value: !!value,
    value_text: value?.value_text ?? null,
    value_number: value?.value_number ?? null,
    value_boolean: value?.value_boolean ?? null,
    value_json: value?.value_json ?? null,
    value_date: value?.value_date ?? null,
    value_timestamp: value?.value_timestamp ?? null,
    value_time: value?.value_time ?? null,
    value_document_url: value?.value_document_url ?? null,
    version: value?.version ?? null,
    updated_at: value?.created_at ?? null,
    allowed_reference_types: item.allowed_reference_types ?? null,
    max_items: item.max_items,
    allowed_scope_type_ids: item.allowed_scope_type_ids ?? null,
    reference_source: item.reference_source ?? null,
  };
}

const answered = (e: { status: string; fetchedAt: number | null } | undefined) =>
  !!e && (e.status === "ready" || e.fetchedAt !== null);

/**
 * One scope's rows, in the catalog's order — `undefined` until both the
 * fields and the values have answered (so "not loaded" never reads as "no
 * fields").
 */
export const selectValuesByScope = createSelector(
  [
    (s: RootState, scopeId: string): ContextItemsEntry | undefined => {
      const typeId = scopeId ? scopeTypeIdFor(s, scopeId) : undefined;
      return typeId ? s.scopesTree.contextItemsByTypeId[typeId] : undefined;
    },
    (s: RootState, scopeId: string): ScopeValuesEntry | undefined =>
      scopeId ? s.contextValues.byScope[scopeId] : undefined,
  ],
  (catalog, values): ScopeContextRow[] | undefined => {
    if (!answered(catalog) || !answered(values)) return undefined;
    const items = catalog!.items as unknown as ContextItem[];
    return items.map((item) => toRow(item, values!.values[item.id]));
  },
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

/** True while either half of the scope's view is loading. */
export const selectScopeValuesLoading = (
  state: RootState,
  scopeId: string,
): boolean => {
  if (!scopeId) return false;
  if (state.contextValues.byScope[scopeId]?.status === "loading") return true;
  const typeId = scopeTypeIdFor(state, scopeId);
  return (
    !!typeId &&
    state.scopesTree.contextItemsByTypeId[typeId]?.status === "loading"
  );
};

export const selectIsSavingPair = (
  state: RootState,
  scopeId: string,
  itemId: string,
): boolean => !!state.contextValues.savingPairs?.[cellKey(scopeId, itemId)];

export const selectLastSavedAt = (
  state: RootState,
  scopeId: string,
  itemId: string,
): number | undefined => state.contextValues.lastSavedAt?.[cellKey(scopeId, itemId)];

export const selectFilledCount = createSelector(
  [(state: RootState, scopeId: string) => selectValuesByScope(state, scopeId)],
  (rows) => {
    if (!rows) return null;
    const filled = rows.filter((r) => r.has_value).length;
    return { filled, total: rows.length };
  },
  { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
);

/** The catalog row type the view is built from (re-exported for callers). */
export type { ContextItemRow };
