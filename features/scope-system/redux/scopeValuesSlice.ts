"use client";

import {
  createSlice,
  createAsyncThunk,
  createSelector,
  PayloadAction,
} from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { ContextValueType, ContextItem } from "./contextItemsSlice";

/**
 * One row returned by `get_scope_context(scope_id, null, true)`.
 * Combines the field definition (from ctx_context_items) and its current
 * value for the requested scope (from ctx_context_item_values, may be null).
 */
export interface ScopeContextRow {
  item_id: string;
  key: string;
  display_name: string;
  description?: string;
  category?: string | null;
  value_type: ContextValueType;
  fetch_hint?: string;
  sensitivity?: string;
  has_value: boolean;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_json: unknown | null;
  value_date: string | null;
  value_document_url: string | null;
  version: number | null;
  updated_at: string | null;
}

interface ScopeValuesState {
  byScope: Record<string, ScopeContextRow[]>;
  loadingScopes: string[];
  savingPairs: string[];
  lastSavedAt: Record<string, number>;
  error: string | null;
}

const initialState: ScopeValuesState = {
  byScope: {},
  loadingScopes: [],
  savingPairs: [],
  lastSavedAt: {},
  error: null,
};

const pairKey = (scopeId: string, itemId: string) => `${scopeId}:${itemId}`;

export const getScopeContext = createAsyncThunk(
  "scopeValues/get",
  async (params: {
    scope_id: string;
    item_ids?: string[];
    include_empty?: boolean;
  }) => {
    const { data, error } = await supabase.rpc("get_scope_context", {
      p_scope_id: params.scope_id,
      p_item_ids: params.item_ids ?? undefined,
      p_include_empty: params.include_empty ?? true,
    });
    if (error) throw error;
    return {
      scopeId: params.scope_id,
      rows: (data ?? []) as ScopeContextRow[],
    };
  },
);

export const setScopeContextValue = createAsyncThunk(
  "scopeValues/set",
  async (params: {
    scope_id: string;
    context_item_id: string;
    value_text?: string | null;
    value_number?: number | null;
    value_boolean?: boolean | null;
    value_json?: unknown;
    value_date?: string | null;
    value_document_url?: string | null;
    change_summary?: string;
  }) => {
    const { data, error } = await supabase.rpc("set_scope_context_value", {
      p_scope_id: params.scope_id,
      p_context_item_id: params.context_item_id,
      p_value_text: params.value_text ?? undefined,
      p_value_number: params.value_number ?? undefined,
      p_value_boolean: params.value_boolean ?? undefined,
      p_value_json: params.value_json ?? undefined,
      p_value_date: params.value_date ?? undefined,
      p_value_document_url: params.value_document_url ?? undefined,
      p_change_summary: params.change_summary ?? undefined,
    });
    if (error) throw error;
    return {
      scopeId: params.scope_id,
      itemId: params.context_item_id,
      value: data as {
        value_text: string | null;
        value_number: number | null;
        value_boolean: boolean | null;
        value_json: unknown | null;
        value_date: string | null;
        value_document_url: string | null;
        version: number;
        created_at: string;
      },
    };
  },
);

