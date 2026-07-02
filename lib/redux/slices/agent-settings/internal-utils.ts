/**
 * Agent Settings — Internal Utilities
 *
 * Pure functions with NO Redux imports. No React hooks.
 * All logic that was previously scattered across:
 *   - useModelControls hook
 *   - switchModel thunk
 *   - ModelChangeConflictModal component
 *   - ConversationInput.handleSettingsChange
 *
 * is consolidated here and consumed by the slice's reducers/thunks.
 */

import { LLM_PARAMS_KEYS } from "@/types/python-generated/llm-enums";
import type {
  AgentSettings,
  AgentVariable,
  ConflictAction,
  ConflictItem,
  ConflictReason,
  ControlDefinition,
  ControlType,
  NormalizedControls,
  PendingModelSwitch,
  ResolutionMode,
  UI_ONLY_FIELDS,
} from "./types";
import { AgentContext } from "./types";
import { isUiGateKey, UI_GATE_KEYS } from "./ui-gates";

// Re-export for consumers
export type { AgentContext };

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Cross-provider parameter name synonyms.
 * When a setting key is unsupported by a new model, we check aliases
 * to suggest the equivalent parameter name the new model may use instead.
 */
export const PARAM_ALIASES: Readonly<Record<string, string[]>> = {
  max_tokens: ["max_output_tokens", "max_completion_tokens", "max_new_tokens"],
  max_output_tokens: ["max_tokens", "max_completion_tokens", "max_new_tokens"],
  max_completion_tokens: ["max_tokens", "max_output_tokens"],
  max_new_tokens: ["max_tokens", "max_output_tokens"],
  stop: ["stop_sequences"],
  stop_sequences: ["stop"],
  top_k: ["top_k_tokens"],
  top_k_tokens: ["top_k"],
  presence_penalty: ["repetition_penalty"],
  repetition_penalty: ["presence_penalty"],
  reasoning_budget: ["thinking_budget"],
  thinking_budget: ["reasoning_budget"],
};

/**
 * All known keys — union of LLM_PARAMS_KEYS + legacy/frontend-only keys.
 * Used during controls parsing to separate known from unmapped.
 */
const ALL_KNOWN_KEYS = new Set<string>([
  ...LLM_PARAMS_KEYS,
  // Legacy DB keys — normalizer converts at Redux boundary, but we still recognise them
  "max_tokens",
  "output_format",
  "n",
  // Frontend-only capability flags (never sent to the API)
  "tools",
  "file_urls",
  "image_urls",
  "youtube_videos",
  "multi_speaker",
  "internal_web_search",
  "internal_url_context",
  // Backend param not yet in generated types
  "image_loras",
  // Stop sequences
  "stop_sequences",
]);


// ── Controls Parsing ───────────────────────────────────────────────────────────

/**
 * Parse raw JSONB controls from `ai_model.controls` into a typed NormalizedControls map.
 *
 * Absorbs the logic from `useModelControls` hook.
 *
 * Control JSONB shape per field:
 *   { type?, min?, max?, default?, enum?, required?, allowed? }
 *
 * Special cases:
 *   - `output_format` → remapped to `response_format`
 *   - `allowed: true/false` → boolean feature flag
 *   - enum values that are `{ type: "json_object" }` objects → flattened to string
 */
