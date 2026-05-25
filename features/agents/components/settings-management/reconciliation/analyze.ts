/**
 * Pure helper that analyzes a model-swap: given current settings and a new
 * model, determines which settings are incompatible and suggests actions.
 *
 * Reuses the validation engine — no rule duplication. Validates current
 * settings against the NEW model's controls + constraints, then classifies
 * each resulting issue into an actionable row.
 */

import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import type { NormalizedControls } from "@/features/agents/hooks/useModelControls";
import type { ModelConstraint } from "@/features/ai-models/types";
import type { ValidationIssue } from "../validation/types";
import { validateConfig } from "../validation/engine";
import { resolveConfig, getControlForKey } from "../validation/resolve-config";
import { getModelDefaults } from "@/features/agents/hooks/useModelControls";

export type IncompatibilityKind =
  | "out-of-range"
  | "invalid-enum"
  | "type-mismatch"
  | "unsupported-key"
  | "coupling-broken"
  | "forbidden"
  | "deprecated"
  | "schema"
  | "other";

export type ReconcileAction = "swap-to-default" | "clear" | "keep";

export interface IncompatibleRow {
  key: string;
  currentValue: unknown;
  issue: IncompatibilityKind;
  issueMessage: string;
  newModelDefault: unknown | undefined;
  suggestedAction: ReconcileAction;
}

export interface ModelChangePlan {
  incompatible: IncompatibleRow[];
  compatibleSettings: FeLlmParams;
  newModelDefaults: FeLlmParams;
}

function mapIssueToKind(issue: ValidationIssue): IncompatibilityKind {
  switch (issue.category) {
    case "unrecognized_key":
    case "unsupported_by_model":
      return "unsupported-key";
    case "invalid_value":
      return "invalid-enum";
    case "range_violation":
      return "out-of-range";
    case "type_mismatch":
      return "type-mismatch";
    case "cross_field":
      return "coupling-broken";
    case "deprecated_key":
      return "deprecated";
    case "missing_required":
      return "forbidden";
    case "schema":
      return "schema";
    default:
      return "other";
  }
}

function suggestedActionFor(
  kind: IncompatibilityKind,
  newModelDefault: unknown | undefined,
  hasControl: boolean,
): ReconcileAction {
  // Unsupported keys: clear — there's nowhere to put them on the new model.
  if (kind === "unsupported-key") return "clear";
  // If the new model has this control and a default, prefer swap-to-default.
  if (hasControl && newModelDefault !== undefined) return "swap-to-default";
  // If the new model has the control but no default, swap-to-default-if-possible
  // reduces to clear semantically.
  if (hasControl) return "swap-to-default";
  // No control, no default → clear.
  return "clear";
}

/**
 * Analyze a model change. Returns the reconciliation plan the dialog uses.
 *
 * Algorithm:
 *   1. Run validation engine against (oldSettings + newModelControls + newConstraints).
 *   2. Dedupe issues by key, keeping the most severe category.
 *   3. For each issue, derive: the new-model default, and a suggested action.
 *   4. Compute compatibleSettings (keys without any issue on the new model).
 *   5. Compute newModelDefaults via getModelDefaults(newModel).
 */
export function analyzeModelChange(
  oldSettings: FeLlmParams,
  newModelId: string,
  newModel: unknown,
  newModelControls: NormalizedControls | null,
  newModelConstraints: ModelConstraint[] | null,
): ModelChangePlan {
  const safeSettings: FeLlmParams = oldSettings ?? ({} as FeLlmParams);
  const resolved = resolveConfig(
    safeSettings,
    newModelId,
    newModelControls,
    newModelConstraints,
  );
  const validation = validateConfig(resolved);

  // Dedupe issues by key — keep the highest-priority one per key.
  const priority: Record<string, number> = {
    unrecognized_key: 5,
    unsupported_by_model: 5,
    invalid_value: 4,
    range_violation: 4,
    type_mismatch: 4,
    cross_field: 3,
    missing_required: 3,
    deprecated_key: 2,
    schema: 2,
  };
  const pickedByKey = new Map<string, ValidationIssue>();
  for (const issue of validation.issues) {
    const existing = pickedByKey.get(issue.key);
    if (
      !existing ||
      (priority[issue.category] ?? 0) > (priority[existing.category] ?? 0)
    ) {
      pickedByKey.set(issue.key, issue);
    }
  }

  const newModelDefaults = getModelDefaults(newModel) as FeLlmParams;

  const incompatible: IncompatibleRow[] = [];
  const issuedKeys = new Set<string>();
  for (const issue of pickedByKey.values()) {
    const key = issue.key;
    issuedKeys.add(key);
    const kind = mapIssueToKind(issue);
    const control = getControlForKey(newModelControls, key);
    const newDefault =
      (newModelDefaults as Record<string, unknown>)[key] ??
      (control?.default !== null ? control?.default : undefined);
    const currentValue = (safeSettings as Record<string, unknown>)[key];
    incompatible.push({
      key,
      currentValue,
      issue: kind,
      issueMessage: issue.message,
      newModelDefault: newDefault,
      suggestedAction: suggestedActionFor(kind, newDefault, !!control),
    });
  }

  // Everything without a flagged issue is compatible, carried over verbatim.
  const compatibleSettings: FeLlmParams = Object.fromEntries(
    Object.entries(safeSettings as Record<string, unknown>).filter(
      ([k]) => !issuedKeys.has(k),
    ),
  ) as FeLlmParams;

  // Stable order: unsupported-key first, then out-of-range/invalid-enum, then others.
  incompatible.sort((a, b) => {
    const order: Record<IncompatibilityKind, number> = {
      "unsupported-key": 0,
      "invalid-enum": 1,
      "out-of-range": 1,
      "type-mismatch": 1,
      "coupling-broken": 2,
      forbidden: 3,
      deprecated: 4,
      schema: 4,
      other: 5,
    };
    const ao = order[a.issue];
    const bo = order[b.issue];
    if (ao !== bo) return ao - bo;
    return a.key.localeCompare(b.key);
  });

  return {
    incompatible,
    compatibleSettings,
    newModelDefaults,
  };
}

/**
 * Apply a reconciliation plan with the user-chosen per-row actions.
 * Returns the final settings object to dispatch alongside the modelId change.
 */
export function applyReconciliation(
  plan: ModelChangePlan,
  actionsByKey: Record<string, ReconcileAction>,
): FeLlmParams {
  const out: Record<string, unknown> = {
    ...(plan.compatibleSettings as Record<string, unknown>),
  };
  for (const row of plan.incompatible) {
    const action = actionsByKey[row.key] ?? row.suggestedAction;
    if (action === "keep") {
      out[row.key] = row.currentValue;
    } else if (action === "clear") {
      // omit
    } else if (action === "swap-to-default") {
      if (row.newModelDefault !== undefined) {
        out[row.key] = row.newModelDefault;
      }
      // if no default, this behaves as clear
    }
  }
  return out as FeLlmParams;
}
