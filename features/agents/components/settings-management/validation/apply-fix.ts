/**
 * Pure helper: given a ValidationIssue and the current settings, return a new
 * settings object with the issue auto-resolved.
 *
 * Used by both the per-row "fix" button and the "Fix all fixable" bulk action.
 * Extracted so the two surfaces share one code path.
 */

import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import type {
  NormalizedControls,
  ControlDefinition,
} from "@/features/agents/hooks/useModelControls";
import type { ValidationIssue } from "./types";
import { getControlForKey } from "./resolve-config";

// ─── Remap table for deprecated keys ──────────────────────────────────────────
const DEPRECATED_KEY_REMAP: Record<string, string> = {
  max_tokens: "max_output_tokens",
  output_format: "response_format",
  n: "count",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function controlDefault(control: ControlDefinition): unknown {
  if (control.default !== undefined && control.default !== null) {
    return control.default;
  }
  if (control.type === "enum" && control.enum?.length) {
    return control.enum[0];
  }
  if (control.type === "number" || control.type === "integer") {
    return control.min ?? 0;
  }
  if (control.type === "boolean") return false;
  if (control.type === "string" || control.type === "string_array") return "";
  if (control.type === "array" || control.type === "object_array") return [];
  return undefined;
}

function clampNumber(
  value: unknown,
  min: number | undefined,
  max: number | undefined,
): number | undefined {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return undefined;
  let out = n;
  if (min !== undefined) out = Math.max(out, min);
  if (max !== undefined) out = Math.min(out, max);
  return out;
}

function omitKey(
  settings: FeLlmParams,
  key: string,
): FeLlmParams {
  const { [key]: _drop, ...rest } = settings as Record<string, unknown>;
  return rest as FeLlmParams;
}

function setKey(
  settings: FeLlmParams,
  key: string,
  value: unknown,
): FeLlmParams {
  if (value === undefined) return omitKey(settings, key);
  return { ...settings, [key]: value } as FeLlmParams;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * True when `applyFixForIssue` will produce a meaningful, deterministic change
 * for this issue. False for issues the user has to resolve manually.
 */
export function canFixIssue(
  issue: ValidationIssue,
  normalizedControls: NormalizedControls | null,
): boolean {
  switch (issue.category) {
    case "unrecognized_key":
      return true;
    case "unsupported_by_model":
      // Deterministic: clear the key the model can't accept.
      return true;
    case "deprecated_key":
      return issue.key in DEPRECATED_KEY_REMAP;
    case "invalid_value":
    case "range_violation":
    case "type_mismatch":
    case "missing_required":
      return !!getControlForKey(normalizedControls, issue.key);
    case "cross_field":
      // The only cross-field rule today is thinking-budget coupling, which
      // we know how to resolve deterministically.
      return (
        issue.ruleId === "thinking-budget-coupling" ||
        issue.key === "thinking_budget" ||
        issue.key === "include_thoughts"
      );
    case "schema":
      // response_format string → { type: "..." } is deterministic
      return issue.key === "response_format";
    default:
      return false;
  }
}

/**
 * Apply the auto-fix for a single issue. Pure — returns a new settings object.
 * Callers should run validation again after applying fixes to catch cascading
 * issues (especially cross-field).
 */
export function applyFixForIssue(
  issue: ValidationIssue,
  settings: FeLlmParams,
  normalizedControls: NormalizedControls | null,
): FeLlmParams {
  const key = issue.key;
  const control = getControlForKey(normalizedControls, key);

  switch (issue.category) {
    case "unrecognized_key": {
      return omitKey(settings, key);
    }

    case "unsupported_by_model": {
      // No control exists on this model, so there is nowhere to coerce the
      // value to — the honest deterministic repair is to remove it. (Value
      // translations only apply when a control is present; those are handled by
      // range_violation / invalid_value / deprecated_key.)
      return omitKey(settings, key);
    }

    case "deprecated_key": {
      const newKey = DEPRECATED_KEY_REMAP[key];
      if (!newKey) return settings;
      const currentValue = (settings as Record<string, unknown>)[key];
      // Remap the value as-is; downstream validation will clamp/coerce as needed.
      const moved = setKey(omitKey(settings, key), newKey, currentValue);
      // Special case: output_format string → response_format { type: ... }
      if (key === "output_format" && typeof currentValue === "string") {
        if (currentValue === "text" || currentValue === "") {
          return omitKey(omitKey(settings, key), newKey);
        }
        return setKey(omitKey(settings, key), newKey, { type: currentValue });
      }
      return moved;
    }

    case "invalid_value": {
      if (!control) return omitKey(settings, key);
      const fix = controlDefault(control);
      if (fix === undefined) return omitKey(settings, key);
      return setKey(settings, key, fix);
    }

    case "range_violation": {
      if (!control) return settings;
      const currentValue = (settings as Record<string, unknown>)[key];
      const clamped = clampNumber(currentValue, control.min, control.max);
      if (clamped === undefined) {
        const fix = controlDefault(control);
        return fix === undefined ? settings : setKey(settings, key, fix);
      }
      return setKey(settings, key, clamped);
    }

    case "type_mismatch": {
      if (!control) return omitKey(settings, key);
      const fix = controlDefault(control);
      if (fix === undefined) return omitKey(settings, key);
      return setKey(settings, key, fix);
    }

    case "missing_required": {
      if (!control) return settings;
      const fix = controlDefault(control);
      if (fix === undefined) return settings;
      return setKey(settings, key, fix);
    }

    case "schema": {
      // response_format: string → { type: string }
      if (key === "response_format") {
        const currentValue = (settings as Record<string, unknown>)[key];
        if (typeof currentValue === "string") {
          if (currentValue === "text" || currentValue === "") {
            return omitKey(settings, key);
          }
          return setKey(settings, key, { type: currentValue });
        }
      }
      return settings;
    }

    case "cross_field": {
      // thinking_budget coupling: include_thoughts=false requires thinking_budget=-1
      const s = settings as Record<string, unknown>;
      if (s.include_thoughts === false) {
        return setKey(settings, "thinking_budget", -1);
      }
      if (s.include_thoughts === true && s.thinking_budget === -1) {
        const budgetControl = getControlForKey(
          normalizedControls,
          "thinking_budget",
        );
        const fix = budgetControl ? controlDefault(budgetControl) : 1024;
        return setKey(settings, "thinking_budget", fix);
      }
      return settings;
    }

    default:
      return settings;
  }
}

/**
 * Apply fixes for every fixable issue. Non-fixable issues are left alone.
 * Note: this is a single-pass apply — if a fix introduces a new issue, it
 * won't be handled here. Callers should re-run validation if needed.
 */
export function applyAllFixableIssues(
  issues: ValidationIssue[],
  settings: FeLlmParams,
  normalizedControls: NormalizedControls | null,
): FeLlmParams {
  let result = settings;
  for (const issue of issues) {
    if (canFixIssue(issue, normalizedControls)) {
      result = applyFixForIssue(issue, result, normalizedControls);
    }
  }
  return result;
}
