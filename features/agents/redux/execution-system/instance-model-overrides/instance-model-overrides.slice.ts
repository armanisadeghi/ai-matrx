/**
 * Instance Model Overrides Slice
 *
 * Manages the three-state override layer for each instance's model config.
 *
 * CRITICAL ARCHITECTURE RULE:
 * baseSettings is copied ONCE from the agent at instance creation time.
 * No selector should ever reference agentId to look up model settings.
 * If the agent is modified or deleted, this instance is unaffected.
 *
 * Three states for any setting key:
 *   - NOT in overrides AND NOT in removals → untouched (falls through to baseSettings)
 *   - IN overrides → changed to a new value
 *   - IN removals → explicitly removed (the API must not receive this key)
 *
 * The agent's definition slice is NEVER accessed from here.
 * Merging happens only in selectors using the instance-owned baseSettings.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { InstanceModelOverrideState } from "@/features/agents/types/instance.types";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import { destroyInstance } from "../conversations/conversations.slice";
import { createInstanceFull } from "../create-instance-full";

// =============================================================================
// State
// =============================================================================

export interface InstanceModelOverridesState {
  byConversationId: Record<string, InstanceModelOverrideState>;
}

const initialState: InstanceModelOverridesState = {
  byConversationId: {},
};

// =============================================================================
// Slice
// =============================================================================

const instanceModelOverridesSlice = createSlice({
  name: "instanceModelOverrides",
  initialState,
  reducers: {
    /**
     * Initialize the override layer for a new instance.
     * Copies baseSettings from the agent ONCE — never look up agentId again.
     */
    initInstanceOverrides(
      state,
      action: PayloadAction<{
        conversationId: string;
        baseSettings?: Partial<FeLlmParams>;
      }>,
    ) {
      const { conversationId, baseSettings = {} } = action.payload;
      state.byConversationId[conversationId] = {
        conversationId,
        baseSettings,
        overrides: {},
        removals: [],
      };
    },

    /**
     * Set one or more override values.
     * If a key was previously in removals, it's moved to overrides.
     */
    setOverrides(
      state,
      action: PayloadAction<{
        conversationId: string;
        changes: Partial<FeLlmParams>;
      }>,
    ) {
      const { conversationId, changes } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (entry) {
        Object.assign(entry.overrides, changes);
        // Remove from removals list if being set
        const changedKeys = Object.keys(changes);
        entry.removals = entry.removals.filter((k) => !changedKeys.includes(k));
      }
    },

    /**
     * Mark a setting key as explicitly removed.
     * Removes it from overrides if present.
     */
    markRemoved(
      state,
      action: PayloadAction<{ conversationId: string; key: string }>,
    ) {
      const { conversationId, key } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (entry) {
        delete (entry.overrides as Record<string, unknown>)[key];
        if (!entry.removals.includes(key)) {
          entry.removals.push(key);
        }
      }
    },

    /**
     * Reset a key to "untouched" — remove from both overrides and removals.
     * The setting falls through to the agent's default.
     */
    resetOverride(
      state,
      action: PayloadAction<{ conversationId: string; key: string }>,
    ) {
      const { conversationId, key } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (entry) {
        delete (entry.overrides as Record<string, unknown>)[key];
        entry.removals = entry.removals.filter((k) => k !== key);
      }
    },

    /**
     * Replace the baseSettings snapshot for an existing instance.
     * Called by the builder sync saga when settings change on the agent
     * definition while an instance is already live.
     *
     * ONLY replaces baseSettings — overrides and removals are untouched so
     * any explicit user overrides set during the builder session are preserved.
     */
    updateBaseSettings(
      state,
      action: PayloadAction<{
        conversationId: string;
        baseSettings: Partial<FeLlmParams>;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.baseSettings = action.payload.baseSettings;
      }
    },

    /**
     * Reset ALL overrides for an instance — back to pure agent defaults.
     */
    resetAllOverrides(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (entry) {
        entry.overrides = {};
        entry.removals = [];
      }
    },

    /**
     * Clean up when an instance is destroyed.
     */
    removeInstanceOverrides(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
    },
  },

  extraReducers: (builder) => {
    // Atomic creation. Manual mode omits `overrides` (Agent Builder reads
    // agent.settings live) — skip seeding so it stays uninit, matching the
    // legacy `if (apiEndpointMode !== "manual")` guard in createManualInstance.
    builder.addCase(createInstanceFull, (state, action) => {
      const { conversationId, overrides } = action.payload;
      if (!overrides) return;
      state.byConversationId[conversationId] = {
        conversationId,
        baseSettings: overrides.baseSettings ?? {},
        overrides: {},
        removals: [],
      };
    });

    // Auto-cleanup when instance is destroyed
    builder.addCase(destroyInstance, (state, action) => {
      delete state.byConversationId[action.payload];
    });
  },
});

export const {
  initInstanceOverrides,
  setOverrides,
  markRemoved,
  resetOverride,
  resetAllOverrides,
  updateBaseSettings,
  removeInstanceOverrides,
} = instanceModelOverridesSlice.actions;

export default instanceModelOverridesSlice.reducer;
