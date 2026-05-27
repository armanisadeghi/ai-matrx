/**
 * Agent Settings Slice
 *
 * Single source of truth for agent/prompt settings across all contexts:
 *   - Prompt Builder: edits go directly to defaults, saved to DB
 *   - Chat: overrides tracked separately, never saved to DB
 *   - Test: multiple agents in memory simultaneously
 *
 * All business logic (controls parsing, conflict detection, merge resolution,
 * override diffing, API payload building) lives in internal-utils.ts and is
 * invoked here. Components never compute or interpret settings themselves.
 */

import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { createClient } from "@/utils/supabase/client";
import {
  selectModelById,
  type AIModel,
} from "@/features/ai-models/redux/modelRegistrySlice";
import type {
  AgentContext,
  AgentSettings,
  AgentSettingsEntry,
  AgentSettingsState,
  AgentSource,
  AgentVariable,
  ConflictAction,
  RawAgentDbRow,
  ResolutionMode,
} from "./types";
import {
  buildApiPayload,
  computeOverrideDiff,
  detectConflicts,
  extractModelDefaults,
  mergeEffectiveSettings,
  parseModelControls,
  resolveConflicts,
  sanitizeSettings,
} from "./internal-utils";
import type { Json } from "@/types/database.types";

// ── Initial State ──────────────────────────────────────────────────────────────

function makeEmptyEntry(
  agentId: string,
  source: AgentSource,
  context: AgentContext,
): AgentSettingsEntry {
  return {
    agentId,
    source,
    context,
    defaults: {},
    overrides: {},
    variable_defaults: [],
    variable_overrides: {},
    pendingSwitch: null,
    isDirty: false,
    isLoading: false,
    isSaving: false,
    error: null,
    lastFetchedAt: null,
  };
}

const initialState: AgentSettingsState = {
  entries: {},
  activeAgentId: null,
  availableTools: [],
  isLoadingTools: false,
  toolsError: null,
};

// ── Thunks ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all active tools from the `tools` table.
 * Shared across all agents — only needs to run once per session.
 */
export const fetchAvailableTools = createAsyncThunk(
  "agentSettings/fetchAvailableTools",
  async (_, { rejectWithValue }) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("tool_def")
        .select("id, name, description, category, icon")
        .eq("is_active", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string;
        description: string;
        category?: string;
        icon?: string;
      }>;
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Failed to fetch tools",
      );
    }
  },
);

/**
 * Fetch an agent's settings from Supabase and initialize the entry.
 * Determines the table from `source` ('prompt' → prompts, 'builtin' → prompt_builtins).
 */
export const loadAgentSettings = createAsyncThunk(
  "agentSettings/loadAgentSettings",
  async (
    {
      agentId,
      source,
      context = "builder",
    }: { agentId: string; source: AgentSource; context?: AgentContext },
    { rejectWithValue },
  ) => {
    try {
      const supabase = createClient();
      const table = source === "builtin" ? "prompt_builtins" : "prompts";

      const { data, error } = await supabase
        .from(table)
        .select("id, settings, variable_defaults")
        .eq("id", agentId)
        .single();

      if (error) throw error;
      if (!data) throw new Error(`Agent ${agentId} not found in ${table}`);

      const rawSettings = data.settings as AgentSettings;
      // `variable_defaults` is a JSONB column (typed `Json | null` by Supabase).
      // Narrow at the boundary so downstream code can rely on AgentVariable[].
      const rawVariableDefaults = data.variable_defaults as unknown as
        | AgentVariable[]
        | null;

      return {
        agentId,
        source,
        context,
        rawSettings,
        rawVariableDefaults,
      };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Failed to load agent settings",
      );
    }
  },
);

/**
 * Initialize from already-fetched data (e.g. from agentCacheSlice operational depth).
 * No network request — just normalizes and loads into slice state.
 */
export const loadAgentSettingsDirect = createAsyncThunk(
  "agentSettings/loadAgentSettingsDirect",
  async (
    {
      agentId,
      source,
      context = "builder",
      data,
    }: {
      agentId: string;
      source: AgentSource;
      context?: AgentContext;
      data: {
        settings?: AgentSettings | null;
        variable_defaults?: AgentVariable[] | null;
      };
    },
    _thunkApi,
  ) => {
    return {
      agentId,
      source,
      context,
      rawSettings: data.settings ?? null,
      rawVariableDefaults: data.variable_defaults ?? null,
    };
  },
);

