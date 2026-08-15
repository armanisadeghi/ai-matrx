// features/scopes/redux/thunks/categories.ts
//
// Thunks for the canonical faceted taxonomy (`platform.categories`). They read
// and write ONLY via `categoriesService` (the sole RPC chokepoint) and keep the
// `scopesTree.categoriesByDimension` cache coherent. The sibling of
// `thunks/associations.ts`: that owns the assignment EDGES, this owns the
// category NOUNS.
//
// Like the association thunks, these NEVER touch appContextSlice — a category
// is reference data, not the user's active working context.

import type { ThunkAction, UnknownAction } from "@reduxjs/toolkit";
import { categoriesService } from "@/features/scopes/service/categoriesService";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { RootState } from "@/lib/redux/rootReducer";
import type { CategoryDimension, PlatformCategory } from "@/features/scopes/types";

type AppThunk<R = void> = ThunkAction<R, RootState, unknown, UnknownAction>;

const inFlight = new Map<string, Promise<void>>();

export interface CategoryMutationResult {
  ok: boolean;
  /** Set on a successful mutation. */
  id?: string;
  error?: string;
}

export type CategoryCreateResult = CategoryMutationResult;

/**
 * Lazy load of every category in `dimension` (system + the caller's orgs).
 * Deduped per dimension; `status === "ready"` short-circuits unless `force`.
 */
export function loadCategories(args: {
  dimension: CategoryDimension;
  force?: boolean;
}): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const { dimension, force = false } = args;
    if (!dimension) return;
    const entry = getState().scopesTree.categoriesByDimension[dimension];

    if (!force && entry?.status === "ready") return;
    if (!force && entry?.status === "loading" && inFlight.has(dimension)) {
      return inFlight.get(dimension);
    }

    dispatch(scopesActions.categoriesFetchPending({ dimension }));

    const promise = (async () => {
      try {
        const res = await categoriesService.list(dimension);
        if (isScopesRpcErr(res)) {
          dispatch(
            scopesActions.categoriesFetchRejected({
              dimension,
              error: res.error.message,
            }),
          );
        } else {
          dispatch(
            scopesActions.categoriesFetchFulfilled({
              dimension,
              categories: res.data.categories,
            }),
          );
        }
      } finally {
        inFlight.delete(dimension);
      }
    })();

    inFlight.set(dimension, promise);
    return promise;
  };
}

/**
 * Create an org category in `dimension`, then reload that dimension so the new
 * row (with its server-assigned id/slug) is in the cache. Returns the new id.
 */
export function createCategory(args: {
  dimension: CategoryDimension;
  name: string;
  orgId: string;
  parentId?: string | null;
  color?: string | null;
  icon?: string | null;
  slug?: string | null;
}): AppThunk<Promise<CategoryCreateResult>> {
  return async (dispatch) => {
    const res = await categoriesService.create(args);
    if (isScopesRpcErr(res)) {
      return { ok: false, error: res.error.message };
    }
    // Optimistic echo so the new id shows immediately, then force-reload to
    // pick up server-derived fields (slug, position) authoritatively.
    const optimistic: PlatformCategory = {
      id: res.data.id,
      orgId: args.orgId,
      dimension: args.dimension,
      name: args.name,
      slug: args.slug ?? null,
      parentId: args.parentId ?? null,
      isSystem: false,
      color: args.color ?? null,
      icon: args.icon ?? null,
      position: null,
    };
    dispatch(
      scopesActions.categoryCreated({
        dimension: args.dimension,
        category: optimistic,
      }),
    );
    await dispatch(loadCategories({ dimension: args.dimension, force: true }));
    return { ok: true, id: res.data.id };
  };
}

/** Replace one category's editable scalar fields, then refresh its facet. */
export function updateCategory(args: {
  dimension: CategoryDimension;
  id: string;
  name: string;
  slug: string | null;
  color: string | null;
  icon: string | null;
  position: number | null;
}): AppThunk<Promise<CategoryMutationResult>> {
  return async (dispatch) => {
    const res = await categoriesService.update(args);
    if (isScopesRpcErr(res)) {
      return { ok: false, error: res.error.message };
    }
    await dispatch(loadCategories({ dimension: args.dimension, force: true }));
    return { ok: true, id: res.data.id };
  };
}

/** Move one category to the root or directly beneath a root category. */
export function reparentCategory(args: {
  dimension: CategoryDimension;
  id: string;
  parentId: string | null;
}): AppThunk<Promise<CategoryMutationResult>> {
  return async (dispatch) => {
    const res = await categoriesService.reparent(args);
    if (isScopesRpcErr(res)) {
      return { ok: false, error: res.error.message };
    }
    await dispatch(loadCategories({ dimension: args.dimension, force: true }));
    return { ok: true, id: res.data.id };
  };
}

/** Soft-delete one leaf category, then refresh its facet. */
export function deleteCategory(args: {
  dimension: CategoryDimension;
  id: string;
}): AppThunk<Promise<CategoryMutationResult>> {
  return async (dispatch) => {
    const res = await categoriesService.delete(args.id);
    if (isScopesRpcErr(res)) {
      return { ok: false, error: res.error.message };
    }
    await dispatch(loadCategories({ dimension: args.dimension, force: true }));
    return { ok: true, id: res.data.id };
  };
}
