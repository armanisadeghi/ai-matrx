/**
 * Agent Settings Selectors
 *
 * All memoized via createSelector. Components never compute or interpret
 * settings — they only consume these selectors and dispatch actions.
 *
 * All selectors are keyed by agentId for multi-agent support.
 */

import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import {
  selectModelById,
  type AIModel,
} from "@/features/ai-models/redux/modelRegistrySlice";
import type {
  AgentSettings,
  AgentSettingsEntry,
  AgentVariable,
  AvailableTool,
  ConflictItem,
  NormalizedControls,
  PendingModelSwitch,
} from "@/lib/redux/slices/agent-settings/types";
import {
  buildApiPayload,
  getActionForMode,
  mergeEffectiveSettings,
  mergeVariableValues,
  parseModelControls,
  resolveConflicts,
} from "@/lib/redux/slices/agent-settings/internal-utils";

// ── Stable empty references — prevents reference churn in memoized selectors ──

const EMPTY_SETTINGS: Partial<AgentSettings> = {};
const EMPTY_VARIABLES: AgentVariable[] = [];
const EMPTY_OVERRIDES: Record<string, string> = {};
const EMPTY_FIELDS: string[] = [];
const EMPTY_AGENT_SETTINGS_ENTRIES: Record<string, AgentSettingsEntry> = {};
const EMPTY_AVAILABLE_TOOLS: AvailableTool[] = [];

// ── Entry Selectors ────────────────────────────────────────────────────────────

/**
 * Full entry for a given agentId. Returns undefined if not initialized.
 */
export const selectEntry = (
  state: RootState,
  agentId: string,
): AgentSettingsEntry | undefined => state.agentSettings?.entries[agentId];

/**
 * The base defaults loaded from the DB.
 * In builder context: this is the live editable state.
 * In chat/test: this is read-only, overrides go in `selectOverrides`.
 */
export const selectDefaults = (
  state: RootState,
  agentId: string,
): Partial<AgentSettings> =>
  state.agentSettings?.entries[agentId]?.defaults ?? EMPTY_SETTINGS;

/**
 * User-made overrides (chat/test contexts only).
 * Always empty in builder context.
 */
export const selectOverrides = (
  state: RootState,
  agentId: string,
): Partial<AgentSettings> =>
  state.agentSettings?.entries[agentId]?.overrides ?? EMPTY_SETTINGS;

// ── Effective Settings ─────────────────────────────────────────────────────────

/**
 * The merged view: defaults + overrides. This is what the UI displays.
 * Memoized — only recomputes when defaults or overrides change.
 */
export const selectEffectiveSettings = createSelector(
  [
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.defaults ?? EMPTY_SETTINGS,
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.overrides ?? EMPTY_SETTINGS,
  ],
  (defaults, overrides): Partial<AgentSettings> =>
    mergeEffectiveSettings(defaults, overrides),
);

/**
 * The effective model id — reads the generated `model` field from overrides first.
 */
export const selectEffectiveModelId = createSelector(
  [
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.overrides?.model,
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.defaults?.model,
  ],
  (overrideModelId, defaultModelId): string | null =>
    overrideModelId ?? defaultModelId ?? null,
);

/**
 * The display name for the effective model (common_name → name → id).
 * Reads from modelRegistry.
 */
export const selectEffectiveModelName = createSelector(
  [
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.overrides?.model ??
      state.agentSettings?.entries[agentId]?.defaults?.model ??
      null,
    (state: RootState) => state.modelRegistry?.entities,
  ],
  (modelId, entities): string | null => {
    if (!modelId || !entities) return null;
    const model = entities[modelId];
    if (!model) return null;
    return model.common_name || model.name || model.id;
  },
);

// ── Model Controls ─────────────────────────────────────────────────────────────

/**
 * Parsed NormalizedControls for the effective model.
 * Reads model.controls from modelRegistry and parses on demand.
 * Memoized by modelId — only re-parses when the model changes.
 */
export const selectNormalizedControls = createSelector(
  [
    (state: RootState, agentId: string) => {
      const modelId =
        state.agentSettings?.entries[agentId]?.overrides?.model ??
        state.agentSettings?.entries[agentId]?.defaults?.model ??
        null;
      if (!modelId) return null;
      return selectModelById(state, modelId);
    },
  ],
  (model): NormalizedControls | null => {
    if (!model) return null;
    return parseModelControls(model.controls as Record<string, unknown> | null);
  },
);

// ── Pending Switch ─────────────────────────────────────────────────────────────

export const selectPendingSwitch = (
  state: RootState,
  agentId: string,
): PendingModelSwitch | null =>
  state.agentSettings?.entries[agentId]?.pendingSwitch ?? null;

