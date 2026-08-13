/**
 * Agent Apps — Redux Slice (scaffold)
 *
 * Mirrors `agent-shortcuts/slice.ts` in structure and behavior. The live
 * Supabase thunks and route hydrators both populate this canonical cache.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  AgentApp,
  AgentAppRecord,
  AgentAppSliceState,
} from "./types";
import {
  addField,
  assignField,
  createFieldFlags,
  fieldFlagsSize,
  hasField,
  removeField,
} from "../shared/field-flags";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptyRecord(id: string): AgentAppRecord {
  return {
    id,
    slug: "",
    name: "",
    tagline: null,
    description: null,
    category: null,
    tags: [],

    agent_id: "",
    agent_version_id: null,
    use_latest: true,

    app_kind: "single",
    shared_context_slots: null,
    search_tsv: null,

    component_code: "",
    component_language: "tsx",
    allowed_imports: [],

    variable_schema: [],
    layout_config: {},
    styling_config: {},

    shell_kind: "chat",
    shell_config: {},
    slot_overrides: {},
    slot_code: {},

    preview_image_url: null,
    favicon_url: null,

    status: "draft",
    visibility: "public",
    is_featured: false,
    is_verified: false,

    rate_limit_per_ip: null,
    rate_limit_window_hours: null,
    rate_limit_authenticated: null,

    version: 1,
    pinned_version: null,

    total_executions: 0,
    total_tokens_used: 0,
    total_cost: 0,
    unique_users_count: 0,
    success_rate: null,
    avg_execution_time_ms: null,
    last_execution_at: null,

    metadata: null,

    created_by: null,
    organization_id: null,
    project_id: null,
    task_id: null,

    created_at: "",
    updated_at: "",
    published_at: null,

    _dirty: false,
    _dirtyFields: createFieldFlags<keyof AgentApp>(),
    _fieldHistory: {},
    _loadedFields: createFieldFlags<keyof AgentApp>(),
    _loading: false,
    _error: null,
  };
}

function mergeAndTrack(
  record: AgentAppRecord,
  partial: Partial<AgentApp>,
): void {
  (Object.keys(partial) as (keyof AgentApp)[]).forEach((key) => {
    if (partial[key] !== undefined) {
      assignField(record, key, partial[key]);
      addField(record._loadedFields, key);
    }
  });
}

function applyFieldEdit<K extends keyof AgentApp>(
  record: AgentAppRecord,
  field: K,
  value: AgentApp[K],
): void {
  if (!hasField(record._dirtyFields, field)) {
    assignField(record._fieldHistory, field, record[field]);
  }
  assignField(record, field, value);
  addField(record._dirtyFields, field);
  record._dirty = true;
}

function markRecordClean(record: AgentAppRecord): void {
  record._dirty = false;
  record._dirtyFields = createFieldFlags<keyof AgentApp>();
  record._fieldHistory = {};
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: AgentAppSliceState = {
  apps: {},
  activeAppId: null,
  initialLoaded: false,
  status: "idle",
  error: null,
};

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const agentAppSlice = createSlice({
  name: "agentApp",
  initialState,
  reducers: {
    // ── Upsert / seed ────────────────────────────────────────────────────────

    upsertApp(state, action: PayloadAction<AgentApp>) {
      const data = action.payload;
      const existing = state.apps[data.id];
      if (existing) {
        mergeAndTrack(existing, data);
        markRecordClean(existing);
      } else {
        const record = makeEmptyRecord(data.id);
        mergeAndTrack(record, data);
        markRecordClean(record);
        state.apps[data.id] = record;
      }
    },

    seedAppFromTemplate(
      state,
      action: PayloadAction<Partial<AgentApp> & { id: string }>,
    ) {
      const data = action.payload;
      if (state.apps[data.id]) return;
      const record = makeEmptyRecord(data.id);
      mergeAndTrack(record, data);
      markRecordClean(record);
      state.apps[data.id] = record;
    },

    mergePartialApp(
      state,
      action: PayloadAction<Partial<AgentApp> & { id: string }>,
    ) {
      const { id, ...partial } = action.payload;
      const record = state.apps[id];
      if (!record) return;
      mergeAndTrack(record, partial);
    },

    // ── Field edits ───────────────────────────────────────────────────────────

    setAppField(
      state,
      action: PayloadAction<{
        id: string;
        field: keyof AgentApp;
        value: AgentApp[keyof AgentApp];
      }>,
    ) {
      const { id, field, value } = action.payload;
      const record = state.apps[id];
      if (!record) return;
      applyFieldEdit(record, field, value);
    },

    // ── Dirty / history management ────────────────────────────────────────────

    resetAppField(
      state,
      action: PayloadAction<{ id: string; field: keyof AgentApp }>,
    ) {
      const { id, field } = action.payload;
      const record = state.apps[id];
      if (!record || !hasField(record._dirtyFields, field)) return;
      const original = record._fieldHistory[field];
      if (original !== undefined) {
        assignField(record, field, original);
      }
      removeField(record._dirtyFields, field);
      delete record._fieldHistory[field];
      record._dirty = fieldFlagsSize(record._dirtyFields) > 0;
    },

    resetAllAppFields(state, action: PayloadAction<{ id: string }>) {
      const record = state.apps[action.payload.id];
      if (!record) return;
      (Object.keys(record._fieldHistory) as (keyof AgentApp)[]).forEach(
        (field) => {
          const original = record._fieldHistory[field];
          if (original !== undefined) {
            assignField(record, field, original);
          }
        },
      );
      markRecordClean(record);
    },

    markAppSaved(state, action: PayloadAction<{ id: string }>) {
      const record = state.apps[action.payload.id];
      if (!record) return;
      markRecordClean(record);
    },

    markAppFieldsLoaded(
      state,
      action: PayloadAction<{ id: string; fields: (keyof AgentApp)[] }>,
    ) {
      const record = state.apps[action.payload.id];
      if (!record) return;
      action.payload.fields.forEach((f) => addField(record._loadedFields, f));
    },

    // ── Async state ───────────────────────────────────────────────────────────

    setAppLoading(
      state,
      action: PayloadAction<{ id: string; loading: boolean }>,
    ) {
      const record = state.apps[action.payload.id];
      if (!record) return;
      record._loading = action.payload.loading;
    },

    setAppError(
      state,
      action: PayloadAction<{ id: string; error: string | null }>,
    ) {
      const record = state.apps[action.payload.id];
      if (!record) return;
      record._error = action.payload.error;
    },

    // ── Registry management ───────────────────────────────────────────────────

    setActiveAppId(state, action: PayloadAction<string | null>) {
      state.activeAppId = action.payload;
    },

    setAppsStatus(state, action: PayloadAction<AgentAppSliceState["status"]>) {
      state.status = action.payload;
    },

    setAppsError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },

    setAppsInitialLoaded(state, action: PayloadAction<boolean>) {
      state.initialLoaded = action.payload;
    },

    removeApp(state, action: PayloadAction<{ id: string }>) {
      delete state.apps[action.payload.id];
      if (state.activeAppId === action.payload.id) {
        state.activeAppId = null;
      }
    },
  },
});

export const agentAppActions = agentAppSlice.actions;
export const agentAppReducer = agentAppSlice.reducer;
