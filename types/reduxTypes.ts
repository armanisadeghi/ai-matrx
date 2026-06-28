// types/reduxTypes.ts
//
// BUILD-TIME OPTIMIZATION CONTRACT
// --------------------------------
// This file is imported by EVERY layout (authenticated, a, public, ssr,
// legacy, EntityProviders, Providers) plus the redux store factories and
// many slice creators. Under `isolatedModules: true`, named imports
// without the `type` keyword force SWC to keep the module reference, which
// means Turbopack walks the target module for every chunk that touches
// this file.
//
// EVERY import here MUST be `import type` unless the symbol is actually
// used at runtime. `Database` is the entrypoint to the 24k-line
// `database.types.ts`; `GlobalCacheState` reaches `globalCacheSlice.ts`
// which pulls `@reduxjs/toolkit` + the 115k-line `initialSchemas.ts` via
// type-only deletes them from the slim path's static graph entirely.
import type { Database } from "@/types/database.types";
import type { UserData } from "@/utils/userDataMapper";
import type { ContextMenuRow } from "@/utils/supabase/ssrShellData";

/**
 * Bootstrap state for the slim store (`makeStore`). Used by all routes that
 * do NOT depend on the legacy entity system (~95% of the app). Contains no
 * `globalCache` and no entity slices.
 */
export interface BaseReduxState {
  user: UserData;
  // Preferences are no longer fetched server-side; the
  // `userPreferencesPolicy` warm-cache cold-boot path (IDB → LS → remote.fetch)
  // owns hydration entirely on the client. `resolveStoreBootstrapState` falls
  // back to `initializeUserPreferencesState(defaultUserPreferences)` when absent.
  userPreferences?: Record<string, any>;
  // Optional SSR pre-population.
  // contextMenuCache shape matches ContextMenuCacheState exactly — safe as preloaded state.
  // modelRegistry and sms need action-based hydration (their shapes don't match raw arrays)
  // so they are handled by SsrShellHydrator client island, not preloaded state.
  contextMenuCache?: { rows: ContextMenuRow[]; hydrated: boolean };
  agentContextMenuCache?: { rows: ContextMenuRow[]; hydrated: boolean };
}

/**
 * @deprecated Migration alias — use `EntityReduxState` for entity routes or
 * `BaseReduxState` for slim routes. Removed in Phase 5 of the entity-isolation
 * migration (see `~/.claude/plans/the-entity-system-which-bubbly-wind.md`).
 */
export interface InitialReduxState extends BaseReduxState {}

export type Id = string;
export type Page = number;
export type PageSize = number;
export type IncludeAllIdsNames = boolean;
export type ConversionFunction = string;
export type Ids = string[];
export type Payload = Record<string, any>;
export type UpdateFunction = string;
export type CreateFunction = string;
export type FeatureName = string;

// RPC function types
export type RpcFetchOneType =
  Database["public"]["Functions"]["fetch_all_fk_ifk"];
export type RpcFetchPaginatedType =
  Database["public"]["Functions"]["fetch_paginated_with_all_ids"];
export type RpcDeleteType = Database["public"]["Functions"]["delete_by_id"];
export type RpcUpdateType = Database["public"]["Functions"]["update_by_id"];
export type RpcCreateType = Database["public"]["Functions"]["add_one_entry"];
export type RpcFetchCustomRelsType =
  Database["public"]["Functions"]["fetch_custom_rels"];

// Thunk argument interfaces
export interface FetchOneThunkArgs {
  featureName: FeatureName;
  id: Id;
  tableList?: string[];
}

export interface FetchPaginatedThunkArgs {
  featureName: FeatureName;
  page: Page;
  pageSize: PageSize;
  includeAllIdsNames?: IncludeAllIdsNames;
  conversionFunction?: ConversionFunction;
}

export interface DeleteOneThunkArgs {
  featureName: FeatureName;
  id: Id;
}

export interface DeleteManyThunkArgs {
  featureName: FeatureName;
  ids: Ids;
}

export interface UpdateThunkArgs {
  featureName: FeatureName;
  payload: Payload;
  updateFunction?: UpdateFunction;
}

export interface CreateThunkArgs {
  featureName: FeatureName;
  payload: Payload;
  createFunction?: CreateFunction;
}

export type SliceState<FeatureType> = {
  items: Record<string, FeatureType>;
  allIdAndNames: { id: string; name: string }[];
  totalCount: number;
  loading: boolean;
  error: string | null;
  lastFetched: Record<string, number>;
  staleTime: number;
  backups: Record<string, FeatureType>;
};

export interface PaginatedResponse<T> {
  page: number;
  allIdAndNames: Array<{ id: string; name: string }>;
  pageSize: number;
  totalCount: number;
  paginatedData: T[];
}

export interface DeleteResponse {
  deletedIds: string[];
}

export interface FetchCustomRelsThunkArgs {
  featureName: FeatureName;
  id: Id;
  tableList: string[];
}
