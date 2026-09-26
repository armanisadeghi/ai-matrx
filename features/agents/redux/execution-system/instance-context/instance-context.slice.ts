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

/**
 * The server's RICH ENVELOPE form of a context value — an object carrying its
 * own `content` plus optional `type` / `label` / `description` /
 * `max_inline_chars` (aidream `ContextManifest.build`). The envelope already
 * says what it is, so the entry takes its type and label from it instead of
 * reporting "json" and the bare key.
 */
const RICH_ENVELOPE_KEYS = new Set([
  "content",
  "mutable",
  "persist",
  "source",
  "type",
  "label",
  "description",
  "max_inline_chars",
  "summary_agent_id",
]);

function envelopeFacts(value: unknown): {
  type?: ContextObjectType;
  label?: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  // Same test as the server's `_split_rich_context_value`: a `content` key AND
  // nothing but envelope keys — `{content, author}` is plain JSON data.
  if (
    !("content" in v) ||
    !Object.keys(v).every((k) => RICH_ENVELOPE_KEYS.has(k))
  )
    return {};
  return {
    type:
      typeof v.type === "string"
        ? (v.type as ContextObjectType)
        : inferType(v.content),
    label: typeof v.label === "string" && v.label.trim() ? v.label : undefined,
  };
}

/**
 * Context keys that belong to ONE turn: they ride with the next message and
 * are consumed when it is sent (the sent user message keeps them in its
 * frozen `context_snapshot`). A quoted passage is the canonical case — it
 * must not silently re-attach itself to every later message.
 */
export const PER_TURN_CONTEXT_KEYS: readonly string[] = ["quoted_passages"];

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
      const envelope = envelopeFacts(value);
      context[key] = {
        key,
        value,
        slotMatched,
        type: type ?? envelope.type ?? inferType(value),
        label: label ?? envelope.label ?? key,
      };
    },

    /**
     * Set multiple context entries at once.
     * Used by shortcut scope mapping and the editor → agent bridge.
     *
     * 🚨 MERGE-ONLY. This upserts every incoming key and NEVER removes one, so
     * `entries: []` clears NOTHING — it is a silent no-op. To clear, dispatch
     * `clearInstanceContext(conversationId)` (all keys) or
     * `removeContextEntry({ conversationId, key })` (one key); to replace only
     * the surface-owned subset, `replaceSurfaceContextEntries`. Never emulate
     * removal by re-sending the map without a key.
     * (Defect 2026-09-12: the agent-app reset path used `entries: []`, so stale
     * per-turn context leaked into the next conversation.)
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
        const envelope = envelopeFacts(entry.value);
        context[entry.key] = {
          key: entry.key,
          value: entry.value,
          slotMatched: entry.slotMatched ?? false,
          type: entry.type ?? envelope.type ?? inferType(entry.value),
          label: entry.label ?? envelope.label ?? entry.key,
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
     * Drop the per-turn keys (`PER_TURN_CONTEXT_KEYS`) once a message carrying
     * them has been submitted.
     */
    consumePerTurnContext(state, action: PayloadAction<string>) {
      const context = state.byConversationId[action.payload];
      if (!context) return;
      for (const key of PER_TURN_CONTEXT_KEYS) delete context[key];
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
  consumePerTurnContext,
  clearInstanceContext,
  removeInstanceContext,
} = instanceContextSlice.actions;

export default instanceContextSlice.reducer;