export const selectHasPendingSwitch = (
  state: RootState,
  agentId: string,
): boolean =>
  (state.agentSettings?.entries[agentId]?.pendingSwitch ?? null) !== null;

/**
 * Live preview of what the settings will look like IF the user confirms
 * the current pending switch with the current mode + customActions.
 * Updates in real time as the user toggles resolution options.
 */
export const selectPreviewedResolution = createSelector(
  [
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.defaults ?? EMPTY_SETTINGS,
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.overrides ?? EMPTY_SETTINGS,
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.pendingSwitch ?? null,
  ],
  (defaults, overrides, pendingSwitch): Partial<AgentSettings> | null => {
    if (!pendingSwitch) return null;

    const currentEffective = mergeEffectiveSettings(defaults, overrides);
    const resolved = resolveConflicts(currentEffective, pendingSwitch);

    return {
      ...resolved,
      model: pendingSwitch.newModelId,
    };
  },
);

/**
 * The per-conflict actions given the current resolution mode.
 * Used by the conflict dialog to show "Keep" / "Remove" / "Reset" per row.
 */
export const selectConflictActions = createSelector(
  [
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.pendingSwitch ?? null,
  ],
  (pendingSwitch): Record<string, "keep" | "reset"> => {
    if (!pendingSwitch) return {};

    const result: Record<string, "keep" | "reset"> = {};
    for (const conflict of pendingSwitch.conflicts) {
      result[conflict.key as string] = getActionForMode(
        pendingSwitch.mode,
        conflict,
        pendingSwitch.customActions,
      );
    }
    return result;
  },
);

/**
 * Summary counts for the conflict dialog footer.
 */
export const selectConflictSummary = createSelector(
  [
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.pendingSwitch ?? null,
  ],
  (
    pendingSwitch,
  ): {
    totalConflicts: number;
    unsupportedCount: number;
    invalidValueCount: number;
    supportedCount: number;
    willRemoveCount: number;
    willResetCount: number;
    willKeepCount: number;
  } => {
    if (!pendingSwitch) {
      return {
        totalConflicts: 0,
        unsupportedCount: 0,
        invalidValueCount: 0,
        supportedCount: 0,
        willRemoveCount: 0,
        willResetCount: 0,
        willKeepCount: 0,
      };
    }

    const { conflicts, mode, customActions, supportedKeys } = pendingSwitch;

    let willRemoveCount = 0;
    let willResetCount = 0;
    let willKeepCount = 0;

    for (const conflict of conflicts) {
      const action = getActionForMode(mode, conflict, customActions);
      if (action === "reset") {
        if (conflict.reason === "unsupported_key") {
          willRemoveCount++;
        } else {
          willResetCount++;
        }
      } else {
        willKeepCount++;
      }
    }

    return {
      totalConflicts: conflicts.length,
      unsupportedCount: conflicts.filter(
        (c: ConflictItem) => c.reason === "unsupported_key",
      ).length,
      invalidValueCount: conflicts.filter(
        (c: ConflictItem) => c.reason !== "unsupported_key",
      ).length,
      supportedCount: supportedKeys.length,
      willRemoveCount,
      willResetCount,
      willKeepCount,
    };
  },
);

// ── API Payload ────────────────────────────────────────────────────────────────

/**
 * The payload to send to the Python backend.
 * - builder/test: full effective settings minus UI-only flags
 * - chat: only overrides delta minus UI-only flags
 *
 * Components should never call buildApiPayload themselves — use this selector.
 */
export const selectApiPayload = createSelector(
  [
    (state: RootState, agentId: string) =>
      mergeEffectiveSettings(
        state.agentSettings?.entries[agentId]?.defaults ?? EMPTY_SETTINGS,
        state.agentSettings?.entries[agentId]?.overrides ?? EMPTY_SETTINGS,
      ),
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.overrides ?? EMPTY_SETTINGS,
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.context ?? "builder",
  ],
  (effectiveSettings, overrides, context): Partial<AgentSettings> =>
    buildApiPayload(effectiveSettings, overrides, context),
);

// ── Override Tracking ──────────────────────────────────────────────────────────

export const selectHasOverrides = (
  state: RootState,
  agentId: string,
): boolean =>
  Object.keys(
    state.agentSettings?.entries[agentId]?.overrides ?? EMPTY_SETTINGS,
  ).length > 0;

/**
 * Names of all fields that are currently overridden from defaults.
 */
export const selectOverriddenFields = createSelector(
  [
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.overrides ?? EMPTY_SETTINGS,
  ],
  (overrides): (keyof AgentSettings)[] =>
    Object.keys(overrides) as (keyof AgentSettings)[],
);

// ── Variables ──────────────────────────────────────────────────────────────────

export const selectVariableDefaults = (
  state: RootState,
  agentId: string,
): AgentVariable[] =>
  state.agentSettings?.entries[agentId]?.variable_defaults ?? EMPTY_VARIABLES;

