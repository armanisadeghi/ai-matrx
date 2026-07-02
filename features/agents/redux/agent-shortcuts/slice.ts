import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type {
  AgentShortcut,
  AgentShortcutRecord,
  AgentShortcutSliceState,
  ShortcutFieldSnapshot,
} from "./types";
import {
  addField,
  assignField,
  createFieldFlags,
  fieldFlagsSize,
  hasField,
  removeField,
} from "../shared/field-flags";
import { scopeIndexKey, type ScopeRef } from "../shared/scope";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptyRecord(id: string): AgentShortcutRecord {
  return {
    id,
    categoryId: "",
    label: "",
    description: null,
    iconName: null,
    keyboardShortcut: null,
    sortOrder: 0,

    agentId: null,
    agentVersionId: null,
    useLatest: false,

    resolvedId: null,
    isVersion: false,

    agentName: null,
    variableDefinitions: [],
    contextSlots: [],

    enabledFeatures: [],
    surfaceName: null,
    scopeMappings: null,
    valueMappings: null,
    contextMappings: null,

    // AgentExecutionConfig bundle defaults — keep in sync with
    // DEFAULT_AGENT_EXECUTION_CONFIG in features/agents/types/agent-execution-config.types.ts
    displayMode: "modal-full",
    showVariablePanel: false,
    variablesPanelStyle: "inline",
    autoRun: true,
    allowChat: true,
    showDefinitionMessages: false,
    showDefinitionMessageContent: false,
    hideReasoning: false,
    hideToolResults: false,
    responseDensity: "comfortable",
    showPreExecutionGate: false,
    preExecutionMessage: null,
    bypassGateSeconds: 3,
    defaultUserInput: null,
    defaultVariables: null,
    contextOverrides: null,
    llmOverrides: null,
    jsonExtraction: null,

    isActive: true,

    userId: null,
    organizationId: null,
    projectId: null,
    taskId: null,

    createdAt: "",
    updatedAt: "",

    _dirty: false,
    _dirtyFields: createFieldFlags<keyof AgentShortcut>(),
    _fieldHistory: {},
    _loadedFields: createFieldFlags<keyof AgentShortcut>(),
    _loading: false,
    _error: null,
  };
}

/**
 * Writes incoming fields onto the record AND tracks them in _loadedFields.
 * Never overwrites with undefined. Does not touch runtime flags.
 */
function mergeAndTrack(
  record: AgentShortcutRecord,
  partial: Partial<AgentShortcut>,
): void {
  (Object.keys(partial) as (keyof AgentShortcut)[]).forEach((key) => {
    const value = partial[key];
    if (value !== undefined) {
      assignField(record, key, value);
      addField(record._loadedFields, key);
    }
  });
}

/**
 * Applies a user edit with dirty tracking and history capture.
 * Does NOT add to _loadedFields — user edits are not "fetched".
 */
function applyFieldEdit<K extends keyof AgentShortcut>(
  record: AgentShortcutRecord,
  field: K,
  value: AgentShortcut[K],
): void {
  if (!hasField(record._dirtyFields, field)) {
    (record._fieldHistory as ShortcutFieldSnapshot)[field] = record[
      field
    ] as AgentShortcut[K];
  }
  assignField(record, field, value);
  addField(record._dirtyFields, field);
  record._dirty = true;
}

/**
 * Marks a record as clean. Clears dirty state and history.
 * _loadedFields is NOT cleared — cumulative.
 */
