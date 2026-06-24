// features/scopes/redux/selectors/categories.ts
//
// Selectors over the `scopesTree.categoriesByDimension` cache — the canonical
// faceted taxonomy (`platform.categories`). Consumers pass the `dimension`
// (the facet); the selector returns that facet's cache entry.
//
// Memoized via createSelector and keyed by `dimension`, so repeated reads for
// the same facet reuse the same `CategoriesEntry` reference and the idle
// default is stable (never a fresh object per render).

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import type { CategoriesEntry } from "@/features/scopes/types";

const idleEntry: CategoriesEntry = {
  status: "idle",
  categories: [],
  fetchedAt: null,
  error: null,
};

const selectCategoriesByDimension = (state: RootState) =>
  state.scopesTree.categoriesByDimension;

/**
 * The `CategoriesEntry` for one `dimension` (every category visible to the
 * caller for that facet), or a stable idle default when nothing is cached yet.
 */
export const selectCategoriesFor = createSelector(
  selectCategoriesByDimension,
  (_: RootState, dimension: string | null | undefined) => dimension,
  (byDimension, dimension): CategoriesEntry => {
    if (!dimension) return idleEntry;
    return byDimension[dimension] ?? idleEntry;
  },
);
