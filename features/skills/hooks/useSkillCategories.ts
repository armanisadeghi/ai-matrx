/**
 * features/skills/hooks/useSkillCategories.ts
 *
 * Loads the category tree and exposes useful slices: all categories,
 * root-level only, plus a children-of helper for the tree editor.
 */

"use client";

import { useEffect } from "react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

import {
  selectAllCategories,
  selectCategoriesError,
  selectCategoriesStatus,
  selectRootCategories,
} from "../redux/skillsSelectors";
import { fetchSkillCategories } from "../redux/skillsThunks";
import type { CategoryRow } from "../types";

export interface UseSkillCategoriesResult {
  categories: CategoryRow[];
  rootCategories: CategoryRow[];
  childrenOf: (parentId: string | null) => CategoryRow[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useSkillCategories(): UseSkillCategoriesResult {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectCategoriesStatus);
  const error = useAppSelector(selectCategoriesError);
  const categories = useAppSelector(selectAllCategories);
  const rootCategories = useAppSelector(selectRootCategories);

  useEffect(() => {
    if (status === "idle") {
      void dispatch(fetchSkillCategories());
    }
  }, [dispatch, status]);

  // The recursive tree renderer asks for children of a given category id;
  // building it once over the loaded array is cheaper than a parametric
  // selector for the typical tree size (< 100 categories).
  const childrenOf = (parentId: string | null): CategoryRow[] =>
    categories.filter(
      (c) => (c.parentCategoryId ?? null) === (parentId ?? null),
    );

  return {
    categories,
    rootCategories,
    childrenOf,
    loading: status === "loading",
    error,
    reload: async () => {
      await dispatch(fetchSkillCategories());
    },
  };
}
