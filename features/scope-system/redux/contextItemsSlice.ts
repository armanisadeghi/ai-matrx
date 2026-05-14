"use client";

import {
  createSlice,
  createEntityAdapter,
  createAsyncThunk,
  createSelector,
} from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type {
  ContextValueType,
  ContextFetchHint,
  ContextSensitivity,
  ContextItemStatus,
} from "@/features/agent-context/types";

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
  display_name: string;
  description: string;
  category: string | null;
  value_type: ContextValueType;
  fetch_hint: ContextFetchHint;
  sensitivity: ContextSensitivity;
  status: ContextItemStatus | string;
  tags: string[];
  status_note?: string | null;
  review_interval_days?: number | null;
}

const adapter = createEntityAdapter<ContextItem>({
  sortComparer: (a, b) => a.display_name.localeCompare(b.display_name),
});

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

export const updateContextItem = createAsyncThunk(
  "contextItems/update",
  async (params: {
    id: string;
    display_name?: string;
    description?: string;
    category?: string | null;
    value_type?: ContextValueType;
    fetch_hint?: ContextFetchHint;
    sensitivity?: ContextSensitivity;
    tags?: string[];
    status?: ContextItemStatus;
    status_note?: string | null;
    review_interval_days?: number | null;
  }) => {
    const patch: Record<string, unknown> = {};
    if (params.display_name !== undefined)
      patch.display_name = params.display_name;
    if (params.description !== undefined) patch.description = params.description;
    if (params.category !== undefined) patch.category = params.category;
    if (params.value_type !== undefined) patch.value_type = params.value_type;
    if (params.fetch_hint !== undefined) patch.fetch_hint = params.fetch_hint;
    if (params.sensitivity !== undefined) patch.sensitivity = params.sensitivity;
    if (params.tags !== undefined) patch.tags = params.tags;
    if (params.status !== undefined) patch.status = params.status;
    if (params.status_note !== undefined) patch.status_note = params.status_note;
    if (params.review_interval_days !== undefined)
      patch.review_interval_days = params.review_interval_days;
    const { data, error } = await supabase
      .from("ctx_context_items")
      .update(patch)
      .eq("id", params.id)
      .select()
      .single();
    if (error) throw error;
    return data as ContextItem;
  },
);

export const deleteContextItem = createAsyncThunk(
  "contextItems/delete",
  async (id: string) => {
    // Soft delete to preserve historical values; matches the is_active column
    // pattern used elsewhere in ctx_context_items.
    const { error } = await supabase
      .from("ctx_context_items")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw error;
    return id;
  },
);

export const createContextItem = createAsyncThunk(
  "contextItems/create",
  async (params: {
    scope_type_id: string;
    key: string;
    display_name: string;
    value_type?: ContextValueType;
    description?: string;
    category?: string;
    fetch_hint?: ContextFetchHint;
    sensitivity?: ContextSensitivity;
    tags?: string[];
  }) => {
    const { data, error } = await supabase.rpc("create_context_item", {
      p_scope_type_id: params.scope_type_id,
      p_key: params.key,
      p_display_name: params.display_name,
      p_value_type: params.value_type ?? "string",
      p_description: params.description ?? "",
      p_category: params.category ?? undefined,
      p_fetch_hint: params.fetch_hint ?? "on_demand",
      p_sensitivity: params.sensitivity ?? "internal",
      p_tags: params.tags ?? [],
    });
    if (error) throw error;
    return data as ContextItem;
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

export const selectItemsByType = createSelector(
  [
    selectAllContextItems,
    (_state: StateWithContextItems, typeId: string) => typeId,
  ],
  (items, typeId) => items.filter((i) => i.scope_type_id === typeId),
);

export const selectItemsLoadedForType = (
  state: StateWithContextItems,
  typeId: string,
) => state.contextItems.loadedTypes.includes(typeId);