export function parseModelControls(
  rawControls: Record<string, unknown> | null | undefined,
): NormalizedControls {
  if (
    !rawControls ||
    typeof rawControls !== "object" ||
    Array.isArray(rawControls)
  ) {
    return { rawControls: {}, unmappedControls: {} };
  }

  // Handle double-encoded JSON string (defensive)
  let controls: Record<string, unknown> = rawControls;

  const normalized: NormalizedControls = {
    rawControls: controls,
    unmappedControls: {},
  };

  for (const [key, value] of Object.entries(controls)) {
    // Classify unknown keys
    if (!ALL_KNOWN_KEYS.has(key)) {
      normalized.unmappedControls[key] = value;
      continue;
    }

    // Remap output_format → response_format
    const normalizedKey = key === "output_format" ? "response_format" : key;

    // Guard: control definitions must be plain objects
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      continue;
    }

    const rawControl = value as Record<string, unknown>;

    // Flatten object defaults: { type: "json_object" } → "json_object"
    const rawDefault = rawControl.default;
    const flatDefault =
      rawDefault !== null &&
      typeof rawDefault === "object" &&
      !Array.isArray(rawDefault) &&
      "type" in (rawDefault as Record<string, unknown>)
        ? String((rawDefault as Record<string, unknown>).type)
        : rawDefault;

    const controlDef: ControlDefinition = {
      type: (rawControl.type as ControlType) || "string",
      min: rawControl.min as number | undefined,
      max: rawControl.max as number | undefined,
      default: flatDefault,
      required: rawControl.required as boolean | undefined,
    };

    // Handle enum types — flatten object entries to strings
    if (Array.isArray(rawControl.enum)) {
      controlDef.enum = (rawControl.enum as unknown[]).map((option) => {
        if (
          option !== null &&
          typeof option === "object" &&
          "type" in (option as Record<string, unknown>)
        ) {
          return String((option as Record<string, unknown>).type);
        }
        return String(option);
      });
      controlDef.type = "enum";
    }
    // Handle "allowed" feature flags
    else if ("allowed" in rawControl) {
      controlDef.type = "boolean";
      controlDef.default = rawControl.allowed;
      controlDef.isFeatureFlag = true;
    }
    // Handle plain boolean defaults
    else if (typeof rawControl.default === "boolean") {
      controlDef.type = "boolean";
    }
    // Infer integer vs number from min/max presence
    else if (rawControl.min !== undefined || rawControl.max !== undefined) {
      controlDef.type =
        rawControl.default !== undefined && Number.isInteger(rawControl.default)
          ? "integer"
          : "number";
    }

    (normalized as Record<string, unknown>)[normalizedKey] = controlDef;
  }

  return normalized;
}

// ── Model Defaults Extraction ──────────────────────────────────────────────────

/**
 * Extract submission-ready default values from a model's raw controls JSONB.
 *
 * Absorbs the logic from `getModelDefaults` in `useModelControls`.
 *
 * Rules:
 *   - Controls with `default: null` are SKIPPED (opt-in only controls)
 *   - `tools: { allowed: true }` → `tools: []` (empty list, not a boolean)
 *   - `response_format: "text"` → SKIP (backend treats absence as text)
 *   - `response_format: "json_object"` → `{ type: "json_object" }` (dict form)
 *   - UI-only capability flags (image_urls, file_urls, etc.) → kept as booleans
 */
export function extractModelDefaults(
  rawControls: Record<string, unknown> | null | undefined,
): Partial<AgentSettings> {
  if (
    !rawControls ||
    typeof rawControls !== "object" ||
    Array.isArray(rawControls)
  ) {
    return {};
  }

  const defaults: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawControls)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      continue;
    }

    const rawControl = value as Record<string, unknown>;
    const normalizedKey = key === "output_format" ? "response_format" : key;

    // Model-gated UI flags — `tools` gets special handling. These now live in
    // agent.uiGates, but a model's controls still declare them, so we keep
    // extracting their boolean defaults here. (`multi_speaker` / `internal_*`
    // are REAL params and fall through to the submission-param path below.)
    if (isUiGateKey(normalizedKey)) {
      if (normalizedKey === "tools") {
        // Only add tools array if the model actually allows tools
        if (rawControl.allowed === true) {
          defaults.tools = [];
        }
      } else {
        // Other capability flags (image_urls, file_urls, etc.) — store as boolean
        const flagValue =
          "allowed" in rawControl ? rawControl.allowed : rawControl.default;
        if (flagValue !== null && flagValue !== undefined) {
          defaults[normalizedKey] = Boolean(flagValue);
        }
      }
      continue;
    }

    // Extract default value for actual submission parameters
    let defaultValue: unknown;

    if (rawControl.default !== undefined && rawControl.default !== null) {
      defaultValue = rawControl.default;
    } else if ("allowed" in rawControl) {
      defaultValue = rawControl.allowed;
    } else if (
      Array.isArray(rawControl.enum) &&
      rawControl.enum.length > 0 &&
      rawControl.default === undefined
    ) {
      // Don't auto-pick first enum value — leave undefined if no explicit default
      defaultValue = undefined;
    }

    if (defaultValue === undefined || defaultValue === null) continue;

    // Flatten object default: { type: "json_object" } → "json_object"
    if (
      typeof defaultValue === "object" &&
      !Array.isArray(defaultValue) &&
      "type" in (defaultValue as Record<string, unknown>)
    ) {
      defaultValue = String((defaultValue as Record<string, unknown>).type);
    }

    // response_format special handling
    if (normalizedKey === "response_format") {
      if (typeof defaultValue === "string") {
        if (defaultValue === "text" || defaultValue === "") continue; // omit — text is the default
        defaults[normalizedKey] = { type: defaultValue };
      } else {
        defaults[normalizedKey] = defaultValue;
      }
      continue;
    }

    defaults[normalizedKey] = defaultValue;
  }

  return defaults as Partial<AgentSettings>;
}

