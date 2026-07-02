import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type {
  AgentContentBlockDef,
  AgentContentBlockRecord,
  AgentContentBlockSliceState,
  ContentBlockFieldSnapshot,
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

function makeEmptyRecord(id: string): AgentContentBlockRecord {
  return {
    id,
    blockId: "",
    categoryId: null,
    label: "",
    description: null,
    iconName: "",
    sortOrder: 0,
    template: "",
    isActive: true,
    userId: null,
    organizationId: null,
    projectId: null,
    taskId: null,
    createdAt: "",
    updatedAt: "",
    _dirty: false,
    _dirtyFields: createFieldFlags<keyof AgentContentBlockDef>(),
    _fieldHistory: {},
    _loadedFields: createFieldFlags<keyof AgentContentBlockDef>(),
    _loading: false,
    _error: null,
  };
}

function mergeAndTrack(
  record: AgentContentBlockRecord,
  partial: Partial<AgentContentBlockDef>,
): void {
  (Object.keys(partial) as (keyof AgentContentBlockDef)[]).forEach((key) => {
    const value = partial[key];
    if (value !== undefined) {
      assignField(record, key, value);
      addField(record._loadedFields, key);
    }
  });
}

function applyFieldEdit<K extends keyof AgentContentBlockDef>(
  record: AgentContentBlockRecord,
  field: K,
  value: AgentContentBlockDef[K],
): void {
  if (!hasField(record._dirtyFields, field)) {
    (record._fieldHistory as ContentBlockFieldSnapshot)[field] = record[
      field
    ] as AgentContentBlockDef[K];
  }
  assignField(record, field, value);
  addField(record._dirtyFields, field);
  record._dirty = true;
}

function markRecordClean(record: AgentContentBlockRecord): void {
  record._dirty = false;
  record._dirtyFields = createFieldFlags<keyof AgentContentBlockDef>();
  record._fieldHistory = {};
}

function scopeKeyForRecord(record: AgentContentBlockRecord): string {
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
  state: AgentContentBlockSliceState,
  key: string,
  id: string,
): void {
  if (!state.contentBlockIdsByScope[key])
    state.contentBlockIdsByScope[key] = [];
  if (!state.contentBlockIdsByScope[key].includes(id)) {
    state.contentBlockIdsByScope[key].push(id);
  }
}

function removeFromAllScopeIndexes(
  state: AgentContentBlockSliceState,
  id: string,
): void {
  for (const key of Object.keys(state.contentBlockIdsByScope)) {
    state.contentBlockIdsByScope[key] = state.contentBlockIdsByScope[
      key
    ].filter((cid) => cid !== id);
  }
}

const initialState: AgentContentBlockSliceState = {
  contentBlocksById: {},
  contentBlockIdsByScope: {},
  activeContentBlockId: null,
  status: "idle",
  error: null,
  scopeLoaded: {},
};

export const agentContentBlockSlice = createSlice({
  name: "agentContentBlock",
  initialState,
  reducers: {
    upsertContentBlock(state, action: PayloadAction<AgentContentBlockDef>) {
      const data = action.payload;
      const existing = state.contentBlocksById[data.id];
      if (existing) {
        removeFromAllScopeIndexes(state, data.id);
        mergeAndTrack(existing, data);
        markRecordClean(existing);
        addToScopeIndex(state, scopeKeyForRecord(existing), existing.id);
      } else {
        const record = makeEmptyRecord(data.id);
        mergeAndTrack(record, data);
        markRecordClean(record);
        state.contentBlocksById[data.id] = record;
        addToScopeIndex(state, scopeKeyForRecord(record), record.id);
      }
    },

    upsertContentBlocks(
      state,
      action: PayloadAction<AgentContentBlockDef[]>,
    ) {
      action.payload.forEach((data) => {
        const existing = state.contentBlocksById[data.id];
        if (existing) {
          removeFromAllScopeIndexes(state, data.id);
          mergeAndTrack(existing, data);
          markRecordClean(existing);
          addToScopeIndex(state, scopeKeyForRecord(existing), existing.id);
        } else {
          const record = makeEmptyRecord(data.id);
          mergeAndTrack(record, data);
          markRecordClean(record);
          state.contentBlocksById[data.id] = record;
          addToScopeIndex(state, scopeKeyForRecord(record), record.id);
        }
      });
    },

    mergePartialContentBlock(
      state,
      action: PayloadAction<Partial<AgentContentBlockDef> & { id: string }>,
    ) {
      const data = action.payload;
      const existing = state.contentBlocksById[data.id];
      if (existing) {
        mergeAndTrack(existing, data);
      } else {
        const record = makeEmptyRecord(data.id);
        mergeAndTrack(record, data);
        state.contentBlocksById[data.id] = record;
        addToScopeIndex(state, scopeKeyForRecord(record), record.id);
      }
    },

    setContentBlockField(
      state,
      action: PayloadAction<{
        id: string;
        field: keyof AgentContentBlockDef;
        value: AgentContentBlockDef[keyof AgentContentBlockDef];
      }>,
    ) {
      const { id, field, value } = action.payload;
      const record = state.contentBlocksById[id];
      if (!record) return;
      applyFieldEdit(record, field, value as AgentContentBlockDef[typeof field]);
    },

    resetContentBlockField(
      state,
      action: PayloadAction<{
        id: string;
        field: keyof AgentContentBlockDef;
      }>,
    ) {
      const { id, field } = action.payload;
      const record = state.contentBlocksById[id];
      if (!record || !hasField(record._dirtyFields, field)) return;
      const original = record._fieldHistory[field];
      if (original !== undefined) {
        assignField(record, field, original);
      }
      removeField(record._dirtyFields, field);
      delete record._fieldHistory[field];
      record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
    },

    resetAllContentBlockFields(state, action: PayloadAction<{ id: string }>) {
      const record = state.contentBlocksById[action.payload.id];
      if (!record) return;
      (
        Object.keys(record._fieldHistory) as (keyof AgentContentBlockDef)[]
      ).forEach((field) => {
        const original = record._fieldHistory[field];
        if (original !== undefined) {
          assignField(record, field, original);
        }
      });
      markRecordClean(record);
    },

    markContentBlockSaved(state, action: PayloadAction<{ id: string }>) {
      const record = state.contentBlocksById[action.payload.id];
      if (!record) return;
      removeFromAllScopeIndexes(state, record.id);
      markRecordClean(record);
      addToScopeIndex(state, scopeKeyForRecord(record), record.id);
    },

    rollbackContentBlockOptimisticUpdate(
      state,
      action: PayloadAction<{
        id: string;
        snapshot: ContentBlockFieldSnapshot;
      }>,
    ) {
      const { id, snapshot } = action.payload;
      const record = state.contentBlocksById[id];
      if (!record) return;
      (Object.keys(snapshot) as (keyof AgentContentBlockDef)[]).forEach(
        (field) => {
          const value = snapshot[field];
          if (value !== undefined) {
            assignField(record, field, value);
          }
        },
      );
      record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
    },

    markContentBlockFieldsLoaded(
      state,
      action: PayloadAction<{
        id: string;
        fields: (keyof AgentContentBlockDef)[];
      }>,
    ) {
      const record = state.contentBlocksById[action.payload.id];
      if (!record) return;
      action.payload.fields.forEach((f) => addField(record._loadedFields, f));
    },

    setContentBlockLoading(
      state,
      action: PayloadAction<{ id: string; loading: boolean }>,
    ) {
      const record = state.contentBlocksById[action.payload.id];
      if (record) record._loading = action.payload.loading;
    },

    setContentBlockError(
      state,
      action: PayloadAction<{ id: string; error: string | null }>,
    ) {
      const record = state.contentBlocksById[action.payload.id];
      if (record) record._error = action.payload.error;
    },

    setActiveContentBlockId(state, action: PayloadAction<string | null>) {
      state.activeContentBlockId = action.payload;
    },

    setContentBlocksStatus(
      state,
      action: PayloadAction<AgentContentBlockSliceState["status"]>,
    ) {
      state.status = action.payload;
    },

    setContentBlocksError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },

    setContentBlockScopeLoaded(
      state,
      action: PayloadAction<{ scopeRef: ScopeRef; loaded: boolean }>,
    ) {
      const key = scopeIndexKey(action.payload.scopeRef);
      state.scopeLoaded[key] = action.payload.loaded;
    },

    removeContentBlock(state, action: PayloadAction<string>) {
      const id = action.payload;
      removeFromAllScopeIndexes(state, id);
      delete state.contentBlocksById[id];
      if (state.activeContentBlockId === id)
        state.activeContentBlockId = null;
    },

    clearContentBlockScope(
      state,
      action: PayloadAction<{ scopeRef: ScopeRef }>,
    ) {
      const key = scopeIndexKey(action.payload.scopeRef);
      const ids = state.contentBlockIdsByScope[key] ?? [];
      ids.forEach((id) => {
        delete state.contentBlocksById[id];
      });
      delete state.contentBlockIdsByScope[key];
      delete state.scopeLoaded[key];
    },
  },
});

export const {
  upsertContentBlock,
  upsertContentBlocks,
  mergePartialContentBlock,
  setContentBlockField,
  resetContentBlockField,
  resetAllContentBlockFields,
  markContentBlockSaved,
  rollbackContentBlockOptimisticUpdate,
  markContentBlockFieldsLoaded,
  setContentBlockLoading,
  setContentBlockError,
  setActiveContentBlockId,
  setContentBlocksStatus,
  setContentBlocksError,
  setContentBlockScopeLoaded,
  removeContentBlock,
  clearContentBlockScope,
} = agentContentBlockSlice.actions;

export default agentContentBlockSlice.reducer;
