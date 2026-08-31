"use client";

import { createSelector } from "reselect";
import type { RootState } from "@/lib/redux/store";
import type {
  AgentShortcutCategoryDef,
  AgentShortcutCategoryRecord,
} from "./types";
import {
  matchesScope,
  scopeIndexKey,
  type Scope,
  type ScopeRef,
} from "../shared/scope";

const selectAgentShortcutCategorySlice = (state: RootState) =>
  state.agentShortcutCategory;

export const selectAllCategoriesMap = createSelector(
  [selectAgentShortcutCategorySlice],
  (slice) => slice.categoriesById,
);

export const selectCategoryIdsByScopeMap = createSelector(
  [selectAgentShortcutCategorySlice],
  (slice) => slice.categoryIdsByScope,
);

export const selectActiveCategoryId = createSelector(
  [selectAgentShortcutCategorySlice],
  (slice) => slice.activeCategoryId,
);

export const selectCategoriesStatus = createSelector(
  [selectAgentShortcutCategorySlice],
  (slice) => slice.status,
);

export const selectCategoriesError = createSelector(
  [selectAgentShortcutCategorySlice],
  (slice) => slice.error,
);

export const selectCategoryScopeLoaded = createSelector(
  [selectAgentShortcutCategorySlice],
  (slice) => slice.scopeLoaded,
);

export const selectIsCategoryScopeLoaded = createSelector(
  [
    selectCategoryScopeLoaded,
    (_s: RootState, scope: Scope, scopeId?: string | null) =>
      scopeIndexKey({ scope, scopeId: scopeId ?? null }),
  ],
  (scopeLoaded, key) => scopeLoaded[key] ?? false,
);

export const selectAllCategoriesArray = createSelector(
  [selectAllCategoriesMap],
  (map): AgentShortcutCategoryRecord[] => Object.values(map),
);

export const selectCategoryById = createSelector(
  [selectAllCategoriesMap, (_s: RootState, id: string) => id],
  (map, id): AgentShortcutCategoryRecord | undefined => map[id],
);

export const selectCategoryDefinition = createSelector(
  [selectCategoryById],
  (record): AgentShortcutCategoryDef | undefined => {
    if (!record) return undefined;
    const {
      _dirty,
      _dirtyFields,
      _fieldHistory,
      _loadedFields,
      _loading,
      _error,
      ...definition
    } = record;
    return definition;
  },
);

export const selectCategoryIsDirty = createSelector(
  [selectCategoryById],
  (record): boolean => record?._dirty ?? false,
);

export const selectCategoryIsLoading = createSelector(
  [selectCategoryById],
  (record): boolean => record?._loading ?? false,
);

export const selectCategoryError = createSelector(
  [selectCategoryById],
  (record): string | null => record?._error ?? null,
);

export const selectCategoriesByScope = createSelector(
  [
    selectAllCategoriesArray,
    (_s: RootState, scope: Scope, _scopeId?: string | null) => scope,
    (_s: RootState, _scope: Scope, scopeId?: string | null) => scopeId ?? null,
  ],
  (categories, scope, scopeId): AgentShortcutCategoryRecord[] =>
    categories.filter((c) =>
      matchesScope(c, { scope, scopeId: scopeId ?? null }),
    ),
);

export const selectCategoriesByPlacementType = createSelector(
  [
    selectAllCategoriesArray,
    (_s: RootState, placementType: string) => placementType,
  ],
  (categories, placementType) =>
    categories.filter((c) => c.placementType === placementType),
);

export interface CategoryTree {
  roots: AgentShortcutCategoryRecord[];
  childrenByParentId: Record<string, AgentShortcutCategoryRecord[]>;
  flat: AgentShortcutCategoryRecord[];
}

export function compareCategoryOrder(
  a: AgentShortcutCategoryRecord,
  b: AgentShortcutCategoryRecord,
): number {
  return (
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
    (a.label ?? "").localeCompare(b.label ?? "")
  );
}

export const selectCategoryTreeByScope = createSelector(
  [selectCategoriesByScope],
  (categories): AgentShortcutCategoryRecord[] => {
    return [...categories].sort(compareCategoryOrder);
  },
);

export const selectCategoryTreeStructuredByScope = createSelector(
  [selectCategoriesByScope],
  (categories): CategoryTree => {
    const roots: AgentShortcutCategoryRecord[] = [];
    const byParent: Record<string, AgentShortcutCategoryRecord[]> = {};
    categories.forEach((c) => {
      if (c.parentCategoryId) {
        if (!byParent[c.parentCategoryId]) byParent[c.parentCategoryId] = [];
        byParent[c.parentCategoryId].push(c);
      } else {
        roots.push(c);
      }
    });
    roots.sort(compareCategoryOrder);
    Object.values(byParent).forEach((list) =>
      list.sort(compareCategoryOrder),
    );
    const flat = [...categories].sort(compareCategoryOrder);
    return { roots, childrenByParentId: byParent, flat };
  },
);

export const selectCategoriesByScopeRef = createSelector(
  [selectAllCategoriesArray, (_s: RootState, ref: ScopeRef) => ref],
  (categories, ref) => categories.filter((c) => matchesScope(c, ref)),
);

export const selectGlobalCategories = createSelector(
  [selectAllCategoriesArray],
  (categories) =>
    categories.filter(
      (c) =>
        c.userId === null &&
        c.organizationId === null &&
        c.projectId === null &&
        c.taskId === null,
    ),
);

export const selectUserCategories = createSelector(
  [selectAllCategoriesArray, (_s: RootState, userId: string) => userId],
  (categories, userId) => categories.filter((c) => c.userId === userId),
);

export const selectOrgCategories = createSelector(
  [
    selectAllCategoriesArray,
    (_s: RootState, organizationId: string) => organizationId,
  ],
  (categories, organizationId) =>
    categories.filter((c) => c.organizationId === organizationId),
);
