/**
 * Instance Context Slice
 *
 * Manages the deferred context dict for each instance.
 * These are key-value pairs sent in the `context` field of the API request.
 * The model doesn't see them directly — it retrieves them via ctx_get.
 *
 * Context items can match agent-defined slots (which provide type, label,
 * description) or be completely ad-hoc (type inferred from value shape).
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { InstanceContextEntry } from "@/features/agents/types/instance.types";
import type { ContextObjectType } from "@/features/agents/types/agent-api-types";
import { destroyInstance } from "../conversations/conversations.slice";
import { createInstanceFull } from "../create-instance-full";

// =============================================================================
// State
// =============================================================================

export interface InstanceContextState {
  byConversationId: Record<string, Record<string, InstanceContextEntry>>;
  /** Context keys owned by the last live surface mapping pass. */
  surfaceKeysByConversationId: Record<string, string[]>;
}

const initialState: InstanceContextState = {
  byConversationId: {},
  surfaceKeysByConversationId: {},
};

// =============================================================================
// Helpers
// =============================================================================

function inferType(value: unknown): ContextObjectType {
  if (typeof value === "string") {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return "file_url";
    }
    return "text";
  }
  return "json";
}

// =============================================================================
// Slice
// =============================================================================

const instanceContextSlice = createSlice({
  name: "instanceContext",
  initialState,
  reducers: {
    initInstanceContext(
      state,
      action: PayloadAction<{ conversationId: string }>,
    ) {
      state.byConversationId[action.payload.conversationId] = {};
      state.surfaceKeysByConversationId[action.payload.conversationId] = [];
    },

    /**
     * Set a context entry. If the key matches a slot, mark it as slot-matched.
     *
     * Auto-initialises the per-conversation map if it doesn't exist yet —
     * legitimate writers (editor → agent context bridge, scope-map fallbacks)
     * may publish entries before any thunk has explicitly called
     * `initInstanceContext`. Dropping those writes on the floor was the cause
     * of the "AI context isn't working" report.
     */
    setContextEntry(
      state,
      action: PayloadAction<{
        conversationId: string;
        key: string;
        value: unknown;
        slotMatched?: boolean;
        type?: ContextObjectType;
        label?: string;
      }>,
    ) {
      const {
        conversationId,
        key,
        value,
        slotMatched = false,
        type,
        label,
      } = action.payload;

      if (!state.byConversationId[conversationId]) {
        state.byConversationId[conversationId] = {};
      }
      const context = state.byConversationId[conversationId];
      context[key] = {
        key,
        value,
        slotMatched,
        type: type ?? inferType(value),
        label: label ?? key,
      };
    },

    /**
     * Set multiple context entries at once.
     * Used by shortcut scope mapping and the editor → agent bridge.
     *
     * See `setContextEntry` for why this auto-initialises the slot.
     */
    setContextEntries(
      state,
      action: PayloadAction<{
        conversationId: string;
        entries: Array<{
          key: string;
          value: unknown;
          slotMatched?: boolean;
          type?: ContextObjectType;
          label?: string;
        }>;
      }>,
    ) {
      const { conversationId, entries } = action.payload;
      if (!state.byConversationId[conversationId]) {
        state.byConversationId[conversationId] = {};
      }
      const context = state.byConversationId[conversationId];
      for (const entry of entries) {
        context[entry.key] = {
          key: entry.key,
          value: entry.value,
          slotMatched: entry.slotMatched ?? false,
          type: entry.type ?? inferType(entry.value),
          label: entry.label ?? entry.key,
        };
      }
    },

    /**
     * Replace only the context entries contributed by surface scope mapping.
     * Other context writers keep their keys; refreshed surface keys overwrite
     * same-named entries because explicit value_mappings are the stronger
     * context layer in the canonical resolver.
     */
    replaceSurfaceContextEntries(
      state,
      action: PayloadAction<{
        conversationId: string;
        entries: InstanceContextEntry[];
      }>,
    ) {
      const { conversationId, entries } = action.payload;
      if (!state.byConversationId[conversationId]) {
        state.byConversationId[conversationId] = {};
      }
      const context = state.byConversationId[conversationId];
      for (const key of state.surfaceKeysByConversationId[conversationId] ??
        []) {
        delete context[key];
      }
      for (const entry of entries) {
        context[entry.key] = entry;
      }
      state.surfaceKeysByConversationId[conversationId] = entries.map(
        (entry) => entry.key,
      );
    },

    /**
     * Remove a context entry.
     */
    removeContextEntry(
      state,
      action: PayloadAction<{ conversationId: string; key: string }>,
    ) {
      const { conversationId, key } = action.payload;
      const context = state.byConversationId[conversationId];
      if (context) {
        delete context[key];
      }
    },

    /**
     * Clear all context for an instance.
     */
    clearInstanceContext(state, action: PayloadAction<string>) {
      state.byConversationId[action.payload] = {};
      state.surfaceKeysByConversationId[action.payload] = [];
    },

    removeInstanceContext(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
      delete state.surfaceKeysByConversationId[action.payload];
    },
  },

  extraReducers: (builder) => {
    builder.addCase(createInstanceFull, (state, action) => {
      state.byConversationId[action.payload.conversationId] = {};
      state.surfaceKeysByConversationId[action.payload.conversationId] = [];
    });

    builder.addCase(destroyInstance, (state, action) => {
      delete state.byConversationId[action.payload];
      delete state.surfaceKeysByConversationId[action.payload];
    });
  },
});

export const {
  initInstanceContext,
  setContextEntry,
  setContextEntries,
  replaceSurfaceContextEntries,
  removeContextEntry,
  clearInstanceContext,
  removeInstanceContext,
} = instanceContextSlice.actions;

export default instanceContextSlice.reducer;
