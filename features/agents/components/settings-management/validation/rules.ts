/**
 * Validation Rule Registry
 *
 * Every validation constraint is declared here as a self-contained, testable unit.
 * Rules are pure functions: (ResolvedConfig) → ValidationIssue[].
 *
 * To add a new rule:
 *   1. Write the rule object following the ValidationRule interface
 *   2. Add it to the RULES array at the bottom of this file
 *   That's it. The engine picks it up automatically.
 */

import type { ValidationRule, ValidationIssue, ResolvedConfig } from "./types";
import { getControlForKey } from "./resolve-config";
import { evaluateAllConstraints } from "./constraints";

// =============================================================================
// Rule: Unrecognized Keys
// =============================================================================

const unrecognizedKeys: ValidationRule = {
  id: "unrecognized-keys",
  description:
    "Flags setting keys not recognized by the schema or current model",
  severity: "warning",
  category: "unrecognized_key",
  inspects: [],
  validate(config: ResolvedConfig): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const settings = config.settings as Record<string, unknown>;

    for (const key of Object.keys(settings)) {
      const value = settings[key];
      if (value === null || value === undefined) continue;
      if (!config.recognizedKeys.has(key)) {
        issues.push({
          ruleId: "unrecognized-keys",
          key,
          severity: "warning",
          category: "unrecognized_key",
          message: `"${key}" is not a recognized setting for this model`,
          value,
          suggestion: "Remove this key or check for typos",
        });
      }
    }

    return issues;
  },
};

// =============================================================================
// Rule: Invalid Enum Values
// =============================================================================

/**
 * Unwraps response_format from { type: "..." } to the bare string
 * for enum comparison. Other keys pass through unchanged.
 */
function unwrapForComparison(key: string, value: unknown): unknown {
  if (
    key === "response_format" &&
    typeof value === "object" &&
    value !== null &&
    "type" in (value as Record<string, unknown>)
  ) {
    return (value as Record<string, unknown>).type;
  }
  return value;
}

const invalidEnumValues: ValidationRule = {
  id: "invalid-enum-value",
  description:
    "Flags enum settings whose value is not in the model's allowed options",
  severity: "error",
  category: "invalid_value",
  inspects: [],
  validate(config: ResolvedConfig): ValidationIssue[] {
    if (!config.normalizedControls) return [];
    const issues: ValidationIssue[] = [];
    const settings = config.settings as Record<string, unknown>;

    for (const [key, value] of Object.entries(settings)) {
      if (value === null || value === undefined) continue;
      const control = getControlForKey(config.normalizedControls, key);
      if (!control) continue;
      if (control.type !== "enum" || !control.enum?.length) continue;

      // Union-type fields (e.g. tts_voice: string | object[]) use the enum
      // branch only when the runtime value is a string. Arrays/objects indicate
      // the alternate branch and must not be compared against the enum list.
      if (typeof value === "object") continue;

      const compareValue = unwrapForComparison(key, value);
      if (!control.enum.includes(compareValue as string)) {
        issues.push({
          ruleId: "invalid-enum-value",
          key,
          severity: "error",
          category: "invalid_value",
          message: `"${compareValue}" is not a valid option. Expected: ${control.enum.join(", ")}`,
          value,
          suggestion: `Set to one of: ${control.enum.join(", ")}`,
        });
      }
    }

    return issues;
  },
};

// =============================================================================
// Rule: Numeric Range Violations
// =============================================================================

const numericRangeViolation: ValidationRule = {
  id: "numeric-range-violation",
  description:
    "Flags numeric settings outside the model's declared min/max bounds",
  severity: "error",
  category: "range_violation",
  inspects: [],
  validate(config: ResolvedConfig): ValidationIssue[] {
    if (!config.normalizedControls) return [];
    const issues: ValidationIssue[] = [];
    const settings = config.settings as Record<string, unknown>;

    for (const [key, value] of Object.entries(settings)) {
      if (value === null || value === undefined) continue;
      if (typeof value !== "number") continue;
      const control = getControlForKey(config.normalizedControls, key);
      if (!control) continue;
      if (control.type !== "number" && control.type !== "integer") continue;

      if (control.min !== undefined && value < control.min) {
        issues.push({
          ruleId: "numeric-range-violation",
          key,
          severity: "error",
          category: "range_violation",
          message: `${value} is below minimum (${control.min})`,
          value,
          suggestion: `Set to at least ${control.min}`,
        });
      }
      if (control.max !== undefined && value > control.max) {
        issues.push({
          ruleId: "numeric-range-violation",
          key,
          severity: "error",
          category: "range_violation",
          message: `${value} exceeds maximum (${control.max})`,
          value,
          suggestion: `Set to at most ${control.max}`,
        });
      }
    }

    return issues;
  },
};

// =============================================================================
// Rule: Type Mismatch
// =============================================================================