/**
 * Core model switch thunk — contains ALL the intelligence.
 *
 * Steps:
 *   1. Get new model from modelRegistry
 *   2. Parse its controls → NormalizedControls
 *   3. Extract its defaults
 *   4. Get current effective settings from state
 *   5. Detect conflicts between current settings and new model's capabilities
 *   6. Store PendingModelSwitch in state for the UI to present
 *
 * The UI reads pendingSwitch from the slice and dispatches resolution actions.
 * No model change is applied until confirmModelSwitch is dispatched.
 */
export const requestModelSwitch = createAsyncThunk(
  "agentSettings/requestModelSwitch",
  async (
    { agentId, newModelId }: { agentId: string; newModelId: string },
    { getState, rejectWithValue },
  ) => {
    const state = getState() as {
      agentSettings: AgentSettingsState;
    } & Parameters<typeof selectModelById>[0];
    const newModel = selectModelById(state, newModelId);

    if (!newModel) {
      return rejectWithValue(`Model ${newModelId} not found in registry`);
    }

    const entry = state.agentSettings?.entries[agentId];
    if (!entry) {
      return rejectWithValue(`Agent ${agentId} not found in agentSettings`);
    }

    // Parse new model's controls
    const newControls = parseModelControls(
      newModel.controls as Record<string, unknown> | null,
    );

    // Extract new model's defaults
    const newDefaults = extractModelDefaults(
      newModel.controls as Record<string, unknown> | null,
    );

    // Get current effective settings (defaults merged with overrides)
    const currentEffective = mergeEffectiveSettings(
      entry.defaults,
      entry.overrides,
    );

    // Detect conflicts
    const { conflicts, supportedKeys } = detectConflicts(
      currentEffective,
      newControls,
      newDefaults,
    );

    // Get model display names
    const prevModelId =
      currentEffective.model_id ?? entry.defaults.model_id ?? "";
    const prevModel = selectModelById(
      state as Parameters<typeof selectModelById>[0],
      prevModelId,
    );
    const prevModelName =
      prevModel?.common_name || prevModel?.name || prevModelId || "Unknown";
    const newModelName = newModel.common_name || newModel.name || newModelId;

    return {
      agentId,
      pendingSwitch: {
        prevModelId,
        prevModelName,
        newModelId,
        newModelName,
        conflicts,
        supportedKeys,
        newModelControls: newControls,
        mode: "auto_resolve" as ResolutionMode,
        customActions: {},
      },
      newDefaults,
    };
  },
);

/**
 * Save agent settings to the database.
 * Context-aware:
 *   - 'builder': merges overrides into defaults, writes to DB
 *   - 'chat': no DB write (overrides are session-ephemeral)
 *   - 'test': no-op (in-memory only)
 */
export const saveAgentSettings = createAsyncThunk(
  "agentSettings/saveAgentSettings",
  async ({ agentId }: { agentId: string }, { getState, rejectWithValue }) => {
    const state = getState() as { agentSettings: AgentSettingsState };
    const entry = state.agentSettings?.entries[agentId];

    if (!entry) {
      return rejectWithValue(`Agent ${agentId} not found`);
    }

    // Only builder context writes to DB
    if (entry.context !== "builder") {
      return { agentId, savedAt: null };
    }

    try {
      const supabase = createClient();
      const table = entry.source === "builtin" ? "prompt_builtins" : "prompts";

      // In builder: effective settings = defaults (overrides are always empty in builder)
      const settingsToSave = entry.defaults;
      const now = new Date().toISOString();

      const { error } = await supabase
        .from(table)
        .update({
          settings: settingsToSave as unknown as Json,
          variable_defaults: entry.variable_defaults as unknown as Json[],
          updated_at: now,
        })
        .eq("id", agentId);

      if (error) throw error;

      return { agentId, savedAt: now };
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Failed to save agent settings",
      );
    }
  },
);

// ── Slice ──────────────────────────────────────────────────────────────────────

