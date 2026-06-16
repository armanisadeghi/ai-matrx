"use client";

import {
  createSlice,
  createEntityAdapter,
  createAsyncThunk,
  createSelector,
  PayloadAction,
} from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { ScopeType } from "./types";
import { isUuid } from "@/features/scope-system/utils/slugify";

const scopeTypesAdapter = createEntityAdapter<ScopeType>({
  sortComparer: (a, b) => a.sort_order - b.sort_order,
});

interface ScopeTypesExtraState {
  loading: boolean;
  error: string | null;
  loadedOrgs: string[];
}

const initialState = scopeTypesAdapter.getInitialState<ScopeTypesExtraState>({
  loading: false,
  error: null,
  loadedOrgs: [],
});

export const fetchScopeTypes = createAsyncThunk(
  "scopeTypes/fetch",
  async (orgId: string) => {
    const { data, error } = await supabase.rpc("list_scope_types", {
      p_org_id: orgId,
    });
    if (error) throw error;
    return { orgId, types: data as ScopeType[] };
  },
);

export const createScopeType = createAsyncThunk(
  "scopeTypes/create",
  async (params: {
    org_id: string;
    label_singular: string;
    label_plural: string;
    parent_type_id?: string;
    icon?: string;
    description?: string;
    sort_order?: number;
    max_assignments?: number;
    default_variable_keys?: string[];
    color?: string;
    slug?: string;
  }) => {
    const { data, error } = await supabase.rpc("create_scope_type", {
      p_org_id: params.org_id,
      p_label_singular: params.label_singular,
      p_label_plural: params.label_plural,
      p_parent_type_id: params.parent_type_id ?? undefined,
      p_icon: params.icon ?? "folder",
      p_description: params.description ?? "",
      p_sort_order: params.sort_order ?? 0,
      p_max_assignments: params.max_assignments ?? undefined,
      p_default_variable_keys: params.default_variable_keys ?? [],
      p_color: params.color ?? undefined,
      p_slug: params.slug ?? undefined,
    });
    if (error) throw error;
    return data as ScopeType;
  },
);

export const updateScopeType = createAsyncThunk(
  "scopeTypes/update",
  async (params: {
    type_id: string;
    label_singular?: string;
    label_plural?: string;
    icon?: string;
    description?: string;
    sort_order?: number;
    max_assignments?: number;
    color?: string;
    slug?: string;
  }) => {
    const { data, error } = await supabase.rpc("update_scope_type", {
      p_type_id: params.type_id,
      p_label_singular: params.label_singular,
      p_label_plural: params.label_plural,
      p_icon: params.icon,
      p_description: params.description,
      p_sort_order: params.sort_order,
      p_max_assignments: params.max_assignments,
      p_color: params.color,
      p_slug: params.slug,
    });
    if (error) throw error;
    return data as ScopeType;
  },
);

export const deleteScopeType = createAsyncThunk(
  "scopeTypes/delete",
  async (typeId: string) => {
    const { data, error } = await supabase.rpc("delete_scope_type", {
      p_type_id: typeId,
    });
    if (error) throw error;
    return { id: typeId, ...(data as Record<string, unknown>) };
  },
);

/**
 * Set a scope type's is_system flag (platform-global). Super-admin only — enforced by the
 * admin_set_scope_type_system RPC (the FE can't gate this; a non-super-admin gets a 403-ish
 * error which the caller surfaces as a toast). list_scope_types already returns is_system.
 */
export const setScopeTypeSystem = createAsyncThunk(
  "scopeTypes/setSystem",
  async (params: { type_id: string; is_system: boolean }) => {
    const { data, error } = await supabase.rpc("admin_set_scope_type_system", {
      p_scope_type_id: params.type_id,
      p_is_system: params.is_system,
    });
    if (error) throw error;
    return data as ScopeType;
  },
);

