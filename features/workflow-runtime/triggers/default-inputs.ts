/**
 * A trigger's `default_inputs` ↔ the workflow's SERVED input surface — PURE.
 *
 * 🚨 Why FLAT. A trigger-fired run is created by aidream's
 * `_create_trigger_run`, which passes `default_inputs` straight through as the
 * run's BROADCAST inputs — it never writes `metadata._settings.node_inputs`.
 * The engine merges broadcast inputs into every source node (`scheduler.run`:
 * `{...inputs, ...node_inputs[nid]}`), so a flat `{name: value}` reaches the
 * graph exactly as a hand-started run's values do.
 *
 * That flat shape IS the served input surface (common-docs
 * `systems/workflows/INPUT-SURFACE.md`): name-unique, kind-addressed, one
 * sourcing rule each. The trigger surface therefore reads the SAME declaration
 * the run form reads — `GET /workflows/{id}/run-form` — instead of deriving a
 * second, narrower one from the definition's `io.user_input` nodes. A derived
 * form cannot see an input declared anywhere else in the graph, and a schedule
 * authored against a form that is missing inputs parks on its first step.
 *
 * WHAT A TRIGGER MAY NOT DO: claim a provenance. `input_sources` is the
 * human-facing run form's alone (THE source=human invariant). A schedule's
 * stored payload is not a person answering, so it travels unstamped, and a
 * mandate-pinned value is never copied into it — pinning happens at run time,
 * server-side, and a stored copy would go stale silently.
 */

import {
  missingValue,
  unsatisfiedServedInputs,
  type ServedInput,
} from "../served-form/served-input";

/**
 * Names the served surface declares more than once.
 *
 * The compiled surface is name-unique BY CONTRACT, so this is normally empty.
 * It stays because a duplicate would mean the server broke its own contract,
 * and the trigger editor sending one value to two declarations silently is
 * exactly the failure that would never be noticed otherwise.
 */
export function collidingInputNames(inputs: readonly ServedInput[]): string[] {
  const seen = new Map<string, number>();
  for (const input of inputs) {
    seen.set(input.name, (seen.get(input.name) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort();
}

/**
 * The editor's draft as the payload the trigger stores.
 *
 * Blank values are omitted entirely — an absent name lets the server land its
 * own declared default, while an empty string would overwrite it. A pinned or
 * read-only input is never stored: those are resolved server-side every run.
 */
export function triggerDefaultInputs(
  inputs: readonly ServedInput[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const stored: Record<string, unknown> = {};
  for (const input of inputs) {
    if (input.pinned || input.readOnly) continue;
    const value = values[input.name];
    if (missingValue(value)) continue;
    stored[input.name] = value;
  }
  return stored;
}

/** Seed the editor draft from a stored trigger's payload, defaults behind it. */
export function expandDefaultInputs(
  inputs: readonly ServedInput[],
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const input of inputs) {
    if (input.name in defaults) {
      values[input.name] = defaults[input.name];
    } else if (!missingValue(input.default)) {
      values[input.name] = input.default;
    }
  }
  return values;
}

/**
 * Input labels a trigger would fire WITHOUT a value for. Nobody is present
 * when a schedule fires, so a missing input is not a prompt — it is a run that
 * will park on its first step. Say so before it is saved.
 *
 * This is THE gate law (`unsatisfiedServedInputs`), not a second one: a stored
 * value plays the part a human answer plays in the run form, which is what
 * lets an `ask` input — "a person answers this EVERY run" — be satisfied ahead
 * of time by the one person who is here now.
 */
export function missingTriggerInputs(
  inputs: readonly ServedInput[],
  defaults: Record<string, unknown>,
): string[] {
  const answered = new Set(
    Object.keys(defaults).filter((name) => !missingValue(defaults[name])),
  );
  return unsatisfiedServedInputs(inputs, defaults, answered).map((i) => i.label);
}
