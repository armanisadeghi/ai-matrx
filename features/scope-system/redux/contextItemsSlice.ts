"use client";

import {
  createSlice,
  createEntityAdapter,
  createAsyncThunk,
  createSelector,
  weakMapMemoize,
} from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { contextDb } from "@/utils/supabase/contextDb";
import { runWithSessionRetry } from "@/lib/supabase/authRetry";
import type { Json } from "@/types/database.types";
import { scopesService } from "@/features/scopes/service/scopesService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { unwrapScopesRpc } from "@/features/scopes/types";
import { isUuidShape } from "@ai-matrx/kit/uuid";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";
import type { ReferenceSource } from "@/features/scopes/utils/referenceSource";
import type {
  ContextValueType,
  ContextFetchHint,
  ContextSensitivity,
  ContextItemStatus,
} from "@/features/agent-context/types";

export type SystemItemClass = "ambient" | "curated" | "dataset";

export type {
  ContextValueType,
  ContextFetchHint,
  ContextSensitivity,
  ContextItemStatus,
};

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
   * shape: type + options + picklist binding + min/max/toggle labels). When set,
   * the per-scope value is authored and entered with the matching Smart-Input
   * component instead of a bare textarea. NULL = legacy primitive item.
   */
  custom_component?: VariableCustomComponent | null;
  fetch_hint: ContextFetchHint;
  sensitivity: ContextSensitivity;
  status: ContextItemStatus | string;
  tags: string[];
  sort_order?: number;
  status_note?: string | null;
  review_interval_days?: number | null;
  /**
   * Reference-cell config (value_type "reference" only): the Matrx
   * reference-fence types this item may point at (features/matrx-envelope
   * REFERENCE_TYPES), how many items its fence may carry, and, when "scope"
   * is allowed, which scope types. See features/scopes/utils/referenceCell.ts.
   */
  allowed_reference_types?: string[] | null;
  max_items?: number;
  allowed_scope_type_ids?: string[] | null;
  /**
   * Dimensional reference binding (INTERIM jsonb) — a fixed dataset/structured-list
   * container + the dimension set per scope (or a dynamic filter). See
   * features/scopes/utils/referenceSource.ts.
   */
  reference_source?: ReferenceSource | null;
  /**
   * Set ONLY on System Context Items (see `listSystemContextItems`): which of
   * the three kinds of platform truth this is. Absent on org scope items.
   */
  system_item_class?: SystemItemClass;
}

const adapter = createEntityAdapter<ContextItem>({
  // Order by the user-controlled sort_order, then display name as a stable tiebreaker.
  sortComparer: (a, b) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
    a.display_name.localeCompare(b.display_name),
});

/** Stable empty list for selectors — never mutate. */
const EMPTY_CONTEXT_ITEMS: ContextItem[] = [];

interface ExtraState {
  loading: boolean;
  error: string | null;
  loadedTypes: string[];
}

const initialState = adapter.getInitialState<ExtraState>({
  loading: false,
  error: null,
  loadedTypes: [],
});

export const listScopeTypeItems = createAsyncThunk(
  "contextItems/listByType",
  async (scopeTypeId: string) => {
    const { data, error } = await supabase.rpc("list_scope_type_items", {
      p_scope_type_id: scopeTypeId,
    });
    if (error) throw error;
    const items = (data ?? []) as Omit<ContextItem, "scope_type_id">[];
    return {
      scopeTypeId,
      items: items.map((i) => ({ ...i, scope_type_id: scopeTypeId })),
    };
  },
);

/**
 * The pseudo scope-type id under which SYSTEM Context Items are cached.
 *
 * System Context is the platform's third context source (what is simply TRUE)
 * and has NO scope dimension — its items live in `context.system_context_item`,
 * not on a scope type. They are cached here under a sentinel so every existing
 * consumer (the picker, `selectItemsByType`, `selectItemsLoadedForType`) works
 * unchanged. A binding to one of these carries `scope_type_id: null` — never
 * this sentinel, which is a client-side cache key only.
 */
export const SYSTEM_ITEMS_KEY = "__system__";

/**
 * Every ACTIVE System Context Item, readable by any signed-in user (the rows
 * are `visibility='public'` in the global-readable Matrx System org). These are
 * bindable exactly like scope items: `resolve_full_context` emits them into
 * `cell_values` keyed by the SAME `context_item_id` the binding stores.
 */
export const listSystemContextItems = createAsyncThunk(
  "contextItems/listSystem",
  async () => {
    // VIEW LAW: system context items are intentionally global public facts with no owner or scope dimension.
    const { data, error } = await runWithSessionRetry(() =>
      contextDb(supabase)
        .from("system_context_item")
        .select(
          "id, key, display_name, description, item_class, value_type, sensitivity, sort_order",
        )
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("key", { ascending: true }),
    );
    if (error) throw error;
    const items: ContextItem[] = (data ?? []).map((r) => ({
      id: r.id,
      scope_type_id: SYSTEM_ITEMS_KEY,
      key: r.key,
      display_name: r.display_name,
      description: r.description ?? "",
      category: null,
      value_type: r.value_type as ContextValueType,
      fetch_hint: "always" as ContextFetchHint,
      sensitivity: r.sensitivity as ContextSensitivity,
      status: "active",
      tags: [],
      sort_order: r.sort_order ?? 0,
      system_item_class: r.item_class as SystemItemClass,
    }));
    return { scopeTypeId: SYSTEM_ITEMS_KEY, items };
  },
);