const typeMismatch: ValidationRule = {
  id: "type-mismatch",
  description:
    "Flags settings whose runtime type doesn't match the control's declared type",
  severity: "error",
  category: "type_mismatch",
  inspects: [],
  validate(config: ResolvedConfig): ValidationIssue[] {
    if (!config.normalizedControls) return [];
    const issues: ValidationIssue[] = [];
    const settings = config.settings as Record<string, unknown>;

    for (const [key, value] of Object.entries(settings)) {
      if (value === null || value === undefined) continue;
      const control = getControlForKey(config.normalizedControls, key);
      if (!control) continue;

      const actual = typeof value;
      let mismatch = false;
      let expected = "";

      switch (control.type) {
        case "number":
        case "integer":
          if (actual !== "number") {
            mismatch = true;
            expected = "number";
          }
          break;
        case "boolean":
          if (actual !== "boolean") {
            mismatch = true;
            expected = "boolean";
          }
          break;
        case "string":
          if (actual !== "string") {
            mismatch = true;
            expected = "string";
          }
          break;
        case "string_array":
        case "array":
        case "object_array":
          if (!Array.isArray(value)) {
            mismatch = true;
            expected = "array";
          }
          break;
      }

      if (mismatch) {
        issues.push({
          ruleId: "type-mismatch",
          key,
          severity: "error",
          category: "type_mismatch",
          message: `Expected ${expected} but got ${actual}`,
          value,
          suggestion: `Change to a ${expected} value`,
        });
      }
    }

    return issues;
  },
};

// =============================================================================
// Rule: Cross-field — include_thoughts / thinking_budget coupling
// =============================================================================

const thinkingBudgetCoupling: ValidationRule = {
  id: "thinking-budget-coupling",
  description:
    "When include_thoughts is false, thinking_budget must be -1. " +
    "When include_thoughts is true, thinking_budget must be a positive number.",
  severity: "warning",
  category: "cross_field",
  inspects: ["include_thoughts", "thinking_budget"],
  validate(config: ResolvedConfig): ValidationIssue[] {
    const settings = config.settings as Record<string, unknown>;
    const includeThoughts = settings.include_thoughts;
    const thinkingBudget = settings.thinking_budget;

    if (includeThoughts === undefined || includeThoughts === null) return [];
    if (thinkingBudget === undefined || thinkingBudget === null) return [];

    const issues: ValidationIssue[] = [];

    if (includeThoughts === false && thinkingBudget !== -1) {
      issues.push({
        ruleId: "thinking-budget-coupling",
        key: "thinking_budget",
        severity: "warning",
        category: "cross_field",
        message:
          "thinking_budget should be -1 when include_thoughts is disabled",
        value: thinkingBudget,
        suggestion: "Set thinking_budget to -1 or enable include_thoughts",
      });
    }

    if (
      includeThoughts === true &&
      typeof thinkingBudget === "number" &&
      thinkingBudget <= 0 &&
      thinkingBudget !== -1
    ) {
      issues.push({
        ruleId: "thinking-budget-coupling",
        key: "thinking_budget",
        severity: "warning",
        category: "cross_field",
        message:
          "thinking_budget should be a positive number when include_thoughts is enabled",
        value: thinkingBudget,
        suggestion:
          "Set a positive thinking_budget or disable include_thoughts",
      });
    }

    return issues;
  },
};

// =============================================================================
// Rule: Legacy / Deprecated Keys
// =============================================================================

const LEGACY_KEY_MAP: Record<string, string> = {
  max_tokens: "max_output_tokens",
  output_format: "response_format",
  n: "count",
};

const deprecatedKeys: ValidationRule = {
  id: "deprecated-key",
  description:
    "Flags legacy setting keys that should be remapped to their modern equivalents",
  severity: "info",
  category: "deprecated_key",
  inspects: Object.keys(LEGACY_KEY_MAP),
  validate(config: ResolvedConfig): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const settings = config.settings as Record<string, unknown>;

    for (const [legacyKey, modernKey] of Object.entries(LEGACY_KEY_MAP)) {
      const value = settings[legacyKey];
      if (value === null || value === undefined) continue;
      issues.push({
        ruleId: "deprecated-key",
        key: legacyKey,
        severity: "info",
        category: "deprecated_key",
        message: `"${legacyKey}" is deprecated — use "${modernKey}" instead`,
        value,
        suggestion: `Rename to "${modernKey}"`,
      });
    }

    return issues;
  },
};

// =============================================================================
// Rule: response_format structure check
// =============================================================================

const responseFormatStructure: ValidationRule = {
  id: "response-format-structure",
  description:
    "response_format must be an object with a type property, not a bare string",
  severity: "error",
  category: "schema",
  inspects: ["response_format"],
  validate(config: ResolvedConfig): ValidationIssue[] {
    const settings = config.settings as Record<string, unknown>;
    const rf = settings.response_format;
    if (rf === null || rf === undefined) return [];

    if (typeof rf === "string") {
      if (rf === "text" || rf === "") return [];
      return [
        {
          ruleId: "response-format-structure",
          key: "response_format",
          severity: "error",
          category: "schema",
          message: `response_format must be { type: "${rf}" }, not a bare string`,
          value: rf,
          suggestion: `Change to { type: "${rf}" }`,
        },
      ];
    }

    if (
      typeof rf === "object" &&
      !("type" in (rf as Record<string, unknown>))
    ) {
      return [
        {
          ruleId: "response-format-structure",
          key: "response_format",
          severity: "error",
          category: "schema",
          message:
            "response_format object is missing the required 'type' property",
          value: rf,
          suggestion: 'Add a "type" property (e.g. { type: "json_object" })',
        },
      ];
    }

    return [];
  },
};

