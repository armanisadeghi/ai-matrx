/**
 * THE AUTO-RUN INVERSION — the ONE place that decides whether a surface
 * binding is allowed to run without stopping for the user.
 *
 * THE-MODEL law 7: "a referenced, fully-mapped binding runs with no user
 * input; prompting is the flexibility option." Auto-run is therefore never a
 * free-standing preference — it is only offerable, and only honorable, when
 * the binding genuinely leaves nothing to ask.
 *
 * Two checks, one rule, deliberately in one file so the bind panel's OFFER and
 * the launcher's HONOR can never drift apart:
 *
 *   `evaluateBindingAutoRun`      — bind time. Can this binding, as currently
 *                                   mapped, promise "nothing to ask"? Gates
 *                                   the control in SurfaceAgentBindPanel.
 *   `unresolvedRequiredVariables` — launch time. Did the mapping actually
 *                                   deliver every required variable for THIS
 *                                   page, right now? A stored `auto_run: true`
 *                                   is intent, never a bypass: a surface that
 *                                   failed to supply a value still stops at
 *                                   the input panel and asks for exactly the
 *                                   gap.
 */

import type { ValueMappingMap } from "@/features/surfaces/types";

/** The minimum a bindable target must expose. Structural on purpose — the
 * bind panel's richer `BindingTarget` satisfies it without importing a
 * component module into the launch path. */
export interface AutoRunTarget {
  name: string;
  required?: boolean;
}

export interface BindingAutoRunEligibility {
  /** True when the binding may offer auto-run. */
  eligible: boolean;
  /** Target names that make it ineligible (empty when eligible). */
  blockers: string[];
  /** Why, in the words the user reads. */
  reason:
    | "complete"
    | "missing_required"
    | "prompts_user";
}

/**
 * Is this binding "fully mapped" in law-7's sense?
 *
 * Complete means BOTH:
 *  - every REQUIRED target is mapped to something the binding supplies
 *    (`surface_value` or `direct_value`); and
 *  - NO target — required or not — is mapped to `prompt_user`, because a
 *    prompt is by definition the UI stopping to ask. A binding that prompts
 *    IS the flexibility option; it is not an auto-run binding that happens to
 *    ask one question.
 *
 * An agent with no targets at all is complete: there is nothing to ask.
 * `unmapped` and absent mappings on OPTIONAL targets are complete too — the
 * agent's own default answers them.
 */
export function evaluateBindingAutoRun(
  targets: AutoRunTarget[],
  mappings: ValueMappingMap,
): BindingAutoRunEligibility {
  const prompts = Object.entries(mappings)
    .filter(([, m]) => m.mapType === "prompt_user")
    .map(([name]) => name);
  if (prompts.length > 0) {
    return { eligible: false, blockers: prompts.sort(), reason: "prompts_user" };
  }

  const missing = targets
    .filter((t) => t.required === true)
    .filter((t) => {
      const mapping = mappings[t.name];
      return (
        mapping?.mapType !== "surface_value" &&
        mapping?.mapType !== "direct_value"
      );
    })
    .map((t) => t.name);
  if (missing.length > 0) {
    return { eligible: false, blockers: missing, reason: "missing_required" };
  }

  return { eligible: true, blockers: [], reason: "complete" };
}

/** The launch-time half: a variable definition as the launcher sees it. */
export interface AutoRunVariableDefinition {
  name: string;
  required?: boolean;
  defaultValue?: unknown;
}

/**
 * Required agent variables that the resolved mapping did NOT deliver for this
 * run. Non-empty means the mapping did not resolve fully, so a stored
 * `auto_run: true` must NOT fire — the panel opens and asks for exactly these.
 *
 * A variable with its own non-nullish `defaultValue` is answered by the agent
 * and is never a gap.
 */
export function unresolvedRequiredVariables(
  variableDefinitions: AutoRunVariableDefinition[] | null | undefined,
  variableValues: Record<string, unknown>,
): string[] {
  return (variableDefinitions ?? [])
    .filter((v) => v.required === true)
    .filter((v) => {
      const value = variableValues[v.name];
      if (value !== undefined && value !== null && value !== "") return false;
      return v.defaultValue === undefined || v.defaultValue === null;
    })
    .map((v) => v.name);
}

/**
 * The launch-time precedence rule, in one testable place.
 *
 * caller's explicit literal → the surface binding's stored answer → whatever
 * instance-ui-state was seeded with (a shortcut's own `auto_run`, or the hard
 * default) → false.
 *
 * The binding sits ABOVE the seed on purpose: a direct-agent launch seeds a
 * meaningless hard `false`, and letting that win is exactly the inversion this
 * work exists to fix — the binding could never say "run it".
 */
export function resolveEffectiveAutoRun(args: {
  /** `config.autoRun` as the caller literally passed it. */
  callerAutoRun: boolean | undefined;
  /** The merged surface-binding answer, or null when no layer had one. */
  bindingAutoRun: boolean | null;
  /** instance-ui-state's seeded value (always concrete once seeded). */
  seededAutoRun: boolean | undefined;
}): boolean {
  return (
    args.callerAutoRun ?? args.bindingAutoRun ?? args.seededAutoRun ?? false
  );
}
