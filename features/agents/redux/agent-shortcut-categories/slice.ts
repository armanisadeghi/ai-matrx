import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type {
  AgentShortcutCategoryDef,
  AgentShortcutCategoryRecord,
  AgentShortcutCategorySliceState,
  CategoryFieldSnapshot,
} from "./types";
import {
  addField,
  assignField,
  createFieldFlags,
  fieldFlagsSize,
  hasField,
  removeField,
} from "../shared/field-flags";
import {
  resolveRowScope,
  scopeIndexKey,
  type ScopeRef,
} from "../shared/scope";

function makeEmptyRecord(id: string): AgentShortcutCategoryRecord {
  return {
    id,
    label: "",
    description: null,
    iconName: null,
    color: null,
    sortOrder: 0,
    placementType: "",
    parentCategoryId: null,
    enabledFeatures: null,
    metadata: null,
    isActive: true,
    userId: null,
    organizationId: null,
    projectId: null,
    taskId: null,
    createdAt: "",
    updatedAt: "",
    _dirty: false,
    _dirtyFields: createFieldFlags<keyof AgentShortcutCategoryDef>(),
    _fieldHistory: {},
    _loadedFields: createFieldFlags<keyof AgentShortcutCategoryDef>(),
    _loading: false,
    _error: null,
  };
}

function mergeAndTrack(
  record: AgentShortcutCategoryRecord,
  partial: Partial<AgentShortcutCategoryDef>,
): void {
  (Object.keys(partial) as (keyof AgentShortcutCategoryDef)[]).forEach(
    (key) => {
      const value = partial[key];
      if (value !== undefined) {
        assignField(record, key, value);
        addField(record._loadedFields, key);
      }
    },
  );
}

function applyFieldEdit<K extends keyof AgentShortcutCategoryDef>(
  record: AgentShortcutCategoryRecord,
  field: K,
  value: AgentShortcutCategoryDef[K],
): void {
  if (!hasField(record._dirtyFields, field)) {
    (record._fieldHistory as CategoryFieldSnapshot)[field] = record[
      field
    ] as AgentShortcutCategoryDef[K];
  }
  assignField(record, field, value);
  addField(record._dirtyFields, field);
  record._dirty = true;
}

function markRecordClean(record: AgentShortcutCategoryRecord): void {
  record._dirty = false;
  record._dirtyFields = createFieldFlags<keyof AgentShortcutCategoryDef>();
  record._fieldHistory = {};
}

function scopeKeyForRecord(record: AgentShortcutCategoryRecord): string {
  const scope = resolveRowScope(record);
  if (scope === "user" && record.userId)
    return scopeIndexKey({ scope, scopeId: record.userId });
  if (scope === "organization" && record.organizationId)
    return scopeIndexKey({ scope, scopeId: record.organizationId });
  if (scope === "project" && record.projectId)
    return scopeIndexKey({ scope, scopeId: record.projectId });
  if (scope === "task" && record.taskId)
    return scopeIndexKey({ scope, scopeId: record.taskId });
  return scope;
}

function addToScopeIndex(
  state: AgentShortcutCategorySliceState,
  key: string,
  id: string,
): void {
  if (!state.categoryIdsByScope[key]) state.categoryIdsByScope[key] = [];
  if (!state.categoryIdsByScope[key].includes(id)) {
    state.categoryIdsByScope[key].push(id);
  }
}

function removeFromAllScopeIndexes(
  state: AgentShortcutCategorySliceState,
  id: string,
): void {
  for (const key of Object.keys(state.categoryIdsByScope)) {
    state.categoryIdsByScope[key] = state.categoryIdsByScope[key].filter(
      (cid) => cid !== id,
    );
  }
}

const initialState: AgentShortcutCategorySliceState = {
  categoriesById: {},
  categoryIdsByScope: {},
  activeCategoryId: null,
  status: "idle",
  error: null,
  scopeLoaded: {},
};

