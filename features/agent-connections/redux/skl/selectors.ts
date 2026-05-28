import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import type {
  ShortcutCategoryRow,
  SklRenderComponent,
  SklRenderDefinition,
  SklResource,
} from "./types";

// ─── Base slice selector ────────────────────────────────────────────────────

const selectSkl = (state: RootState) => state.skl;

// NOTE — May 2026: skill-definition + category selectors moved to
// `features/skills/redux/skillsSelectors.ts`. This file now serves
// render-blocks, render-components, render-block-categories, and
// resources only. The replacements are:
//
//   selectAllSkillDefinitions      → selectAllSkills
//   selectSkillDefinitionsStatus   → selectSkillsStatus
//   selectSkillDefinitionsByType   → makeSelectSkillsByType
//   selectSkillDefinitionsGrouped  → selectSkillsGroupedByType
//   selectSkillDefinitionsCount    → selectSkillsCount
//   selectAllCategories            → selectAllCategories (new slice)

// ─── Render Definitions ─────────────────────────────────────────────────────

export const selectAllRenderDefinitions = createSelector(
  [selectSkl],
  (skl): SklRenderDefinition[] =>
    skl.renderDefinitions.allIds
      .map((id) => skl.renderDefinitions.byId[id])
      .filter((d): d is SklRenderDefinition => Boolean(d)),
);

export const selectRenderDefinitionsStatus = (state: RootState) =>
  state.skl.renderDefinitions.status;

export const selectRenderDefinitionById =
  (id: string | null) =>
  (state: RootState): SklRenderDefinition | null =>
    id ? (state.skl.renderDefinitions.byId[id] ?? null) : null;

export const selectActiveRenderDefinitionId = (state: RootState) =>
  state.skl.renderDefinitions.activeId;

export const selectRenderDefinitionsByCategory = createSelector(
  [selectAllRenderDefinitions],
  (defs): Record<string, SklRenderDefinition[]> => {
    const out: Record<string, SklRenderDefinition[]> = { __uncategorized: [] };
    for (const d of defs) {
      const key = d.categoryId ?? "__uncategorized";
      if (!out[key]) out[key] = [];
      out[key].push(d);
    }
    return out;
  },
);

// ─── Render Components ──────────────────────────────────────────────────────

export const selectRenderComponentsForDefinition =
  (renderDefinitionId: string | null) =>
  (state: RootState): SklRenderComponent[] => {
    if (!renderDefinitionId) return [];
    const ids =
      state.skl.renderComponents.byRenderDefinitionId[renderDefinitionId] ?? [];
    return ids
      .map((id) => state.skl.renderComponents.byId[id])
      .filter((c): c is SklRenderComponent => Boolean(c));
  };

// ─── Render-Block categories (still shortcut_categories) ───────────────────

export const selectAllRenderBlockCategories = createSelector(
  [selectSkl],
  (skl): ShortcutCategoryRow[] =>
    skl.renderBlockCategories.allIds
      .map((id) => skl.renderBlockCategories.byId[id])
      .filter((c): c is ShortcutCategoryRow => Boolean(c)),
);

export interface CategoryTreeNode<TCategory = ShortcutCategoryRow> {
  category: TCategory;
  children: CategoryTreeNode<TCategory>[];
}

/**
 * Build a tree from flat category rows honoring parent_category_id.
 * Category rows without a parent (or with unknown parent) become roots.
 */
export const selectRenderBlockCategoryTree = createSelector(
  [selectAllRenderBlockCategories],
  (rows): CategoryTreeNode[] => {
    const byId = new Map<string, CategoryTreeNode>();
    for (const row of rows) {
      byId.set(row.id, { category: row, children: [] });
    }
    const roots: CategoryTreeNode[] = [];
    for (const node of byId.values()) {
      const parentId = node.category.parentCategoryId;
      if (parentId && byId.has(parentId)) {
        byId.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    const sortNodes = (list: CategoryTreeNode[]) => {
      list.sort(
        (a, b) =>
          a.category.sortOrder - b.category.sortOrder ||
          a.category.label.localeCompare(b.category.label),
      );
      for (const n of list) sortNodes(n.children);
    };
    sortNodes(roots);
    return roots;
  },
);

// ─── Resources ──────────────────────────────────────────────────────────────

export const selectAllResources = createSelector(
  [selectSkl],
  (skl): SklResource[] =>
    skl.resources.allIds
      .map((id) => skl.resources.byId[id])
      .filter((r): r is SklResource => Boolean(r)),
);

export const selectResourcesForSkill =
  (skillId: string | null) =>
  (state: RootState): SklResource[] => {
    if (!skillId) return [];
    const ids = state.skl.resources.bySkillId[skillId] ?? [];
    return ids
      .map((id) => state.skl.resources.byId[id])
      .filter((r): r is SklResource => Boolean(r));
  };

export const selectResourcesStatus = (state: RootState) =>
  state.skl.resources.status;

// ─── Counts (for the sidebar) ───────────────────────────────────────────────

export const selectRenderDefinitionsCount = createSelector(
  [selectSkl],
  (skl) => skl.renderDefinitions.allIds.length,
);

export const selectResourcesCount = createSelector(
  [selectSkl],
  (skl) => skl.resources.allIds.length,
);
