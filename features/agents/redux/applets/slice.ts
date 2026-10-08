/**
 * Applets — Redux Slice (scaffold)
 *
 * Mirrors `agent-shortcuts/slice.ts` in structure and behavior. The live
 * Supabase thunks and route hydrators both populate this canonical cache.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  AppletRow,
  AppletDefinition,
  AppletSliceState,
} from "./types";
import {
  addField,
  assignField,
  createFieldFlags,
  fieldFlagsSize,
  hasField,
  removeField,
} from "@ai-matrx/agents/field-flags";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptyRecord(id: string): AppletDefinition {
  return {
    id,
    slug: "",
    name: "",
    tagline: null,
    description: null,
    category: null,
    tags: [],

    preview_image_url: null,
    files: {},
    entry: null,
    pages: [],
    mandates: [],
    sources: [],
    parent_applet_id: null,
    favicon_url: null,

    status: "draft",
    published_to_web: false,
    shown_to: null,
    is_featured: false,
    is_verified: false,

    rate_limit_per_ip: null,
    rate_limit_window_hours: null,
    rate_limit_authenticated: null,

    version: 1,
    content_version: 0,

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
    deleted_at: null,

    _dirty: false,
    _dirtyFields: createFieldFlags<keyof AppletRow>(),
    _fieldHistory: {},
    _loadedFields: createFieldFlags<keyof AppletRow>(),
    _loading: false,
    _error: null,
  };
}

function mergeAndTrack(
  record: AppletDefinition,
  partial: Partial<AppletRow>,
): void {
  (Object.keys(partial) as (keyof AppletRow)[]).forEach((key) => {
    if (partial[key] !== undefined) {
      assignField(record, key, partial[key]);
      addField(record._loadedFields, key);
    }
  });
}

function applyFieldEdit<K extends keyof AppletRow>(
  record: AppletDefinition,
  field: K,
  value: AppletRow[K],
): void {
  if (!hasField(record._dirtyFields, field)) {
    assignField(record._fieldHistory, field, record[field]);
  }
  assignField(record, field, value);
  addField(record._dirtyFields, field);
  record._dirty = true;
}

function markRecordClean(record: AppletDefinition): void {
  record._dirty = false;
  record._dirtyFields = createFieldFlags<keyof AppletRow>();
  record._fieldHistory = {};
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState: AppletSliceState = {
  apps: {},
  activeAppId: null,
  initialLoaded: false,
  status: "idle",
  error: null,
};

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const appletSlice = createSlice({
  name: "applet",
  initialState,
  reducers: {
    // ── Upsert / seed ────────────────────────────────────────────────────────

    upsertApp(state, action: PayloadAction<AppletRow>) {
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
      action: PayloadAction<Partial<AppletRow> & { id: string }>,
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
      action: PayloadAction<Partial<AppletRow> & { id: string }>,
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
        field: keyof AppletRow;
        value: AppletRow[keyof AppletRow];
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
      action: PayloadAction<{ id: string; field: keyof AppletRow }>,
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
      (Object.keys(record._fieldHistory) as (keyof AppletRow)[]).forEach(
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
      action: PayloadAction<{ id: string; fields: (keyof AppletRow)[] }>,
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

    setAppsStatus(state, action: PayloadAction<AppletSliceState["status"]>) {
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

export const appletActions = appletSlice.actions;
export const appletReducer = appletSlice.reducer;
