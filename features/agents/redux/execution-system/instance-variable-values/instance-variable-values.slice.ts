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
import type {
  VariableDefinition,
  VariableResourceContextConfig,
} from "@/features/agents/types/agent-definition.types";
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

  /**
   * Names contributed by the most recent surface-runtime mapping pass.
   * Submit-time refresh replaces exactly this subset without erasing values
   * supplied by the active-scope resolver.
   */
  surfaceValueNames: string[];

  /**
   * Names inside `userValues` that the HOST wired at launch — never typed,
   * dictated or chosen by the person in the room.
   *
   * 🚨 WHY THIS EXISTS (cold walk, jobs-bar-2026-09-16; ruling 2026-09-16).
   * A surface that launches a purpose-built conversation hands the agent its
   * whole job as named variables (THE USER-INPUT LAW) — the Conductor sends
   * `rulebook_id`, `attachments` and the entire rendered `rulebook_document`;
   * the Scout interview sends the mode, the probes and the Expert's goal.
   * Those are correct: they are named, they are the launch request's
   * `variables`, and they are what the Mandate's provision offers. What was
   * wrong is WHERE THEY LANDED — in `userValues`, the tier that means "the
   * person set this" — so `FirstTurnVariables` printed them back inside her
   * own message bubble, in the host's vocabulary:
   *
   *   "Rulebook Document: # … Rulebook id: a84d1c5e-… Status: draft"
   *   "Interview Probes: story_time · Interview Context Mode: blank_slate"
   *
   * 296518e291 hid that from an Expert with the audience gate. This is the
   * honest half: a value the host wired is marked as the host's, so the user
   * bubble never claims it for ANY audience, and the gate stays as belt and
   * braces. Resolution, the three-tier merge and the outbound request are
   * DELIBERATELY unchanged — a host value still wins over scope and default,
   * and still ships. This flag decides authorship, never delivery.
   *
   * The moment the person edits one of these through the ordinary user path,
   * the name leaves this list: it is now genuinely hers.
   */
  hostValueNames: string[];

  /** Per-conversation overrides for media-variable resource-family policy. */
  resourcePolicies: Record<string, VariableResourceContextConfig>;
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

/**
 * A value the person has just set is HERS, whatever wired it first. Called by
 * every ordinary user-value reducer so authorship can only ever move one way.
 */
function releaseHostNames(
  entry: InstanceVariableValuesEntry,
  names: string[],
): void {
  if (!entry.hostValueNames?.length) return;
  entry.hostValueNames = entry.hostValueNames.filter(
    (name) => !names.includes(name),
  );
}

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
        surfaceValueNames: [],
        hostValueNames: [],
        resourcePolicies: {},
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
        releaseHostNames(entry, [name]);
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
        releaseHostNames(entry, Object.keys(values));
      }
    },

    /**
     * Set values the HOST wired at launch, on the person's behalf.
     *
     * Identical to `setUserVariableValues` for resolution and for the outbound
     * request — the only difference is authorship: these names are recorded in
     * `hostValueNames`, so nothing may render them as words the person said.
     * Every `runtime.variables` payload a launcher passes comes through here.
     */
    setHostVariableValues(
      state,
      action: PayloadAction<{
        conversationId: string;
        values: Record<string, unknown>;
      }>,
    ) {
      const { conversationId, values } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (!entry) return;
      Object.assign(entry.userValues, values);
      const names = entry.hostValueNames ?? [];
      for (const name of Object.keys(values)) {
        if (!names.includes(name)) names.push(name);
      }
      entry.hostValueNames = names;
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
        releaseHostNames(entry, [name]);
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

    setRuntimeVariableResourcePolicy(
      state,
      action: PayloadAction<{
        conversationId: string;
        name: string;
        policy: VariableResourceContextConfig;
      }>,
    ) {
      const { conversationId, name, policy } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (entry) entry.resourcePolicies[name] = policy;
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
     * Replace the surface-owned subset of `scopeValues` with a freshly mapped
     * live provider scope. User values remain in their higher-priority tier;
     * unrelated active-scope values remain untouched.
     */
    replaceSurfaceVariableValues(
      state,
      action: PayloadAction<{
        conversationId: string;
        values: Record<string, unknown>;
      }>,
    ) {
      const { conversationId, values } = action.payload;
      const entry = state.byConversationId[conversationId];
      if (!entry) return;
      for (const name of entry.surfaceValueNames ?? []) {
        delete entry.scopeValues[name];
      }
      Object.assign(entry.scopeValues, values);
      entry.surfaceValueNames = Object.keys(values);
    },

    /**
     * Reset all user values — fall back entirely to scope + defaults.
     */
    resetUserVariableValues(state, action: PayloadAction<string>) {
      const entry = state.byConversationId[action.payload];
      if (entry) {
        entry.userValues = {};
        entry.hostValueNames = [];
      }
    },

    clearSubmittedVariableResourcePolicies(
      state,
      action: PayloadAction<{
        conversationId: string;
        submitted: Record<string, VariableResourceContextConfig>;
      }>,
    ) {
      const entry = state.byConversationId[action.payload.conversationId];
      if (!entry) return;
      for (const [name, submitted] of Object.entries(
        action.payload.submitted,
      )) {
        const current = entry.resourcePolicies[name];
        if (current && JSON.stringify(current) === JSON.stringify(submitted)) {
          delete entry.resourcePolicies[name];
        }
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
        surfaceValueNames: [],
        hostValueNames: [],
        resourcePolicies: {},
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
  setHostVariableValues,
  clearUserVariableValue,
  setScopeVariableValues,
  setRuntimeVariableResourcePolicy,
  mergeScopeVariableValues,
  replaceSurfaceVariableValues,
  resetUserVariableValues,
  clearSubmittedVariableResourcePolicies,
  updateInstanceDefinitions,
  removeInstanceVariables,
} = instanceVariableValuesSlice.actions;

export default instanceVariableValuesSlice.reducer;