const scopeTypesSlice = createSlice({
  name: "scopeTypes",
  initialState,
  reducers: {
    /**
     * Hydrate scope types from get_user_full_context response.
     * Called by the hierarchy thunk after a successful full-context fetch.
     */
    hydrateFromFullContext(
      state,
      action: PayloadAction<{ orgId: string; types: ScopeType[] }[]>,
    ) {
      for (const { orgId, types } of action.payload) {
        scopeTypesAdapter.upsertMany(state, types);
        if (!state.loadedOrgs.includes(orgId)) {
          state.loadedOrgs.push(orgId);
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchScopeTypes.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchScopeTypes.fulfilled, (state, action) => {
        state.loading = false;
        scopeTypesAdapter.upsertMany(state, action.payload.types);
        if (!state.loadedOrgs.includes(action.payload.orgId)) {
          state.loadedOrgs.push(action.payload.orgId);
        }
      })
      .addCase(fetchScopeTypes.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to fetch scope types";
      })
      .addCase(createScopeType.fulfilled, (state, action) => {
        scopeTypesAdapter.addOne(state, action.payload);
      })
      .addCase(updateScopeType.fulfilled, (state, action) => {
        scopeTypesAdapter.upsertOne(state, action.payload);
      })
      .addCase(setScopeTypeSystem.fulfilled, (state, action) => {
        scopeTypesAdapter.upsertOne(state, action.payload);
      })
      .addCase(deleteScopeType.fulfilled, (state, action) => {
        scopeTypesAdapter.removeOne(state, action.payload.id);
      });
  },
});

export const { hydrateFromFullContext: hydrateScopeTypesFromContext } =
  scopeTypesSlice.actions;

export default scopeTypesSlice.reducer;

type StateWithScopeTypes = {
  scopeTypes: ReturnType<typeof scopeTypesSlice.reducer>;
};

const adapterSelectors = scopeTypesAdapter.getSelectors(
  (state: StateWithScopeTypes) => state.scopeTypes,
);

export const selectAllScopeTypes = adapterSelectors.selectAll;
export const selectScopeTypeById = adapterSelectors.selectById;
export const selectScopeTypeIds = adapterSelectors.selectIds;

export const selectScopeTypesLoading = (state: StateWithScopeTypes) =>
  state.scopeTypes.loading;

/** True once `fetchScopeTypes(orgId)` has completed — lets callers tell "loading" from "not found". */
export const selectScopeTypesLoadedForOrg = (
  state: StateWithScopeTypes,
  orgId: string,
) => state.scopeTypes.loadedOrgs.includes(orgId);
export const selectScopeTypesError = (state: StateWithScopeTypes) =>
  state.scopeTypes.error;

export const selectScopeTypesByOrg = createSelector(
  [selectAllScopeTypes, (_state: StateWithScopeTypes, orgId: string) => orgId],
  // is_system scope types are PLATFORM infrastructure (the "Environment" home for ambient
  // items, etc.) — they live under a real org for FK reasons but must NOT appear in that
  // org's normal scope management. They're managed via the admin surface, not here.
  (types, orgId) => types.filter((t) => t.organization_id === orgId && !t.is_system),
);

/**
 * Resolve a route segment that is EITHER a UUID or a kebab slug to a scope type
 * within the given org. Slugs are unique per org; ids are globally unique.
 */
export const selectScopeTypeBySlugOrId = createSelector(
  [
    selectAllScopeTypes,
    (_s: StateWithScopeTypes, orgId: string) => orgId,
    (_s: StateWithScopeTypes, _orgId: string, slugOrId: string) => slugOrId,
  ],
  (types, orgId, slugOrId) =>
    isUuid(slugOrId)
      ? types.find((t) => t.id === slugOrId)
      : types.find((t) => t.organization_id === orgId && t.slug === slugOrId),
);

export const selectTopLevelScopeTypes = createSelector(
  [selectAllScopeTypes, (_state: StateWithScopeTypes, orgId: string) => orgId],
  (types, orgId) =>
    types.filter(
      (t) =>
        t.organization_id === orgId &&
        t.parent_type_id === null &&
        !t.is_system,
    ),
);

export const selectChildScopeTypes = createSelector(
  [
    selectAllScopeTypes,
    (_state: StateWithScopeTypes, parentTypeId: string) => parentTypeId,
  ],
  (types, parentTypeId) =>
    types.filter((t) => t.parent_type_id === parentTypeId),
);

const EMPTY_SCOPE_TYPE_LABEL_MAP: Record<string, string> = {};

export const selectScopeTypeLabelMap = createSelector(
  [selectAllScopeTypes, (_state: StateWithScopeTypes, orgId: string) => orgId],
  (types, orgId) => {
    const entries = types
      .filter((t) => t.organization_id === orgId)
      .map((t) => [t.id, t.label_singular] as const);
    return entries.length === 0
      ? EMPTY_SCOPE_TYPE_LABEL_MAP
      : Object.fromEntries(entries);
  },
);
