"use client";

import {
  createSlice,
  createEntityAdapter,
  createAsyncThunk,
  createSelector,
  PayloadAction,
} from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { Scope } from "./types";
import { isUuid } from "@/features/scope-system/utils/slugify";

const scopesAdapter = createEntityAdapter<Scope>({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

interface ScopesExtraState {
  loading: boolean;
  error: string | null;
  loadedFilters: string[];
}

const initialState = scopesAdapter.getInitialState<ScopesExtraState>({
  loading: false,
  error: null,
  loadedFilters: [],
});

export const fetchScopes = createAsyncThunk(
  "scopes/fetch",
  async (params: {
    org_id: string;
    type_id?: string;
    parent_scope_id?: string;
  }) => {
    const { data, error } = await supabase.rpc("list_scopes", {
      p_org_id: params.org_id,
      p_type_id: params.type_id ?? undefined,
      p_parent_scope_id: params.parent_scope_id ?? undefined,
    });
    if (error) throw error;
    const filterKey = `${params.org_id}:${params.type_id ?? "all"}:${params.parent_scope_id ?? "root"}`;
    return { filterKey, scopes: data as Scope[] };
  },
);

export const fetchScopeTree = createAsyncThunk(
  "scopes/fetchTree",
  async (params: { org_id: string; type_id?: string }) => {
    const { data, error } = await supabase.rpc("get_scope_tree", {
      p_org_id: params.org_id,
      p_type_id: params.type_id ?? undefined,
    });
    if (error) throw error;
    const flatten = (nodes: Scope[]): Scope[] =>
      nodes.flatMap((node: Scope & { children?: Scope[] }) => [
        node,
        ...flatten(node.children ?? []),
      ]);
    return flatten(data as (Scope & { children?: Scope[] })[]);
  },
);

export const createScope = createAsyncThunk(
  "scopes/create",
  async (params: {
    org_id: string;
    type_id: string;
    name: string;
    parent_scope_id?: string;
    description?: string;
    settings?: Record<string, unknown>;
    slug?: string;
  }) => {
    const { data, error } = await supabase.rpc("create_scope", {
      p_org_id: params.org_id,
      p_type_id: params.type_id,
      p_name: params.name,
      p_parent_scope_id: params.parent_scope_id ?? undefined,
      p_description: params.description ?? "",
      p_settings: params.settings ?? {},
      p_slug: params.slug ?? undefined,
    });
    if (error) throw error;
    return data as Scope;
  },
);

export const updateScope = createAsyncThunk(
  "scopes/update",
  async (params: {
    scope_id: string;
    name?: string;
    description?: string;
    settings?: Record<string, unknown>;
    slug?: string;
  }) => {
    const { data, error } = await supabase.rpc("update_scope", {
      p_scope_id: params.scope_id,
      p_name: params.name,
      p_description: params.description,
      p_settings: params.settings,
      p_slug: params.slug,
    });
    if (error) throw error;
    return data as Scope;
  },
);

export const deleteScope = createAsyncThunk(
  "scopes/delete",
  async (scopeId: string) => {
    const { data, error } = await supabase.rpc("delete_scope", {
      p_scope_id: scopeId,
    });
    if (error) throw error;
    return { id: scopeId, ...(data as Record<string, unknown>) };
  },
);

export const searchScopes = createAsyncThunk(
  "scopes/search",
  async (params: { org_id: string; query: string; type_id?: string }) => {
    const { data, error } = await supabase.rpc("search_scopes", {
      p_org_id: params.org_id,
      p_query: params.query,
      p_type_id: params.type_id ?? undefined,
    });
    if (error) throw error;
    return data as Scope[];
  },
);

const scopesSlice = createSlice({
  name: "scopes",
  initialState,
  reducers: {
    /**
     * Hydrate scopes from get_user_full_context response.
     * Called by the hierarchy thunk after a successful full-context fetch.
     */
    hydrateFromFullContext(
      state,
      action: PayloadAction<{ orgId: string; scopes: Scope[] }[]>,
    ) {
      for (const { orgId, scopes } of action.payload) {
        scopesAdapter.upsertMany(state, scopes);
        const filterKey = `${orgId}:all:root`;
        if (!state.loadedFilters.includes(filterKey)) {
          state.loadedFilters.push(filterKey);
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchScopes.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchScopes.fulfilled, (state, action) => {
        state.loading = false;
        scopesAdapter.upsertMany(state, action.payload.scopes);
        if (!state.loadedFilters.includes(action.payload.filterKey)) {
          state.loadedFilters.push(action.payload.filterKey);
        }
      })
      .addCase(fetchScopes.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? "Failed to fetch scopes";
      })
      .addCase(fetchScopeTree.fulfilled, (state, action) => {
        scopesAdapter.upsertMany(state, action.payload);
      })
      .addCase(createScope.fulfilled, (state, action) => {
        scopesAdapter.addOne(state, action.payload);
      })
      .addCase(updateScope.fulfilled, (state, action) => {
        scopesAdapter.upsertOne(state, action.payload);
      })
      .addCase(deleteScope.fulfilled, (state, action) => {
        scopesAdapter.removeOne(state, action.payload.id);
      })
      .addCase(searchScopes.fulfilled, (state, action) => {
        scopesAdapter.upsertMany(state, action.payload);
      });
  },
});

export const { hydrateFromFullContext: hydrateScopesFromContext } =
  scopesSlice.actions;

export default scopesSlice.reducer;

type StateWithScopes = { scopes: ReturnType<typeof scopesSlice.reducer> };

const adapterSelectors = scopesAdapter.getSelectors(
  (state: StateWithScopes) => state.scopes,
);

export const selectAllScopes = adapterSelectors.selectAll;
export const selectScopeById = adapterSelectors.selectById;
export const selectScopeIds = adapterSelectors.selectIds;

export const selectScopesLoading = (state: StateWithScopes) =>
  state.scopes.loading;

/** True once `fetchScopes({org_id, type_id})` (root) has completed — distinguishes "loading" from "not found". */
export const selectScopesLoadedForType = (
  state: StateWithScopes,
  orgId: string,
  typeId: string,
) => state.scopes.loadedFilters.includes(`${orgId}:${typeId}:root`);
export const selectScopesError = (state: StateWithScopes) => state.scopes.error;

export const selectScopesByOrg = createSelector(
  [selectAllScopes, (_state: StateWithScopes, orgId: string) => orgId],
  (scopes, orgId) => scopes.filter((s) => s.organization_id === orgId),
);

export const selectScopesByType = createSelector(
  [selectAllScopes, (_state: StateWithScopes, typeId: string) => typeId],
  (scopes, typeId) => scopes.filter((s) => s.scope_type_id === typeId),
);

/**
 * Resolve a route segment (UUID or kebab slug) to a scope within a scope type.
 * Slugs are unique per scope type; ids are globally unique.
 */
export const selectScopeBySlugOrId = createSelector(
  [
    selectAllScopes,
    (_s: StateWithScopes, typeId: string | undefined) => typeId,
    (_s: StateWithScopes, _typeId: string | undefined, slugOrId: string) =>
      slugOrId,
  ],
  (scopes, typeId, slugOrId) =>
    isUuid(slugOrId)
      ? scopes.find((s) => s.id === slugOrId)
      : scopes.find(
          (s) => s.scope_type_id === typeId && s.slug === slugOrId,
        ),
);

export const selectChildScopes = createSelector(
  [
    selectAllScopes,
    (_state: StateWithScopes, parentScopeId: string) => parentScopeId,
  ],
  (scopes, parentScopeId) =>
    scopes.filter((s) => s.parent_scope_id === parentScopeId),
);

export const selectRootScopesByType = createSelector(
  [selectAllScopes, (_state: StateWithScopes, typeId: string) => typeId],
  (scopes, typeId) =>
    scopes.filter(
      (s) => s.scope_type_id === typeId && s.parent_scope_id === null,
    ),
);

export const selectScopeTreeByType = createSelector(
  [selectAllScopes, (_state: StateWithScopes, typeId: string) => typeId],
  (scopes, typeId) => {
    const typeScopes = scopes.filter((s) => s.scope_type_id === typeId);
    const buildTree = (
      parentId: string | null,
    ): (Scope & { children: Scope[] })[] =>
      typeScopes
        .filter((s) => s.parent_scope_id === parentId)
        .map((s) => ({ ...s, children: buildTree(s.id) }));
    return buildTree(null);
  },
);

export const selectScopeBreadcrumb = createSelector(
  [selectAllScopes, (_state: StateWithScopes, scopeId: string) => scopeId],
  (scopes, scopeId) => {
    const scopeMap = new Map(scopes.map((s) => [s.id, s]));
    const chain: Scope[] = [];
    let current = scopeMap.get(scopeId);
    while (current) {
      chain.unshift(current);
      current = current.parent_scope_id
        ? scopeMap.get(current.parent_scope_id)
        : undefined;
    }
    return chain;
  },
);

export const selectScopeNameMap = createSelector(
  [selectAllScopes, (_state: StateWithScopes, orgId: string) => orgId],
  (scopes, orgId) =>
    Object.fromEntries(
      scopes
        .filter((s) => s.organization_id === orgId)
        .map((s) => [s.id, s.name]),
    ),
);