// =============================================================================
// (Removed) Rule: Frontend-only keys in settings
//
// Frontend capability flags (tools, image_urls, file_urls, youtube_videos,
// multi_speaker) are legitimate in the agent settings store — they tell the UI
// what a model supports. The API call boundary (selectSettingsOverridesForApi)
// is responsible for stripping them before outbound requests, not the settings
// editor. Flagging them here produced false warnings.
// =============================================================================

// =============================================================================
// Rule: Integer type enforcement
// =============================================================================

const integerTypeEnforcement: ValidationRule = {
  id: "integer-type-enforcement",
  description: "Flags values that should be integers but contain decimals",
  severity: "warning",
  category: "type_mismatch",
  inspects: [],
  validate(config: ResolvedConfig): ValidationIssue[] {
    if (!config.normalizedControls) return [];
    const issues: ValidationIssue[] = [];
    const settings = config.settings as Record<string, unknown>;

    for (const [key, value] of Object.entries(settings)) {
      if (value === null || value === undefined) continue;
      if (typeof value !== "number") continue;
      const control = getControlForKey(config.normalizedControls, key);
      if (!control || control.type !== "integer") continue;

      if (!Number.isInteger(value)) {
        issues.push({
          ruleId: "integer-type-enforcement",
          key,
          severity: "warning",
          category: "type_mismatch",
          message: `${value} should be an integer (no decimals)`,
          value,
          suggestion: `Round to ${Math.round(value)}`,
        });
      }
    }

    return issues;
  },
};

// =============================================================================
// Rule: Unsupported by the selected model
// =============================================================================

// Frontend capability flags are model-independent (stripped before the API
// call), so they must never be flagged as "unsupported".
const UI_CAPABILITY_KEYS = new Set([
  "tools",
  "image_urls",
  "file_urls",
  "youtube_videos",
  "multi_speaker",
]);

const unsupportedByModel: ValidationRule = {
  id: "unsupported-by-model",
  description:
    "Flags settings that hold a value but the selected model does not declare a control for",
  severity: "warning",
  category: "unsupported_by_model",
  inspects: [],
  validate(config: ResolvedConfig): ValidationIssue[] {
    const controls = config.normalizedControls;
    if (!controls) return []; // no model selected → nothing to confirm against

    // Only run when the model actually declares a control schema. A model with
    // zero declared controls is a data gap, not a real incompatibility — those
    // settings surface via the inline "unknown" caution dot instead of a hard
    // issue, so we don't flood the IssueTable with false positives.
    const declaredKeys = Object.keys(
      controls as unknown as Record<string, unknown>,
    ).filter((k) => k !== "rawControls" && k !== "unmappedControls");
    if (declaredKeys.length === 0) return [];

    const issues: ValidationIssue[] = [];
    const settings = config.settings as Record<string, unknown>;

    for (const [key, value] of Object.entries(settings)) {
      if (value === null || value === undefined) continue;
      if (key === "model_id") continue;
      if (UI_CAPABILITY_KEYS.has(key)) continue; // model-independent flags
      if (key in LEGACY_KEY_MAP) continue; // handled by the deprecated-key rule
      if (!config.recognizedKeys.has(key)) continue; // handled by unrecognized-keys
      if (getControlForKey(config.normalizedControls, key)) continue; // supported

      issues.push({
        ruleId: "unsupported-by-model",
        key,
        severity: "warning",
        category: "unsupported_by_model",
        message: `"${key}" is not supported by the selected model`,
        value,
        suggestion:
          "Remove this setting, or switch to a model that supports it",
      });
    }

    return issues;
  },
};

// =============================================================================
// Rule: Model-level constraints (DB-driven)
// =============================================================================

const modelConstraints: ValidationRule = {
  id: "model-constraints",
  description:
    "Evaluates declarative constraints stored on the ai_model record (e.g. required streaming, forbidden keys)",
  severity: "error",
  category: "invalid_value",
  inspects: [],
  validate(config: ResolvedConfig): ValidationIssue[] {
    if (!config.constraints?.length) return [];
    return evaluateAllConstraints(
      config.constraints,
      config.settings as Record<string, unknown>,
    );
  },
};

// =============================================================================
// Registry — the single array every rule lives in
// =============================================================================

export const RULES: readonly ValidationRule[] = [
  unrecognizedKeys,
  invalidEnumValues,
  numericRangeViolation,
  typeMismatch,
  thinkingBudgetCoupling,
  deprecatedKeys,
  responseFormatStructure,
  integerTypeEnforcement,
  unsupportedByModel,
  modelConstraints,
] as const;

/**
 * Look up a rule by ID. Returns undefined if not found.
 */
export function getRuleById(id: string): ValidationRule | undefined {
  return RULES.find((r) => r.id === id);
}