// ── Conflict Detection ─────────────────────────────────────────────────────────

/**
 * Detect which keys in `currentSettings` are incompatible with `newControls`.
 *
 * Returns:
 *   - `conflicts`: settings that have problems (unsupported, out-of-range, wrong enum)
 *   - `supportedKeys`: settings that carry over cleanly
 *
 * This is the NEW detection logic that was missing from the existing system
 * (the old ModelChangeConflictModal received conflicts pre-built from above).
 */
export function detectConflicts(
  currentSettings: Partial<AgentSettings>,
  newControls: NormalizedControls,
  newDefaults: Partial<AgentSettings>,
): { conflicts: ConflictItem[]; supportedKeys: Array<keyof AgentSettings> } {
  const conflicts: ConflictItem[] = [];
  const supportedKeys: Array<keyof AgentSettings> = [];

  // Fields to skip from conflict analysis
  const skipKeys = new Set<string>(["model_id", "output_format"]);

  for (const [rawKey, currentValue] of Object.entries(currentSettings)) {
    const key = rawKey as keyof AgentSettings;

    if (skipKeys.has(key)) continue;
    if (currentValue === undefined || currentValue === null) continue;

    const controlDef = newControls[key];

    // Key not in new model's controls at all — check for aliases
    if (!controlDef) {
      const aliasHint = findAliasHint(key as string, newControls);
      conflicts.push({
        key,
        currentValue,
        newModelDefault: (newDefaults as Record<string, unknown>)[key] ?? null,
        reason: "unsupported_key",
        description: aliasHint
          ? `Not supported by this model. Consider using "${aliasHint}" instead.`
          : "Not supported by this model.",
        aliasHint: aliasHint ?? undefined,
      });
      continue;
    }

    // Check numeric range
    if (
      (controlDef.type === "number" || controlDef.type === "integer") &&
      typeof currentValue === "number"
    ) {
      const tooLow =
        controlDef.min !== undefined && currentValue < controlDef.min;
      const tooHigh =
        controlDef.max !== undefined && currentValue > controlDef.max;

      if (tooLow || tooHigh) {
        const rangeStr = formatRange(controlDef);
        conflicts.push({
          key,
          currentValue,
          newModelDefault:
            (newDefaults as Record<string, unknown>)[key] ??
            controlDef.default ??
            null,
          reason: "value_out_of_range",
          description: `Value ${currentValue} is outside the supported range ${rangeStr}.`,
        });
        continue;
      }
    }

    // Check enum validity
    if (
      controlDef.type === "enum" &&
      Array.isArray(controlDef.enum) &&
      typeof currentValue === "string"
    ) {
      if (!controlDef.enum.includes(currentValue)) {
        conflicts.push({
          key,
          currentValue,
          newModelDefault:
            (newDefaults as Record<string, unknown>)[key] ??
            controlDef.default ??
            null,
          reason: "invalid_enum_value",
          description: `"${currentValue}" is not valid for this model. Supported: ${controlDef.enum.join(", ")}.`,
        });
        continue;
      }
    }

    // Fully compatible
    supportedKeys.push(key);
  }

  return { conflicts, supportedKeys };
}

function findAliasHint(
  key: string,
  controls: NormalizedControls,
): string | null {
  const aliases = PARAM_ALIASES[key];
  if (!aliases) return null;
  return (
    aliases.find(
      (alias) => (controls as Record<string, unknown>)[alias] !== undefined,
    ) ?? null
  );
}

function formatRange(def: ControlDefinition): string {
  if (def.min !== undefined && def.max !== undefined) {
    return `[${def.min}, ${def.max}]`;
  }
  if (def.min !== undefined) return `[${def.min}, ∞)`;
  if (def.max !== undefined) return `(-∞, ${def.max}]`;
  return "(unbounded)";
}

// ── Conflict Resolution ────────────────────────────────────────────────────────

/**
 * Apply a pending switch's resolution mode + custom actions to produce
 * the final settings after the model change is confirmed.
 *
 * Absorbs `computeResolvedSettings` from ModelChangeConflictModal.
 */
export function resolveConflicts(
  currentSettings: Partial<AgentSettings>,
  pending: PendingModelSwitch,
): Partial<AgentSettings> {
  const resolved: Record<string, unknown> = { ...currentSettings };

  for (const conflict of pending.conflicts) {
    const action = getActionForMode(
      pending.mode,
      conflict,
      pending.customActions,
    );

    if (action === "reset") {
      if (
        conflict.reason !== "unsupported_key" &&
        conflict.newModelDefault !== undefined &&
        conflict.newModelDefault !== null
      ) {
        // Reset to new model's default value
        resolved[conflict.key as string] = conflict.newModelDefault;
      } else {
        // Remove the key entirely (unsupported)
        delete resolved[conflict.key as string];
      }
    }
    // 'keep' → leave as-is
  }

  return resolved as Partial<AgentSettings>;
}

