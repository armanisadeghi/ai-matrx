/**
 * Instance Variable Values Slice
 *
 * Stores the resolved variable values AND the variable definitions snapshot
 * for each execution instance.
 *
 * CRITICAL ARCHITECTURE RULE:
 * The definitions are copied ONCE from the agent at instance creation time.
 * After that, no selector or component should ever reference agentId to look
 * up variable definitions. If the agent is modified or deleted, this instance
 * is unaffected — it owns its own complete copy.
 *
 * Values come from three sources in priority order:
 *   1. User-provided (typed into the instance form)
 *   2. Scope-resolved (auto-populated from context at creation time)
 *   3. Definition defaults (from the snapshotted definitions below)
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import { destroyInstance } from "../conversations/conversations.slice";
import { createInstanceFull } from "../create-instance-full";

// =============================================================================
// State
// =============================================================================

export interface InstanceVariableValuesEntry {
  conversationId: string;

  /**
   * Snapshot of variable definitions copied from the agent at instance creation.
   * Never read from agentDefinition after this point.
   */
  definitions: VariableDefinition[];

  /** Values explicitly set by the user */
  userValues: Record<string, unknown>;

  /** Values auto-populated from scope/context at creation time */
  scopeValues: Record<string, unknown>;
}

export interface InstanceVariableValuesState {
  byConversationId: Record<string, InstanceVariableValuesEntry>;
}

const initialState: InstanceVariableValuesState = {
  byConversationId: {},
};

// =============================================================================
// Slice
// =============================================================================

const instanceVariableValuesSlice = createSlice({
  name: "instanceVariableValues",
  initialState,
  reducers: {
    /**
     * Initialize variable values for a new instance.
     * Copies definitions from the agent ONCE — never look up agentId again.
     */
    initInstanceVariables(
      state,
      action: PayloadAction<{
        conversationId: string;
        /** Snapshot of variable definitions from the agent. Required for isolation. */
        definitions?: VariableDefinition[];
        scopeValues?: Record<string, unknown>;
      }>,
    ) {
      const {
        conversationId,
        definitions = [],
        scopeValues = {},
      } = action.payload;
      state.byConversationId[conversationId] = {
        conversationId,
        definitions,
        userValues: {},
        scopeValues,
      };
    },

    /**
     * Set a user-provided variable value.
     * This takes highest priority in resolution.
     */
    setUserVariableValue(
      state,
      action: PayloadAction<{
        conversationId: string;
        name: string;
        value: unknown;
      }>,
    ) {
      const { conversationId, name, value } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (entry) {
        entry.userValues[name] = value;
      }
    },

    /**
     * Set multiple user-provided variable values at once.
     */
    setUserVariableValues(
      state,
      action: PayloadAction<{
        conversationId: string;
        values: Record<string, unknown>;
      }>,
    ) {
      const { conversationId, values } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (entry) {
        Object.assign(entry.userValues, values);
      }
    },

    /**
     * Clear a user-provided value, falling back to scope or default.
     */
    clearUserVariableValue(
      state,
      action: PayloadAction<{ conversationId: string; name: string }>,
    ) {
      const { conversationId, name } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (entry) {
        delete entry.userValues[name];
      }
    },

    /**
     * Replace scope-resolved values (after a scope resolution RPC).
     */
    setScopeVariableValues(
      state,
      action: PayloadAction<{
        conversationId: string;
        values: Record<string, unknown>;
      }>,
    ) {
      const { conversationId, values } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (entry) {
        entry.scopeValues = values;
      }
    },

    /**
     * Merge scope-resolved values into the existing map (does NOT replace).
     * Used by the bound-variable runtime to fold in values resolved from the active
     * scope without clobbering any values set at instance creation.
     */
    mergeScopeVariableValues(
      state,
      action: PayloadAction<{
        conversationId: string;
        values: Record<string, unknown>;
      }>,
    ) {
      const { conversationId, values } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (entry) {
        Object.assign(entry.scopeValues, values);
      }
    },

    /**
     * Reset all user values — fall back entirely to scope + defaults.
     */
    resetUserVariableValues(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (entry) {
        entry.userValues = {};
      }
    },

    /**
     * Replace the definitions snapshot for an existing instance.
     * Called by the builder sync saga when variableDefinitions change on the
     * agent definition while an instance is already live.
     *
     * ONLY replaces definitions — userValues and scopeValues are untouched so
     * any values the user has already entered are preserved.
     */
    updateInstanceDefinitions(
      state,
      action: PayloadAction<{
        conversationId: string;
        definitions: VariableDefinition[];
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (entry) {
        entry.definitions = action.payload.definitions;
      }
    },

    removeInstanceVariables(state, action: PayloadAction<string>) {
      delete state.byConversationId[action.payload];
    },
  },

  extraReducers: (builder) => {
    builder.addCase(createInstanceFull, (state, action) => {
      const { conversationId, variables } = action.payload;
      state.byConversationId[conversationId] = {
        conversationId,
        definitions: variables?.definitions ?? [],
        userValues: {},
        scopeValues: variables?.scopeValues ?? {},
      };
    });

    builder.addCase(destroyInstance, (state, action) => {
      delete state.byConversationId[action.payload];
    });
  },
});

export const {
  initInstanceVariables,
  setUserVariableValue,
  setUserVariableValues,
  clearUserVariableValue,
  setScopeVariableValues,
  mergeScopeVariableValues,
  resetUserVariableValues,
  updateInstanceDefinitions,
  removeInstanceVariables,
} = instanceVariableValuesSlice.actions;

export default instanceVariableValuesSlice.reducer;
