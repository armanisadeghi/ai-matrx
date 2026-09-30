"use client";

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAllRenderDefinitions,
  selectRenderDefinitionsByCategory,
  selectRenderDefinitionsStatus,
  selectAllRenderBlockCategories,
  selectRenderBlockCategoryTree,
  type CategoryTreeNode,
} from "../redux/skl/selectors";
import { fetchRenderDefinitions, fetchRenderBlockCategories } from "../redux/skl/thunks";
import type { SklRenderDefinition, ShortcutCategoryRow } from "../redux/skl/types";

export interface UseRenderBlocksResult {
  definitions: SklRenderDefinition[];
  byCategoryId: Record<string, SklRenderDefinition[]>;
  categories: ShortcutCategoryRow[];
  categoryTree: CategoryTreeNode[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useRenderBlocks(): UseRenderBlocksResult {
  const dispatch = useAppDispatch();
  const definitions = useAppSelector(selectAllRenderDefinitions);
  const byCategoryId = useAppSelector(selectRenderDefinitionsByCategory);
  const categories = useAppSelector(selectAllRenderBlockCategories);
  const categoryTree = useAppSelector(selectRenderBlockCategoryTree);
  const defStatus = useAppSelector(selectRenderDefinitionsStatus);
  const catStatus = useAppSelector(
    (s) => s.skl.renderBlockCategories.status,
  );
  const error = useAppSelector(
    (s) => s.skl.renderDefinitions.error ?? s.skl.renderBlockCategories.error,
  );

  useEffect(() => {
    void dispatch(fetchRenderDefinitions());
    void dispatch(fetchRenderBlockCategories());
  }, [dispatch]);

  const loading = defStatus === "loading" || catStatus === "loading";

  return useMemo(
    () => ({
      definitions,
      byCategoryId,
      categories,
      categoryTree,
      loading,
      error,
      reload: () => {
        void dispatch(fetchRenderDefinitions());
        void dispatch(fetchRenderBlockCategories());
      },
    }),
    [
      definitions,
      byCategoryId,
      categories,
      categoryTree,
      loading,
      error,
      dispatch,
    ],
  );
}