/**
 * Determine the action ('keep' | 'reset') for a conflict given the current mode.
 * Absorbs `getActionForMode` from ModelChangeConflictModal.
 */
export function getActionForMode(
  mode: ResolutionMode,
  conflict: ConflictItem,
  customActions: Partial<Record<keyof AgentSettings, ConflictAction>>,
): ConflictAction {
  switch (mode) {
    case "keep_all":
      return "keep";
    case "auto_resolve":
      return "reset";
    case "remove_only":
      return conflict.reason === "unsupported_key" ? "reset" : "keep";
    case "custom":
      return customActions[conflict.key] ?? "keep";
  }
}

// ── Override Diff Computation ──────────────────────────────────────────────────

/**
 * Compare `proposed` settings against `defaults` and return only the keys
 * that genuinely differ. Uses JSON-stringify for deep comparison.
 *
 * Absorbs the diff logic from ConversationInput.handleSettingsChange.
 * In chat/test contexts, only true overrides are stored — not redundant defaults.
 */
export function computeOverrideDiff(
  defaults: Partial<AgentSettings>,
  proposed: Partial<AgentSettings>,
): Partial<AgentSettings> {
  const diff: Partial<AgentSettings> = {};

  for (const [key, proposedValue] of Object.entries(proposed)) {
    const defaultValue = (defaults as Record<string, unknown>)[key];
    if (JSON.stringify(proposedValue) !== JSON.stringify(defaultValue)) {
      (diff as Record<string, unknown>)[key] = proposedValue;
    }
  }

  return diff;
}

// ── API Payload Builder ────────────────────────────────────────────────────────

/** All UI-only field names — never sent to the Python backend. The model-gated
 *  UI flags (now in agent.uiGates) are pulled from the canonical UI_GATE_KEYS so
 *  a flattened value can never leak; the rest are genuine FE-only settings. */
const UI_ONLY_SET = new Set<string>([
  ...UI_GATE_KEYS,
  "internal_web_search",
  "internal_url_context",
  "output_format", // deprecated
]);

/**
 * Build the payload to send to the Python backend for a given context.
 *
 * - 'builder': full effective settings minus UI-only flags
 * - 'chat': only the overrides delta minus UI-only flags
 *   (backend already has the agent's defaults — only send what changed)
 * - 'test': same as builder (full effective settings)
 */
export function buildApiPayload(
  effectiveSettings: Partial<AgentSettings>,
  overrides: Partial<AgentSettings>,
  context: AgentContext,
): Partial<AgentSettings> {
  const source = context === "chat" ? overrides : effectiveSettings;

  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (UI_ONLY_SET.has(key)) continue;
    if (value === undefined || value === null) continue;
    payload[key] = value;
  }

  return payload as Partial<AgentSettings>;
}

// ── Effective Settings Merge ───────────────────────────────────────────────────

/**
 * Merge defaults + overrides into the effective settings the UI should display.
 * Overrides take precedence field-by-field.
 */
export function mergeEffectiveSettings(
  defaults: Partial<AgentSettings>,
  overrides: Partial<AgentSettings>,
): Partial<AgentSettings> {
  return { ...defaults, ...overrides };
}

// ── Variable Utilities ─────────────────────────────────────────────────────────

/**
 * Produce a flat name→value map from variable_defaults merged with variable_overrides.
 * Used by variable input components to read current values without prop drilling.
 */
export function mergeVariableValues(
  variableDefaults: AgentVariable[],
  variableOverrides: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const variable of variableDefaults) {
    result[variable.name] = String(variable.defaultValue ?? "");
  }

  // Overrides win
  for (const [name, value] of Object.entries(variableOverrides)) {
    result[name] = value;
  }

  return result;
}

// ── Settings Sanitization ──────────────────────────────────────────────────────

/**
 * Strip null/undefined fields from a settings object.
 * Used when loading from DB to ensure the state is clean.
 */
export function sanitizeSettings(
  raw: Record<string, unknown> | null | undefined,
): Partial<AgentSettings> {
  if (!raw || typeof raw !== "object") return {};

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== null && value !== undefined) {
      clean[key] = value;
    }
  }

  return clean as Partial<AgentSettings>;
}