const slice = createSlice({
  name: "scopeValues",
  initialState,
  reducers: {
    /**
     * When a new field is added inline on a scope detail page, we want it
     * to appear instantly across all scopes of the same type without
     * refetching. Caller can splice a placeholder row into the cache.
     */
    appendPlaceholderRow(
      state,
      action: PayloadAction<{ scopeId: string; row: ScopeContextRow }>,
    ) {
      const list = state.byScope[action.payload.scopeId] ?? [];
      const exists = list.some((r) => r.item_id === action.payload.row.item_id);
      if (!exists) {
        state.byScope[action.payload.scopeId] = [...list, action.payload.row];
      }
    },
    clearScopeCache(state, action: PayloadAction<string>) {
      delete state.byScope[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getScopeContext.pending, (state, action) => {
        const scopeId = action.meta.arg.scope_id;
        if (!state.loadingScopes.includes(scopeId)) {
          state.loadingScopes.push(scopeId);
        }
        state.error = null;
      })
      .addCase(getScopeContext.fulfilled, (state, action) => {
        state.loadingScopes = state.loadingScopes.filter(
          (s) => s !== action.payload.scopeId,
        );
        state.byScope[action.payload.scopeId] = action.payload.rows;
      })
      .addCase(getScopeContext.rejected, (state, action) => {
        const scopeId = action.meta.arg.scope_id;
        state.loadingScopes = state.loadingScopes.filter((s) => s !== scopeId);
        state.error = action.error.message ?? "Failed to load values";
      })
      .addCase(setScopeContextValue.pending, (state, action) => {
        const key = pairKey(
          action.meta.arg.scope_id,
          action.meta.arg.context_item_id,
        );
        if (!state.savingPairs.includes(key)) state.savingPairs.push(key);
      })
      .addCase(setScopeContextValue.fulfilled, (state, action) => {
        const { scopeId, itemId, value } = action.payload;
        state.savingPairs = state.savingPairs.filter(
          (k) => k !== pairKey(scopeId, itemId),
        );
        state.lastSavedAt[pairKey(scopeId, itemId)] = Date.now();
        const list = state.byScope[scopeId];
        if (list) {
          state.byScope[scopeId] = list.map((row) =>
            row.item_id === itemId
              ? {
                  ...row,
                  has_value: true,
                  value_text: value.value_text,
                  value_number: value.value_number,
                  value_boolean: value.value_boolean,
                  value_json: value.value_json,
                  value_date: value.value_date,
                  value_document_url: value.value_document_url,
                  version: value.version,
                  updated_at: value.created_at,
                }
              : row,
          );
        }
      })
      .addCase(setScopeContextValue.rejected, (state, action) => {
        const key = pairKey(
          action.meta.arg.scope_id,
          action.meta.arg.context_item_id,
        );
        state.savingPairs = state.savingPairs.filter((k) => k !== key);
        state.error = action.error.message ?? "Failed to save value";
      });
  },
});

export const { appendPlaceholderRow, clearScopeCache } = slice.actions;
export default slice.reducer;

type StateWithScopeValues = {
  scopeValues: ReturnType<typeof slice.reducer>;
};

export const selectValuesByScope = (
  state: StateWithScopeValues,
  scopeId: string,
): ScopeContextRow[] | undefined => state.scopeValues.byScope[scopeId];

export const selectScopeValuesLoading = (
  state: StateWithScopeValues,
  scopeId: string,
) => state.scopeValues.loadingScopes.includes(scopeId);

export const selectIsSavingPair = (
  state: StateWithScopeValues,
  scopeId: string,
  itemId: string,
) => state.scopeValues.savingPairs.includes(pairKey(scopeId, itemId));

export const selectLastSavedAt = (
  state: StateWithScopeValues,
  scopeId: string,
  itemId: string,
) => state.scopeValues.lastSavedAt[pairKey(scopeId, itemId)];

/** Build a row placeholder from a freshly-created ContextItem. */
export const makeEmptyRowFromItem = (item: ContextItem): ScopeContextRow => ({
  item_id: item.id,
  key: item.key,
  display_name: item.display_name,
  description: item.description,
  category: item.category,
  value_type: item.value_type,
  fetch_hint: item.fetch_hint,
  sensitivity: item.sensitivity,
  has_value: false,
  value_text: null,
  value_number: null,
  value_boolean: null,
  value_json: null,
  value_date: null,
  value_document_url: null,
  version: null,
  updated_at: null,
});

export const selectFilledCount = createSelector(
  [
    (state: StateWithScopeValues, scopeId: string) =>
      state.scopeValues.byScope[scopeId],
  ],
  (rows) => {
    if (!rows) return null;
    const filled = rows.filter((r) => r.has_value).length;
    return { filled, total: rows.length };
  },
);