export const agentShortcutCategorySlice = createSlice({
  name: "agentShortcutCategory",
  initialState,
  reducers: {
    upsertCategory(state, action: PayloadAction<AgentShortcutCategoryDef>) {
      const data = action.payload;
      const existing = state.categoriesById[data.id];
      if (existing) {
        removeFromAllScopeIndexes(state, data.id);
        mergeAndTrack(existing, data);
        markRecordClean(existing);
        addToScopeIndex(state, scopeKeyForRecord(existing), existing.id);
      } else {
        const record = makeEmptyRecord(data.id);
        mergeAndTrack(record, data);
        markRecordClean(record);
        state.categoriesById[data.id] = record;
        addToScopeIndex(state, scopeKeyForRecord(record), record.id);
      }
    },

    upsertCategories(
      state,
      action: PayloadAction<AgentShortcutCategoryDef[]>,
    ) {
      action.payload.forEach((data) => {
        const existing = state.categoriesById[data.id];
        if (existing) {
          removeFromAllScopeIndexes(state, data.id);
          mergeAndTrack(existing, data);
          markRecordClean(existing);
          addToScopeIndex(state, scopeKeyForRecord(existing), existing.id);
        } else {
          const record = makeEmptyRecord(data.id);
          mergeAndTrack(record, data);
          markRecordClean(record);
          state.categoriesById[data.id] = record;
          addToScopeIndex(state, scopeKeyForRecord(record), record.id);
        }
      });
    },

    mergePartialCategory(
      state,
      action: PayloadAction<
        Partial<AgentShortcutCategoryDef> & { id: string }
      >,
    ) {
      const data = action.payload;
      const existing = state.categoriesById[data.id];
      if (existing) {
        mergeAndTrack(existing, data);
      } else {
        const record = makeEmptyRecord(data.id);
        mergeAndTrack(record, data);
        state.categoriesById[data.id] = record;
        addToScopeIndex(state, scopeKeyForRecord(record), record.id);
      }
    },

    setCategoryField(
      state,
      action: PayloadAction<{
        id: string;
        field: keyof AgentShortcutCategoryDef;
        value: AgentShortcutCategoryDef[keyof AgentShortcutCategoryDef];
      }>,
    ) {
      const { id, field, value } = action.payload;
      const record = state.categoriesById[id];
      if (!record) return;
      applyFieldEdit(
        record,
        field,
        value as AgentShortcutCategoryDef[typeof field],
      );
    },

    resetCategoryField(
      state,
      action: PayloadAction<{
        id: string;
        field: keyof AgentShortcutCategoryDef;
      }>,
    ) {
      const { id, field } = action.payload;
      const record = state.categoriesById[id];
      if (!record || !hasField(record._dirtyFields, field)) return;
      const original = record._fieldHistory[field];
      if (original !== undefined) {
        assignField(record, field, original);
      }
      removeField(record._dirtyFields, field);
      delete record._fieldHistory[field];
      record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
    },

    resetAllCategoryFields(state, action: PayloadAction<{ id: string }>) {
      const record = state.categoriesById[action.payload.id];
      if (!record) return;
      (
        Object.keys(record._fieldHistory) as (keyof AgentShortcutCategoryDef)[]
      ).forEach((field) => {
        const original = record._fieldHistory[field];
        if (original !== undefined) {
          assignField(record, field, original);
        }
      });
      markRecordClean(record);
    },

    markCategorySaved(state, action: PayloadAction<{ id: string }>) {
      const record = state.categoriesById[action.payload.id];
      if (!record) return;
      removeFromAllScopeIndexes(state, record.id);
      markRecordClean(record);
      addToScopeIndex(state, scopeKeyForRecord(record), record.id);
    },

    rollbackCategoryOptimisticUpdate(
      state,
      action: PayloadAction<{ id: string; snapshot: CategoryFieldSnapshot }>,
    ) {
      const { id, snapshot } = action.payload;
      const record = state.categoriesById[id];
      if (!record) return;
      (
        Object.keys(snapshot) as (keyof AgentShortcutCategoryDef)[]
      ).forEach((field) => {
        const value = snapshot[field];
        if (value !== undefined) {
          assignField(record, field, value);
        }
      });
      record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
    },

    markCategoryFieldsLoaded(
      state,
      action: PayloadAction<{
        id: string;
        fields: (keyof AgentShortcutCategoryDef)[];
      }>,
    ) {
      const record = state.categoriesById[action.payload.id];
      if (!record) return;
      action.payload.fields.forEach((f) =>
        addField(record._loadedFields, f),
      );
    },

    setCategoryLoading(
      state,
      action: PayloadAction<{ id: string; loading: boolean }>,
    ) {
      const record = state.categoriesById[action.payload.id];
      if (record) record._loading = action.payload.loading;
    },

    setCategoryError(
      state,
      action: PayloadAction<{ id: string; error: string | null }>,
    ) {
      const record = state.categoriesById[action.payload.id];
      if (record) record._error = action.payload.error;
    },

    setActiveCategoryId(state, action: PayloadAction<string | null>) {
      state.activeCategoryId = action.payload;
    },

    setCategoriesStatus(
      state,
      action: PayloadAction<AgentShortcutCategorySliceState["status"]>,
    ) {
      state.status = action.payload;
    },

    setCategoriesError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },

    setCategoryScopeLoaded(
      state,
      action: PayloadAction<{ scopeRef: ScopeRef; loaded: boolean }>,
    ) {
      const key = scopeIndexKey(action.payload.scopeRef);
      state.scopeLoaded[key] = action.payload.loaded;
    },

    removeCategory(state, action: PayloadAction<string>) {
      const id = action.payload;
      removeFromAllScopeIndexes(state, id);
      delete state.categoriesById[id];
      if (state.activeCategoryId === id) state.activeCategoryId = null;
    },

    clearCategoryScope(
      state,
      action: PayloadAction<{ scopeRef: ScopeRef }>,
    ) {
      const key = scopeIndexKey(action.payload.scopeRef);
      const ids = state.categoryIdsByScope[key] ?? [];
      ids.forEach((id) => {
        delete state.categoriesById[id];
      });
      delete state.categoryIdsByScope[key];
      delete state.scopeLoaded[key];
    },
  },
});

export const {
  upsertCategory,
  upsertCategories,
  mergePartialCategory,
  setCategoryField,
  resetCategoryField,
  resetAllCategoryFields,
  markCategorySaved,
  rollbackCategoryOptimisticUpdate,
  markCategoryFieldsLoaded,
  setCategoryLoading,
  setCategoryError,
  setActiveCategoryId,
  setCategoriesStatus,
  setCategoriesError,
  setCategoryScopeLoaded,
  removeCategory,
  clearCategoryScope,
} = agentShortcutCategorySlice.actions;

export default agentShortcutCategorySlice.reducer;