function markRecordClean(record: AgentShortcutRecord): void {
  record._dirty = false;
  record._dirtyFields = createFieldFlags<keyof AgentShortcut>();
  record._fieldHistory = {};
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: AgentShortcutSliceState = {
  shortcuts: {},
  activeShortcutId: null,
  initialLoaded: false,
  contextLoaded: {},
  scopeLoaded: {},
  status: "idle",
  error: null,
};

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

export const agentShortcutSlice = createSlice({
  name: "agentShortcut",
  initialState,

  reducers: {
    // ── Full upsert (complete fetch — marks record clean) ────────────────────

    /**
     * Upserts a fully-fetched shortcut and marks it clean.
     * All incoming fields tracked in _loadedFields.
     */
    upsertShortcut(state, action: PayloadAction<AgentShortcut>) {
      const data = action.payload;
      const existing = state.shortcuts[data.id];
      if (existing) {
        mergeAndTrack(existing, data);
        markRecordClean(existing);
      } else {
        const record = makeEmptyRecord(data.id);
        mergeAndTrack(record, data);
        markRecordClean(record);
        state.shortcuts[data.id] = record;
      }
    },

    /**
     * Upserts multiple shortcuts at once (e.g. from RPC batch response).
     * Each record is marked clean.
     */
    upsertShortcuts(state, action: PayloadAction<AgentShortcut[]>) {
      action.payload.forEach((data) => {
        const existing = state.shortcuts[data.id];
        if (existing) {
          mergeAndTrack(existing, data);
          markRecordClean(existing);
        } else {
          const record = makeEmptyRecord(data.id);
          mergeAndTrack(record, data);
          markRecordClean(record);
          state.shortcuts[data.id] = record;
        }
      });
    },

    /**
     * Merges a partial payload into state.
     * PRESERVES existing fields not in the payload.
     * NEVER clears dirty state.
     * New shortcuts initialised clean on first appearance.
     */
    mergePartialShortcut(
      state,
      action: PayloadAction<Partial<AgentShortcut> & { id: string }>,
    ) {
      const data = action.payload;
      const existing = state.shortcuts[data.id];
      if (existing) {
        mergeAndTrack(existing, data);
      } else {
        const record = makeEmptyRecord(data.id);
        mergeAndTrack(record, data);
        state.shortcuts[data.id] = record;
      }
    },

    // ── User field edits (trigger dirty) ─────────────────────────────────────

    /** Edit any single field by name. Captures history and marks dirty. */
    setShortcutField(
      state,
      action: PayloadAction<{
        id: string;
        field: keyof AgentShortcut;
        value: AgentShortcut[keyof AgentShortcut];
      }>,
    ) {
      const { id, field, value } = action.payload;
      const record = state.shortcuts[id];
      if (!record) return;
      applyFieldEdit(record, field, value as AgentShortcut[typeof field]);
    },

    // ── Dedicated actions for complex fields ──────────────────────────────────

    setShortcutEnabledFeatures(
      state,
      action: PayloadAction<{
        id: string;
        enabledFeatures: AgentShortcut["enabledFeatures"];
      }>,
    ) {
      const record = state.shortcuts[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "enabledFeatures", action.payload.enabledFeatures);
    },

    setShortcutScopeMappings(
      state,
      action: PayloadAction<{
        id: string;
        scopeMappings: AgentShortcut["scopeMappings"];
      }>,
    ) {
      const record = state.shortcuts[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "scopeMappings", action.payload.scopeMappings);
    },

    setShortcutSurfaceName(
      state,
      action: PayloadAction<{
        id: string;
        surfaceName: AgentShortcut["surfaceName"];
      }>,
    ) {
      const record = state.shortcuts[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "surfaceName", action.payload.surfaceName);
    },

    setShortcutValueMappings(
      state,
      action: PayloadAction<{
        id: string;
        valueMappings: AgentShortcut["valueMappings"];
      }>,
    ) {
      const record = state.shortcuts[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "valueMappings", action.payload.valueMappings);
    },

    setShortcutContextMappings(
      state,
      action: PayloadAction<{
        id: string;
        contextMappings: AgentShortcut["contextMappings"];
      }>,
    ) {
      const record = state.shortcuts[action.payload.id];
      if (!record) return;
      applyFieldEdit(record, "contextMappings", action.payload.contextMappings);
    },

    // ── Dirty / history management ────────────────────────────────────────────

    /** Reset one field to its original value from _fieldHistory. */
    resetShortcutField(
      state,
      action: PayloadAction<{ id: string; field: keyof AgentShortcut }>,
    ) {
      const { id, field } = action.payload;
      const record = state.shortcuts[id];
      if (!record || !hasField(record._dirtyFields, field)) return;

      const original = record._fieldHistory[field];
      if (original !== undefined) {
        assignField(record, field, original);
      }
      removeField(record._dirtyFields, field);
      delete record._fieldHistory[field];
      record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
    },

    /** Reset ALL dirty fields to their original values. No refetch needed. */
    resetAllShortcutFields(state, action: PayloadAction<{ id: string }>) {
      const record = state.shortcuts[action.payload.id];
      if (!record) return;
      (Object.keys(record._fieldHistory) as (keyof AgentShortcut)[]).forEach(
        (field) => {
          const original = record._fieldHistory[field];
          if (original !== undefined) {
            assignField(record, field, original);
          }
        },
      );
      markRecordClean(record);
    },

    /** Called after a successful save. Current values become the new clean baseline. */
    markShortcutSaved(state, action: PayloadAction<{ id: string }>) {
      const record = state.shortcuts[action.payload.id];
      if (!record) return;
      markRecordClean(record);
    },

    /** Save failed — restore from snapshot taken before optimistic write. */
    rollbackShortcutOptimisticUpdate(
      state,
      action: PayloadAction<{ id: string; snapshot: ShortcutFieldSnapshot }>,
    ) {
      const { id, snapshot } = action.payload;
      const record = state.shortcuts[id];
      if (!record) return;
      (Object.keys(snapshot) as (keyof AgentShortcut)[]).forEach((field) => {
        const value = snapshot[field];
        if (value !== undefined) {
          assignField(record, field, value);
        }
      });
      record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
    },

    // ── Explicitly mark fields as loaded ─────────────────────────────────────

    markShortcutFieldsLoaded(
      state,
      action: PayloadAction<{ id: string; fields: (keyof AgentShortcut)[] }>,
    ) {
      const record = state.shortcuts[action.payload.id];
      if (!record) return;
      action.payload.fields.forEach((f) => addField(record._loadedFields, f));
    },

    // ── Per-record async state ────────────────────────────────────────────────

    setShortcutLoading(
      state,
      action: PayloadAction<{ id: string; loading: boolean }>,
    ) {
      const record = state.shortcuts[action.payload.id];
      if (record) record._loading = action.payload.loading;
    },

    setShortcutError(
      state,
      action: PayloadAction<{ id: string; error: string | null }>,
    ) {
      const record = state.shortcuts[action.payload.id];
      if (record) record._error = action.payload.error;
    },

    // ── Active shortcut ───────────────────────────────────────────────────────

    setActiveShortcutId(state, action: PayloadAction<string | null>) {
      state.activeShortcutId = action.payload;
    },

    // ── Phase tracking ────────────────────────────────────────────────────────

    setInitialLoaded(state, action: PayloadAction<boolean>) {
      state.initialLoaded = action.payload;
    },

    setContextLoaded(
      state,
      action: PayloadAction<{ key: string; loaded: boolean }>,
    ) {
      state.contextLoaded[action.payload.key] = action.payload.loaded;
    },

    setShortcutScopeLoaded(
      state,
      action: PayloadAction<{ scopeRef: ScopeRef; loaded: boolean }>,
    ) {
      const key = scopeIndexKey(action.payload.scopeRef);
      state.scopeLoaded[key] = action.payload.loaded;
    },

    // ── Slice-level status ────────────────────────────────────────────────────

    setShortcutsStatus(
      state,
      action: PayloadAction<AgentShortcutSliceState["status"]>,
    ) {
      state.status = action.payload;
    },

    setShortcutsError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },

    // ── Remove ────────────────────────────────────────────────────────────────

    removeShortcut(state, action: PayloadAction<string>) {
      delete state.shortcuts[action.payload];
      if (state.activeShortcutId === action.payload) {
        state.activeShortcutId = null;
      }
    },
  },
});

export const {
  upsertShortcut,
  upsertShortcuts,
  mergePartialShortcut,
  setShortcutField,
  setShortcutEnabledFeatures,
  setShortcutScopeMappings,
  setShortcutSurfaceName,
  setShortcutValueMappings,
  setShortcutContextMappings,
  resetShortcutField,
  resetAllShortcutFields,
  markShortcutSaved,
  rollbackShortcutOptimisticUpdate,
  markShortcutFieldsLoaded,
  setShortcutLoading,
  setShortcutError,
  setActiveShortcutId,
  setInitialLoaded,
  setContextLoaded,
  setShortcutScopeLoaded,
  setShortcutsStatus,
  setShortcutsError,
  removeShortcut,
} = agentShortcutSlice.actions;

export default agentShortcutSlice.reducer;