const agentSettingsSlice = createSlice({
  name: "agentSettings",
  initialState,
  reducers: {
    // ── Initialization ──────────────────────────────────────────────────────

    /**
     * Directly initialize an entry (synchronous — data already available).
     * Useful for test context or when the data comes from another slice.
     */
    initializeAgent(
      state,
      action: PayloadAction<{
        agentId: string;
        source: AgentSource;
        context: AgentContext;
        settings?: Partial<AgentSettings> | null;
        variable_defaults?: AgentVariable[] | null;
      }>,
    ) {
      const { agentId, source, context, settings, variable_defaults } =
        action.payload;

      state.entries[agentId] = {
        ...makeEmptyEntry(agentId, source, context),
        defaults: sanitizeSettings(settings as Record<string, unknown> | null),
        variable_defaults: variable_defaults ?? [],
        lastFetchedAt: new Date().toISOString(),
      };
    },

    // ── Active Agent ────────────────────────────────────────────────────────

    setActiveAgent(state, action: PayloadAction<string | null>) {
      state.activeAgentId = action.payload;
    },

    removeAgent(state, action: PayloadAction<string>) {
      delete state.entries[action.payload];
      if (state.activeAgentId === action.payload) {
        state.activeAgentId = null;
      }
    },

    // ── Overrides (chat/test contexts) ──────────────────────────────────────

    /**
     * Set a single field override. Marks isDirty.
     * For 'builder' context use updateDefaults instead.
     */
    setOverride(
      state,
      action: PayloadAction<{
        agentId: string;
        field: keyof AgentSettings;
        value: AgentSettings[keyof AgentSettings];
      }>,
    ) {
      const { agentId, field, value } = action.payload;
      const entry = state.entries[agentId];
      if (!entry) return;

      (entry.overrides as Record<string, unknown>)[field as string] = value;
      entry.isDirty = true;
    },

    /**
     * Apply a full settings object from the dialog. The diff against defaults
     * is computed internally — only true overrides are stored.
     */
    applySettingsFromDialog(
      state,
      action: PayloadAction<{
        agentId: string;
        newSettings: Partial<AgentSettings>;
      }>,
    ) {
      const { agentId, newSettings } = action.payload;
      const entry = state.entries[agentId];
      if (!entry) return;

      if (entry.context === "builder") {
        // In builder: apply directly to defaults
        entry.defaults = {
          ...sanitizeSettings(newSettings as Record<string, unknown>),
        };
        entry.isDirty = true;
      } else {
        // In chat/test: compute true overrides (only what differs from defaults)
        entry.overrides = computeOverrideDiff(entry.defaults, newSettings);
        entry.isDirty = Object.keys(entry.overrides).length > 0;
      }
    },

    resetOverride(
      state,
      action: PayloadAction<{ agentId: string; field: keyof AgentSettings }>,
    ) {
      const { agentId, field } = action.payload;
      const entry = state.entries[agentId];
      if (!entry) return;

      delete (entry.overrides as Record<string, unknown>)[field as string];
      entry.isDirty = Object.keys(entry.overrides).length > 0;
    },

    resetAllOverrides(state, action: PayloadAction<string>) {
      const entry = state.entries[action.payload];
      if (!entry) return;

      entry.overrides = {};
      entry.isDirty = false;
    },

    // ── Defaults (builder context) ──────────────────────────────────────────

    /**
     * Directly update defaults (builder mode — no override tracking).
     * Marks isDirty so the save button activates.
     */
    updateDefaults(
      state,
      action: PayloadAction<{
        agentId: string;
        settings: Partial<AgentSettings>;
      }>,
    ) {
      const { agentId, settings } = action.payload;
      const entry = state.entries[agentId];
      if (!entry) return;

      entry.defaults = {
        ...entry.defaults,
        ...sanitizeSettings(settings as Record<string, unknown>),
      };
      entry.isDirty = true;
    },

    // ── Variables (builder context — mutates defaults) ───────────────────────

    addVariable(
      state,
      action: PayloadAction<{ agentId: string; variable: AgentVariable }>,
    ) {
      const { agentId, variable } = action.payload;
      const entry = state.entries[agentId];
      if (!entry) return;

      entry.variable_defaults.push(variable);
      entry.isDirty = true;
    },

    updateVariable(
      state,
      action: PayloadAction<{
        agentId: string;
        name: string;
        updates: Partial<AgentVariable>;
      }>,
    ) {
      const { agentId, name, updates } = action.payload;
      const entry = state.entries[agentId];
      if (!entry) return;

      const idx = entry.variable_defaults.findIndex((v) => v.name === name);
      if (idx !== -1) {
        entry.variable_defaults[idx] = {
          ...entry.variable_defaults[idx],
          ...updates,
        };
        entry.isDirty = true;
      }
    },

    removeVariable(
      state,
      action: PayloadAction<{ agentId: string; name: string }>,
    ) {
      const { agentId, name } = action.payload;
      const entry = state.entries[agentId];
      if (!entry) return;

      entry.variable_defaults = entry.variable_defaults.filter(
        (v) => v.name !== name,
      );
      entry.isDirty = true;
    },

    // ── Variable Overrides (chat/test contexts) ──────────────────────────────

    setVariableOverride(
      state,
      action: PayloadAction<{ agentId: string; name: string; value: string }>,
    ) {
      const { agentId, name, value } = action.payload;
      const entry = state.entries[agentId];
      if (!entry) return;

      entry.variable_overrides[name] = value;
      entry.isDirty = true;
    },

    resetVariableOverride(
      state,
      action: PayloadAction<{ agentId: string; name: string }>,
    ) {
      const { agentId, name } = action.payload;
      const entry = state.entries[agentId];
      if (!entry) return;

      delete entry.variable_overrides[name];
    },

    resetAllVariableOverrides(state, action: PayloadAction<string>) {
      const entry = state.entries[action.payload];
      if (!entry) return;

      entry.variable_overrides = {};
    },

    // ── Model Switch Resolution ──────────────────────────────────────────────

    /**
     * Change the resolution mode while the conflict dialog is open.
     * Triggers re-render of the previewed resolved settings via selector.
     */
    setResolutionMode(
      state,
      action: PayloadAction<{ agentId: string; mode: ResolutionMode }>,
    ) {
      const { agentId, mode } = action.payload;
      const entry = state.entries[agentId];
      if (!entry?.pendingSwitch) return;

      entry.pendingSwitch.mode = mode;
      // Switching away from custom clears per-key overrides
      if (mode !== "custom") {
        entry.pendingSwitch.customActions = {};
      }
    },

    /**
     * Toggle a single conflict's action when mode is 'custom'.
     * Automatically promotes mode to 'custom' if needed.
     */
    setCustomConflictAction(
      state,
      action: PayloadAction<{
        agentId: string;
        key: keyof AgentSettings;
        conflictAction: ConflictAction;
      }>,
    ) {
      const { agentId, key, conflictAction } = action.payload;
      const entry = state.entries[agentId];
      if (!entry?.pendingSwitch) return;

      entry.pendingSwitch.mode = "custom";
      entry.pendingSwitch.customActions[key] = conflictAction;
    },

    /**
     * Confirm the pending model switch.
     * Resolves conflicts using current mode/customActions and applies the result.
     *
     * - In 'builder': updates defaults directly (the canonical state)
     * - In 'chat'/'test': updates overrides with the model change + resolved settings
     */
    confirmModelSwitch(state, action: PayloadAction<string>) {
      const agentId = action.payload;
      const entry = state.entries[agentId];
      if (!entry?.pendingSwitch) return;

      const pending = entry.pendingSwitch;
      const currentEffective = mergeEffectiveSettings(
        entry.defaults,
        entry.overrides,
      );

      // Apply conflict resolution to get the final settings
      const resolved = resolveConflicts(currentEffective, pending);

      // Always apply the new model_id
      const finalSettings: Partial<AgentSettings> = {
        ...resolved,
        model_id: pending.newModelId,
      };

      if (entry.context === "builder") {
        entry.defaults = finalSettings;
      } else {
        // In chat/test: compute what changed from the base defaults
        entry.overrides = computeOverrideDiff(entry.defaults, finalSettings);
      }

      entry.pendingSwitch = null;
      entry.isDirty = true;
    },

    /**
     * Cancel the pending model switch — revert to previous model, clear pendingSwitch.
     */
    cancelModelSwitch(state, action: PayloadAction<string>) {
      const entry = state.entries[action.payload];
      if (!entry) return;

      entry.pendingSwitch = null;
      // isDirty unchanged — user didn't make any effective change
    },

    // ── Status ──────────────────────────────────────────────────────────────

    setLoading(
      state,
      action: PayloadAction<{ agentId: string; value: boolean }>,
    ) {
      const entry = state.entries[action.payload.agentId];
      if (entry) entry.isLoading = action.payload.value;
    },

    setSaving(
      state,
      action: PayloadAction<{ agentId: string; value: boolean }>,
    ) {
      const entry = state.entries[action.payload.agentId];
      if (entry) entry.isSaving = action.payload.value;
    },

    setError(
      state,
      action: PayloadAction<{ agentId: string; error: string | null }>,
    ) {
      const entry = state.entries[action.payload.agentId];
      if (entry) {
        entry.error = action.payload.error;
        entry.isLoading = false;
        entry.isSaving = false;
      }
    },

    clearError(state, action: PayloadAction<string>) {
      const entry = state.entries[action.payload];
      if (entry) entry.error = null;
    },
  },

  extraReducers: (builder) => {
    // ── loadAgentSettings ──────────────────────────────────────────────────

    builder.addCase(loadAgentSettings.pending, (state, action) => {
      const { agentId, source, context = "builder" } = action.meta.arg;
      if (!state.entries[agentId]) {
        state.entries[agentId] = makeEmptyEntry(agentId, source, context);
      }
      state.entries[agentId].isLoading = true;
      state.entries[agentId].error = null;
    });

    builder.addCase(loadAgentSettings.fulfilled, (state, action) => {
      const { agentId, source, context, rawSettings, rawVariableDefaults } =
        action.payload;

      state.entries[agentId] = {
        ...makeEmptyEntry(agentId, source, context),
        defaults: sanitizeSettings(
          rawSettings as Record<string, unknown> | null,
        ),
        variable_defaults: rawVariableDefaults ?? [],
        lastFetchedAt: new Date().toISOString(),
        isLoading: false,
      };
    });

    builder.addCase(loadAgentSettings.rejected, (state, action) => {
      const { agentId } = action.meta.arg;
      if (state.entries[agentId]) {
        state.entries[agentId].isLoading = false;
        state.entries[agentId].error = action.payload as string;
      }
    });

    // ── loadAgentSettingsDirect ────────────────────────────────────────────

    builder.addCase(loadAgentSettingsDirect.fulfilled, (state, action) => {
      const { agentId, source, context, rawSettings, rawVariableDefaults } =
        action.payload;

      state.entries[agentId] = {
        ...makeEmptyEntry(agentId, source, context),
        defaults: sanitizeSettings(
          rawSettings as Record<string, unknown> | null,
        ),
        variable_defaults: rawVariableDefaults ?? [],
        lastFetchedAt: new Date().toISOString(),
      };
    });

    // ── requestModelSwitch ─────────────────────────────────────────────────

    builder.addCase(requestModelSwitch.fulfilled, (state, action) => {
      const { agentId, pendingSwitch } = action.payload;
      const entry = state.entries[agentId];
      if (!entry) return;

      entry.pendingSwitch = pendingSwitch;
    });

    builder.addCase(requestModelSwitch.rejected, (state, action) => {
      const { agentId } = action.meta.arg;
      const entry = state.entries[agentId];
      if (entry) {
        entry.error = action.payload as string;
      }
    });

    // ── saveAgentSettings ──────────────────────────────────────────────────

    builder.addCase(saveAgentSettings.pending, (state, action) => {
      const entry = state.entries[action.meta.arg.agentId];
      if (entry) {
        entry.isSaving = true;
        entry.error = null;
      }
    });

    builder.addCase(saveAgentSettings.fulfilled, (state, action) => {
      const { agentId, savedAt } = action.payload;
      const entry = state.entries[agentId];
      if (!entry) return;

      entry.isSaving = false;
      entry.isDirty = false;
      if (savedAt) {
        entry.lastFetchedAt = savedAt;
      }
    });

    builder.addCase(saveAgentSettings.rejected, (state, action) => {
      const entry = state.entries[action.meta.arg.agentId];
      if (entry) {
        entry.isSaving = false;
        entry.error = action.payload as string;
      }
    });

    // ── fetchAvailableTools ──────────────────────────────────────────────────
    builder.addCase(fetchAvailableTools.pending, (state) => {
      state.isLoadingTools = true;
      state.toolsError = null;
    });
    builder.addCase(fetchAvailableTools.fulfilled, (state, action) => {
      state.isLoadingTools = false;
      state.availableTools = action.payload;
    });
    builder.addCase(fetchAvailableTools.rejected, (state, action) => {
      state.isLoadingTools = false;
      state.toolsError = action.payload as string;
    });
  },
});

// ── Exports ────────────────────────────────────────────────────────────────────

export const agentSettingsActions = agentSettingsSlice.actions;

export const {
  initializeAgent,
  setActiveAgent,
  removeAgent,
  setOverride,
  applySettingsFromDialog,
  resetOverride,
  resetAllOverrides,
  updateDefaults,
  addVariable,
  updateVariable,
  removeVariable,
  setVariableOverride,
  resetVariableOverride,
  resetAllVariableOverrides,
  setResolutionMode,
  setCustomConflictAction,
  confirmModelSwitch,
  cancelModelSwitch,
  setLoading,
  setSaving,
  setError,
  clearError,
} = agentSettingsSlice.actions;

export default agentSettingsSlice.reducer;

// ── Internal Helpers (re-exported for selectors) ──────────────────────────────

export {
  buildApiPayload,
  detectConflicts,
  extractModelDefaults,
  getActionForMode,
  mergeEffectiveSettings,
  mergeVariableValues,
  parseModelControls,
  resolveConflicts,
  sanitizeSettings,
  computeOverrideDiff,
  PARAM_ALIASES,
} from "./internal-utils";