// ─── Writes — every one through its scopesService door ─────────────────
//
// These thunks keep this console cache's action types (its reducers and the
// console's `.unwrap()` calls rely on them) but own no database access: each
// goes through THE door in `scopesService`, and echoes the authoritative row
// into the canonical tree's catalog (`scopesTree.contextItemsByTypeId`) so the
// console and every picker agree without a refetch (lane SCOPE-ADMIN-CANONICAL).

export const updateContextItem = createAsyncThunk(
  "contextItems/update",
  async (
    params: {
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
    },
    { dispatch },
  ) => {
    const { id, custom_component, reference_source, ...rest } = params;
    const row = unwrapScopesRpc(
      await scopesService.updateContextItem({
        item_id: id,
        ...rest,
        ...(custom_component !== undefined
          ? { custom_component: custom_component as unknown as Json | null }
          : {}),
        ...(reference_source !== undefined
          ? { reference_source: reference_source as unknown as Json | null }
          : {}),
      }),
    );
    dispatch(scopesActions.contextItemUpserted(row));
    return row as unknown as ContextItem;
  },
);

/** Archive (soft: `is_active=false`, values retained) through `delete_context_item`. */
export const deleteContextItem = createAsyncThunk(
  "contextItems/delete",
  async (id: string, { dispatch, getState }) => {
    const scopeTypeId = (getState() as StateWithContextItems).contextItems
      .entities[id]?.scope_type_id;
    unwrapScopesRpc(await scopesService.deleteContextItem(id));
    if (scopeTypeId) {
      dispatch(scopesActions.contextItemRemoved({ scopeTypeId, itemId: id }));
    }
    return id;
  },
);

export const createContextItem = createAsyncThunk(
  "contextItems/create",
  async (
    params: {
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
    },
    { dispatch },
  ) => {
    const { reference_source, ...rest } = params;
    const row = unwrapScopesRpc(
      await scopesService.createContextItem({
        ...rest,
        ...(reference_source
          ? { reference_source: reference_source as unknown as Json }
          : {}),
      }),
    );
    dispatch(scopesActions.contextItemUpserted(row));
    return row as unknown as ContextItem;
  },
);

const slice = createSlice({
  name: "contextItems",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(listScopeTypeItems.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(listScopeTypeItems.fulfilled, (state, action) => {
        state.loading = false;
        adapter.upsertMany(state, action.payload.items);
        if (!state.loadedTypes.includes(action.payload.scopeTypeId)) {
          state.loadedTypes.push(action.payload.scopeTypeId);
        }
      })
      .addCase(listScopeTypeItems.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to load fields";
      })
      .addCase(listSystemContextItems.fulfilled, (state, action) => {
        state.loading = false;
        adapter.upsertMany(state, action.payload.items);
        if (!state.loadedTypes.includes(action.payload.scopeTypeId)) {
          state.loadedTypes.push(action.payload.scopeTypeId);
        }
      })
      .addCase(listSystemContextItems.rejected, (state, action) => {
        state.loading = false;
        state.error =
          action.error.message ?? "Failed to load system context items";
      })
      .addCase(createContextItem.fulfilled, (state, action) => {
        adapter.upsertOne(state, action.payload);
        if (!state.loadedTypes.includes(action.payload.scope_type_id)) {
          state.loadedTypes.push(action.payload.scope_type_id);
        }
      })
      .addCase(updateContextItem.fulfilled, (state, action) => {
        adapter.upsertOne(state, action.payload);
      })
      .addCase(deleteContextItem.fulfilled, (state, action) => {
        adapter.removeOne(state, action.payload);
      });
  },
});

export default slice.reducer;

type StateWithContextItems = {
  contextItems: ReturnType<typeof slice.reducer>;
};

const adapterSelectors = adapter.getSelectors(
  (s: StateWithContextItems) => s.contextItems,
);

export const selectAllContextItems = adapterSelectors.selectAll;
export const selectContextItemById = adapterSelectors.selectById;

// weakMapMemoize (not the default size-1 lruMemoize): this selector now has
// multiple simultaneous callers with different `typeId`s in the same render
// pass (ContextItemPicker + the scope batch-import tool) — a size-1 cache
// thrashes between them, forcing a recompute (and a fresh array reference)
// on every call and tripping Redux's "selector returned a different result
// for the same parameters" warning.
export const selectItemsByType = createSelector(
  [
    selectAllContextItems,
    (_state: StateWithContextItems, typeId: string) => typeId,
  ],
  (items, typeId) => {
    if (!typeId) return EMPTY_CONTEXT_ITEMS;
    const filtered = items.filter((i) => i.scope_type_id === typeId);
    return filtered.length > 0 ? filtered : EMPTY_CONTEXT_ITEMS;
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
    (_s: StateWithContextItems, typeId: string | undefined) => typeId,
    (
      _s: StateWithContextItems,
      _typeId: string | undefined,
      slugOrId: string,
    ) => slugOrId,
  ],
  (items, typeId, slugOrId) =>
    isUuidShape(slugOrId)
      ? items.find((i) => i.id === slugOrId)
      : items.find((i) => i.scope_type_id === typeId && i.slug === slugOrId),
);

export const selectItemsLoadedForType = (
  state: StateWithContextItems,
  typeId: string,
) => state.contextItems.loadedTypes.includes(typeId);
