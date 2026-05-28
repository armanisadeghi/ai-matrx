/**
 * features/skills/redux/skillsSelectors.ts
 *
 * Memoized selectors over the skills slice. Per CLAUDE.md: every property
 * has its own selector; createSelector for any derivation.
 */

import { createSelector } from "@reduxjs/toolkit";

import type { RootState } from "@/lib/redux/store";
import type { AsyncStatus, CategoryRow, SkillRow, SkillType } from "../types";

// ---------------------------------------------------------------------------
// Root accessors
// ---------------------------------------------------------------------------

const selectSkillsBranch = (state: RootState) => state.skills;

export const selectSkillsById = (state: RootState) =>
  state.skills.skills.byId;
export const selectAllSkillIds = (state: RootState) =>
  state.skills.skills.allIds;
export const selectSkillsStatus = (state: RootState): AsyncStatus =>
  state.skills.skills.status;
export const selectSkillsError = (state: RootState) =>
  state.skills.skills.error;
export const selectActiveSkillId = (state: RootState) =>
  state.skills.skills.activeId;
export const selectSkillsLastIngestAt = (state: RootState) =>
  state.skills.skills.lastIngestAt;

export const selectCategoriesById = (state: RootState) =>
  state.skills.categories.byId;
export const selectAllCategoryIds = (state: RootState) =>
  state.skills.categories.allIds;
export const selectCategoriesStatus = (state: RootState): AsyncStatus =>
  state.skills.categories.status;
export const selectCategoriesError = (state: RootState) =>
  state.skills.categories.error;

export const selectIngestStatus = (state: RootState): AsyncStatus =>
  state.skills.ingest.status;
export const selectIngestError = (state: RootState) =>
  state.skills.ingest.error;
export const selectIngestLastReport = (state: RootState) =>
  state.skills.ingest.lastReport;

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------

/** Flat array of every loaded skill, in insertion order. */
export const selectAllSkills = createSelector(
  [selectSkillsById, selectAllSkillIds],
  (byId, ids): SkillRow[] => ids.map((id) => byId[id]).filter(Boolean),
);

/** Selector factory: only skills with one of the given `types`. */
export const makeSelectSkillsByType = () =>
  createSelector(
    [
      selectAllSkills,
      (_state: RootState, types: readonly SkillType[] | undefined) => types,
    ],
    (skills, types) => {
      if (!types || types.length === 0) return skills;
      const want = new Set(types);
      return skills.filter((s) => want.has(s.skillType));
    },
  );

/** Selector factory: only skills associated with a specific project. */
export const makeSelectSkillsForProject = () =>
  createSelector(
    [selectAllSkills, (_state: RootState, projectId: string | null) => projectId],
    (skills, projectId) => {
      if (!projectId) return skills;
      return skills.filter((s) => s.projectIds.includes(projectId));
    },
  );

/** Selector factory: single skill row or null. */
export const makeSelectSkillById = () =>
  createSelector(
    [selectSkillsById, (_state: RootState, skillId: string | null) => skillId],
    (byId, skillId) => (skillId ? byId[skillId] ?? null : null),
  );

/** Flat category list, in insertion order. */
export const selectAllCategories = createSelector(
  [selectCategoriesById, selectAllCategoryIds],
  (byId, ids): CategoryRow[] => ids.map((id) => byId[id]).filter(Boolean),
);

/** Top-level categories (no parent) for the tree-editor root. */
export const selectRootCategories = createSelector(
  [selectAllCategories],
  (cats) => cats.filter((c) => !c.parentCategoryId),
);

/** Selector factory: direct children of a given category. */
export const makeSelectCategoryChildren = () =>
  createSelector(
    [
      selectAllCategories,
      (_state: RootState, parentId: string | null) => parentId,
    ],
    (cats, parentId) =>
      cats.filter((c) => (c.parentCategoryId ?? null) === (parentId ?? null)),
  );

/** Total skill count — used by the agent-connections sidebar badge. */
export const selectSkillsCount = createSelector(
  [selectAllSkillIds],
  (ids) => ids.length,
);

/** Grouped-by-type for the browser view. */
export const selectSkillsGroupedByType = createSelector(
  [selectAllSkills],
  (skills) => {
    const groups: Record<string, SkillRow[]> = {};
    for (const s of skills) {
      const key = s.skillType || "reference";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    return groups;
  },
);

// Silence unused export warning when consumer only uses derived selectors.
export { selectSkillsBranch };
