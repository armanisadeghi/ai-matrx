// features/scopes/hooks/useCategories.ts
//
// Public hook for the canonical faceted taxonomy (`platform.categories`) — the
// one primitive any UI consumes to read and manage categories for a facet
// (`dimension`). The sibling of `useAssociations`: that hook owns an entity's
// assignment EDGES, this hook owns the category NOUNS for a dimension.
//
// On mount / dimension-change it lazily loads that facet's categories
// (idempotent — no refetch unless `reload()` is called). It returns the cached
// categories plus a bound `create` dispatcher. React Compiler is ON, so nothing
// here is hand-memoized.
//
// This is what components reach for; they should never touch the slice, the
// thunks, or `categoriesService` directly. ASSIGNING a category to an entity is
// a separate concern — use `useAssociations(...).add({ targetType: 'category' })`.

"use client";

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectCategoriesFor } from "@/features/scopes/redux/selectors/categories";
import {
  createCategory as createCategoryThunk,
  deleteCategory as deleteCategoryThunk,
  loadCategories as loadCategoriesThunk,
  reparentCategory as reparentCategoryThunk,
  updateCategory as updateCategoryThunk,
} from "@/features/scopes/redux/thunks/categories";
import type {
  CategoryCreateResult,
  CategoryMutationResult,
} from "@/features/scopes/redux/thunks/categories";
import type {
  CategoriesEntry,
  CategoryDimension,
  PlatformCategory,
} from "@/features/scopes/types";

export interface UseCategoriesArgs {
  /** The facet to read/manage (`agent-shortcut`, `skill`, `industry`, …). */
  dimension: CategoryDimension | null;
  /** Disable the auto-load on mount. Defaults to false (auto-load). */
  autoLoad?: boolean;
}

export interface UseCategoriesReturn {
  /** Every category visible to the caller in this facet (system + their orgs). */
  categories: PlatformCategory[];
  status: CategoriesEntry["status"];
  error: string | null;
  fetchedAt: number | null;
  /** Create an org category in this facet. Returns the new id on success. */
  create: (args: {
    name: string;
    orgId: string;
    parentId?: string | null;
    color?: string | null;
    icon?: string | null;
    slug?: string | null;
  }) => Promise<CategoryCreateResult>;
  /** Replace one category's editable scalar fields. */
  update: (args: {
    id: string;
    name: string;
    slug: string | null;
    color: string | null;
    icon: string | null;
    position: number | null;
  }) => Promise<CategoryMutationResult>;
  /** Move a category to the root or directly under a root category. */
  reparent: (
    id: string,
    parentId: string | null,
  ) => Promise<CategoryMutationResult>;
  /** Soft-delete a leaf category. */
  remove: (id: string) => Promise<CategoryMutationResult>;
  /** Force a refetch of this facet's categories. */
  reload: () => Promise<void>;
}

export function useCategories(args: UseCategoriesArgs): UseCategoriesReturn {
  const { dimension, autoLoad = true } = args;
  const dispatch = useAppDispatch();

  const entry = useAppSelector((s) => selectCategoriesFor(s, dimension));

  const loadedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!autoLoad || !dimension) return;
    if (loadedKey.current === dimension) return;
    loadedKey.current = dimension;
    void dispatch(loadCategoriesThunk({ dimension }));
  }, [autoLoad, dispatch, dimension]);

  return {
    categories: entry.categories,
    status: entry.status,
    error: entry.error,
    fetchedAt: entry.fetchedAt,
    create: async ({ name, orgId, parentId, color, icon, slug }) => {
      if (!dimension) return { ok: false, error: "Missing dimension" };
      return dispatch(
        createCategoryThunk({
          dimension,
          name,
          orgId,
          parentId,
          color,
          icon,
          slug,
        }),
      );
    },
    update: async ({ id, name, slug, color, icon, position }) => {
      if (!dimension) return { ok: false, error: "Missing dimension" };
      return dispatch(
        updateCategoryThunk({
          dimension,
          id,
          name,
          slug,
          color,
          icon,
          position,
        }),
      );
    },
    reparent: async (id, parentId) => {
      if (!dimension) return { ok: false, error: "Missing dimension" };
      return dispatch(reparentCategoryThunk({ dimension, id, parentId }));
    },
    remove: async (id) => {
      if (!dimension) return { ok: false, error: "Missing dimension" };
      return dispatch(deleteCategoryThunk({ dimension, id }));
    },
    reload: async () => {
      if (!dimension) return;
      await dispatch(loadCategoriesThunk({ dimension, force: true }));
    },
  };
}
