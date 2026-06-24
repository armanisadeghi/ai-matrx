// features/scopes/hooks/useCategories.ts
//
// Public hook for the canonical faceted taxonomy (`platform.categories`) — the
// one primitive any UI consumes to read and create categories for a facet
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
  loadCategories as loadCategoriesThunk,
} from "@/features/scopes/redux/thunks/categories";
import type { CategoryCreateResult } from "@/features/scopes/redux/thunks/categories";
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

// Single declaration lives in the thunk; re-export so consumers can keep
// importing it from the hook (doctrine forbids the duplicate definition).
export type { CategoryCreateResult };

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
    reload: async () => {
      if (!dimension) return;
      await dispatch(loadCategoriesThunk({ dimension, force: true }));
    },
  };
}
