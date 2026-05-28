import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  initialSklSliceState,
  type SklRenderComponent,
  type SklRenderDefinition,
  type SklResource,
  type SklSliceState,
  type ShortcutCategoryRow,
} from "./types";

// NOTE — May 2026: skill definitions + categories live at
// `features/skills/redux/skillsSlice.ts` (backed by /api/skills + Supabase
// direct). The slot is intentionally absent from this slice — render-
// blocks, render-components, render-block-categories, and resources
// remain here until their own migration.

function indexById<T extends { id: string }>(
  rows: T[],
): { byId: Record<string, T>; allIds: string[] } {
  const byId: Record<string, T> = {};
  const allIds: string[] = [];
  for (const row of rows) {
    byId[row.id] = row;
    allIds.push(row.id);
  }
  return { byId, allIds };
}

const sklSlice = createSlice({
  name: "skl",
  initialState: initialSklSliceState,
  reducers: {
    // ── Render Definitions ──────────────────────────────────────────────────
    renderDefinitionsLoading(state) {
      state.renderDefinitions.status = "loading";
      state.renderDefinitions.error = null;
    },
    renderDefinitionsReceived(
      state,
      action: PayloadAction<SklRenderDefinition[]>,
    ) {
      const { byId, allIds } = indexById(action.payload);
      state.renderDefinitions.byId = byId;
      state.renderDefinitions.allIds = allIds;
      state.renderDefinitions.status = "ready";
      state.renderDefinitions.error = null;
    },
    renderDefinitionsError(state, action: PayloadAction<string>) {
      state.renderDefinitions.status = "error";
      state.renderDefinitions.error = action.payload;
    },
    renderDefinitionUpserted(
      state,
      action: PayloadAction<SklRenderDefinition>,
    ) {
      const def = action.payload;
      if (!state.renderDefinitions.byId[def.id]) {
        state.renderDefinitions.allIds.push(def.id);
      }
      state.renderDefinitions.byId[def.id] = def;
    },
    renderDefinitionRemoved(state, action: PayloadAction<string>) {
      delete state.renderDefinitions.byId[action.payload];
      state.renderDefinitions.allIds = state.renderDefinitions.allIds.filter(
        (id) => id !== action.payload,
      );
      if (state.renderDefinitions.activeId === action.payload) {
        state.renderDefinitions.activeId = null;
      }
    },
    setActiveRenderDefinitionId(state, action: PayloadAction<string | null>) {
      state.renderDefinitions.activeId = action.payload;
    },

    // ── Render Components ───────────────────────────────────────────────────
    renderComponentsReceived(
      state,
      action: PayloadAction<SklRenderComponent[]>,
    ) {
      const { byId, allIds } = indexById(action.payload);
      state.renderComponents.byId = byId;
      state.renderComponents.allIds = allIds;
      const byDef: Record<string, string[]> = {};
      for (const c of action.payload) {
        if (!byDef[c.renderDefinitionId]) byDef[c.renderDefinitionId] = [];
        byDef[c.renderDefinitionId].push(c.id);
      }
      state.renderComponents.byRenderDefinitionId = byDef;
      state.renderComponents.status = "ready";
      state.renderComponents.error = null;
    },

    // ── Render-block categories (shortcut_categories FK target) ────────────
    renderBlockCategoriesReceived(
      state,
      action: PayloadAction<ShortcutCategoryRow[]>,
    ) {
      const { byId, allIds } = indexById(action.payload);
      state.renderBlockCategories.byId = byId;
      state.renderBlockCategories.allIds = allIds;
      state.renderBlockCategories.status = "ready";
      state.renderBlockCategories.error = null;
    },
    renderBlockCategoriesLoading(state) {
      state.renderBlockCategories.status = "loading";
      state.renderBlockCategories.error = null;
    },
    renderBlockCategoriesError(state, action: PayloadAction<string>) {
      state.renderBlockCategories.status = "error";
      state.renderBlockCategories.error = action.payload;
    },

    // ── Resources ───────────────────────────────────────────────────────────
    resourcesReceived(state, action: PayloadAction<SklResource[]>) {
      const { byId, allIds } = indexById(action.payload);
      state.resources.byId = byId;
      state.resources.allIds = allIds;
      const bySkill: Record<string, string[]> = {};
      for (const r of action.payload) {
        if (!bySkill[r.skillId]) bySkill[r.skillId] = [];
        bySkill[r.skillId].push(r.id);
      }
      state.resources.bySkillId = bySkill;
      state.resources.status = "ready";
      state.resources.error = null;
    },
    resourcesLoading(state) {
      state.resources.status = "loading";
      state.resources.error = null;
    },
    resourcesError(state, action: PayloadAction<string>) {
      state.resources.status = "error";
      state.resources.error = action.payload;
    },
    resourceRemoved(state, action: PayloadAction<string>) {
      const row = state.resources.byId[action.payload];
      delete state.resources.byId[action.payload];
      state.resources.allIds = state.resources.allIds.filter(
        (id) => id !== action.payload,
      );
      if (row) {
        state.resources.bySkillId[row.skillId] = (
          state.resources.bySkillId[row.skillId] ?? []
        ).filter((id) => id !== action.payload);
      }
    },

    // ── Cross-cutting reset (e.g. on scope change) ─────────────────────────
    resetSklForScopeChange(state) {
      state.renderDefinitions = initialSklSliceState.renderDefinitions;
      state.renderBlockCategories = initialSklSliceState.renderBlockCategories;
      state.resources = initialSklSliceState.resources;
      // renderComponents is scope-free (registry); do not reset
      // Skills + categories migrated to features/skills/ — reset that
      // slice separately if needed (see skillsActions.resetSkills).
    },
  },
});

export const sklActions = sklSlice.actions;
export const sklReducer = sklSlice.reducer;
export type { SklSliceState };