export const selectVariableOverrides = (
  state: RootState,
  agentId: string,
): Record<string, string> =>
  state.agentSettings?.entries[agentId]?.variable_overrides ?? EMPTY_OVERRIDES;

export const selectHasVariables = (
  state: RootState,
  agentId: string,
): boolean =>
  (state.agentSettings?.entries[agentId]?.variable_defaults?.length ?? 0) > 0;

/**
 * Flat name→value map: variable_defaults merged with variable_overrides.
 * This is what variable input components read.
 */
export const selectEffectiveVariableValues = createSelector(
  [
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.variable_defaults ??
      EMPTY_VARIABLES,
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.variable_overrides ??
      EMPTY_OVERRIDES,
  ],
  (variableDefaults, variableOverrides): Record<string, string> =>
    mergeVariableValues(variableDefaults, variableOverrides),
);

// ── Status ─────────────────────────────────────────────────────────────────────

export const selectIsDirty = (state: RootState, agentId: string): boolean =>
  state.agentSettings?.entries[agentId]?.isDirty ?? false;

export const selectIsLoading = (state: RootState, agentId: string): boolean =>
  state.agentSettings?.entries[agentId]?.isLoading ?? false;

export const selectIsSaving = (state: RootState, agentId: string): boolean =>
  state.agentSettings?.entries[agentId]?.isSaving ?? false;

export const selectError = (state: RootState, agentId: string): string | null =>
  state.agentSettings?.entries[agentId]?.error ?? null;

export const selectContext = (state: RootState, agentId: string) =>
  state.agentSettings?.entries[agentId]?.context ?? null;

export const selectSource = (state: RootState, agentId: string) =>
  state.agentSettings?.entries[agentId]?.source ?? null;

export const selectLastFetchedAt = (
  state: RootState,
  agentId: string,
): string | null =>
  state.agentSettings?.entries[agentId]?.lastFetchedAt ?? null;

/**
 * Composite status object — for components that need all status fields at once.
 */
export const selectAgentStatus = createSelector(
  [
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.isDirty ?? false,
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.isLoading ?? false,
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.isSaving ?? false,
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.error ?? null,
    (state: RootState, agentId: string) =>
      state.agentSettings?.entries[agentId]?.lastFetchedAt ?? null,
  ],
  (isDirty, isLoading, isSaving, error, lastFetchedAt) => ({
    isDirty,
    isLoading,
    isSaving,
    error,
    lastFetchedAt,
  }),
);

// ── Active Agent Shortcuts ─────────────────────────────────────────────────────

export const selectActiveAgentId = (state: RootState): string | null =>
  state.agentSettings?.activeAgentId ?? null;

/**
 * Effective settings for whichever agent is currently "active".
 * Convenience shortcut — avoids passing agentId everywhere in single-agent views.
 */
export const selectActiveEffectiveSettings = createSelector(
  [
    (state: RootState) => state.agentSettings?.activeAgentId ?? null,
    (state: RootState) =>
      state.agentSettings?.entries ?? EMPTY_AGENT_SETTINGS_ENTRIES,
  ],
  (activeAgentId, entries): Partial<AgentSettings> => {
    if (!activeAgentId) return EMPTY_SETTINGS;
    const entry = entries[activeAgentId];
    if (!entry) return EMPTY_SETTINGS;
    return mergeEffectiveSettings(entry.defaults, entry.overrides);
  },
);

export const selectActiveModelId = createSelector(
  [
    (state: RootState) => state.agentSettings?.activeAgentId ?? null,
    (state: RootState) =>
      state.agentSettings?.entries ?? EMPTY_AGENT_SETTINGS_ENTRIES,
  ],
  (activeAgentId, entries): string | null => {
    if (!activeAgentId) return null;
    const entry = entries[activeAgentId];
    if (!entry) return null;
    return entry.overrides?.model ?? entry.defaults?.model ?? null;
  },
);

// ── All Entries (for testing/debugging) ───────────────────────────────────────

export const selectAllEntries = (state: RootState) =>
  state.agentSettings?.entries ?? EMPTY_AGENT_SETTINGS_ENTRIES;

export const selectAllAgentIds = createSelector(
  [
    (state: RootState) =>
      state.agentSettings?.entries ?? EMPTY_AGENT_SETTINGS_ENTRIES,
  ],
  (entries): string[] => Object.keys(entries),
);

// ── Available Tools ────────────────────────────────────────────────────────────

export const selectAvailableTools = (state: RootState) =>
  state.agentSettings?.availableTools ?? EMPTY_AVAILABLE_TOOLS;

export const selectIsLoadingTools = (state: RootState) =>
  state.agentSettings?.isLoadingTools ?? false;
