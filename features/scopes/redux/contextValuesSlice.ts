// features/scopes/redux/contextValuesSlice.ts
//
// High-churn sidecar to scopesSlice. Holds per-scope context-item values.
// Separated because:
//   - Values change often (cell-by-cell edits, autosave drafts).
//   - Most tree consumers don't care about values; they shouldn't re-render
//     on a value edit.
//   - Drafts are a UI concept that doesn't belong on the canonical tree.
//
// Shape (per features/scopes/FEATURE.md §"Redux shape"):
//   byScope: { [scopeId]: ScopeValuesEntry }
//   where ScopeValuesEntry = { status, fetchedAt, values, drafts, error }

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  ContextItemValue,
  ScopeValuesEntry,
} from "@/features/scopes/types";

export interface ContextValuesState {
  byScope: Record<string, ScopeValuesEntry>;
  /** Cells with a write in flight, keyed `<scopeId>:<contextItemId>`. */
  savingPairs: Record<string, true>;
  /** When each cell last saved in this session, keyed `<scopeId>:<contextItemId>`. */
  lastSavedAt: Record<string, number>;
}

const initialState: ContextValuesState = {
  byScope: {},
  savingPairs: {},
  lastSavedAt: {},
};

export const cellKey = (scopeId: string, contextItemId: string) =>
  `${scopeId}:${contextItemId}`;

function ensureEntry(
  state: ContextValuesState,
  scopeId: string,
): ScopeValuesEntry {
  if (!state.byScope[scopeId]) {
    state.byScope[scopeId] = {
      status: "idle",
      fetchedAt: null,
      values: {},
      drafts: {},
      error: null,
    };
  }
  return state.byScope[scopeId];
}

const contextValuesSlice = createSlice({
  name: "contextValues",
  initialState,
  reducers: {
    // ─── Fetch lifecycle (per scope) ─────────────────────────────
    valuesFetchPending(state, action: PayloadAction<{ scopeId: string }>) {
      const entry = ensureEntry(state, action.payload.scopeId);
      entry.status = "loading";
      entry.error = null;
    },
    valuesFetchFulfilled(
      state,
      action: PayloadAction<{
        scopeId: string;
        values: ContextItemValue[];
      }>,
    ) {
      const entry = ensureEntry(state, action.payload.scopeId);
      entry.status = "ready";
      entry.fetchedAt = Date.now();
      entry.values = {};
      for (const v of action.payload.values) {
        entry.values[v.context_item_id] = v;
      }
      // Drop drafts that match the new persisted value.
      for (const key of Object.keys(entry.drafts)) {
        if (entry.values[key]) delete entry.drafts[key];
      }
    },
    valuesFetchRejected(
      state,
      action: PayloadAction<{ scopeId: string; error: string }>,
    ) {
      const entry = ensureEntry(state, action.payload.scopeId);
      entry.status = "error";
      entry.error = action.payload.error;
    },

    // ─── Persisted value patches ────────────────────────────────
    valueUpserted(
      state,
      action: PayloadAction<{ scopeId: string; value: ContextItemValue }>,
    ) {
      const entry = ensureEntry(state, action.payload.scopeId);
      entry.values[action.payload.value.context_item_id] = action.payload.value;
      delete entry.drafts[action.payload.value.context_item_id];
    },
    valueRemoved(
      state,
      action: PayloadAction<{ scopeId: string; contextItemId: string }>,
    ) {
      const entry = state.byScope[action.payload.scopeId];
      if (!entry) return;
      delete entry.values[action.payload.contextItemId];
      delete entry.drafts[action.payload.contextItemId];
    },

    // ─── Cell write lifecycle (the scope-context view's save state) ─
    valueSavePending(
      state,
      action: PayloadAction<{ scopeId: string; contextItemId: string }>,
    ) {
      state.savingPairs ??= {};
      state.savingPairs[
        cellKey(action.payload.scopeId, action.payload.contextItemId)
      ] = true;
    },
    valueSaveSettled(
      state,
      action: PayloadAction<{
        scopeId: string;
        contextItemId: string;
        saved: boolean;
      }>,
    ) {
      const key = cellKey(action.payload.scopeId, action.payload.contextItemId);
      if (state.savingPairs) delete state.savingPairs[key];
      if (action.payload.saved) {
        state.lastSavedAt ??= {};
        state.lastSavedAt[key] = Date.now();
      }
    },
    /** Records a scope's type when the scope is not in the tree (see ScopeValuesEntry). */
    scopeTypeResolved(
      state,
      action: PayloadAction<{ scopeId: string; scopeTypeId: string }>,
    ) {
      ensureEntry(state, action.payload.scopeId).scopeTypeId =
        action.payload.scopeTypeId;
    },

    // ─── Drafts (unsaved edits) ─────────────────────────────────
    draftSet(
      state,
      action: PayloadAction<{
        scopeId: string;
        contextItemId: string;
        draft: Partial<ContextItemValue>;
      }>,
    ) {
      const entry = ensureEntry(state, action.payload.scopeId);
      entry.drafts[action.payload.contextItemId] = action.payload.draft;
    },
    draftCleared(
      state,
      action: PayloadAction<{ scopeId: string; contextItemId: string }>,
    ) {
      const entry = state.byScope[action.payload.scopeId];
      if (!entry) return;
      delete entry.drafts[action.payload.contextItemId];
    },
    draftsClearedForScope(state, action: PayloadAction<{ scopeId: string }>) {
      const entry = state.byScope[action.payload.scopeId];
      if (!entry) return;
      entry.drafts = {};
    },

    // ─── Reset ───────────────────────────────────────────────────
    contextValuesReset: () => initialState,
  },
});

export const contextValuesActions = contextValuesSlice.actions;
export default contextValuesSlice.reducer;
