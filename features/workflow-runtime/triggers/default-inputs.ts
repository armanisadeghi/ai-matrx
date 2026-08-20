/**
 * A trigger's `default_inputs` ↔ the workflow's authored run form — PURE.
 *
 * 🚨 Why FLAT, and not the run form's per-node shape. A trigger-fired run is
 * created by aidream's `_create_trigger_run`, which passes `default_inputs`
 * straight through as the run's BROADCAST inputs — it never writes
 * `metadata._settings.node_inputs`. The engine merges broadcast inputs into
 * every source node (`scheduler.run`: `{...inputs, ...node_inputs[nid]}`), so
 * a flat `{key: value}` reaches an `io.user_input` node's fields exactly as a
 * hand-started run's per-node values do. Nesting them by node id would deliver
 * the whole nested object as a single unknown field, and the required-field
 * guard inside the node would park the run.
 *
 * The one place flat loses information is two `io.user_input` nodes declaring
 * the SAME field key — `collidingInputKeys` names them so the surface can say
 * so instead of silently sending one value to both.
 */

import type { RunFormSection } from "../surface/run-form";

/** Field keys declared by more than one section, ascending. */
export function collidingInputKeys(sections: RunFormSection[]): string[] {
  const seen = new Map<string, number>();
  for (const section of sections) {
    for (const field of section.fields) {
      seen.set(field.key, (seen.get(field.key) ?? 0) + 1);
    }
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
}

/**
 * The editor's per-node values as the flat payload the trigger stores.
 * Blank values are omitted entirely — an absent key lets the node fall back to
 * its authored default, while an empty string would overwrite that default.
 */
export function flattenRunFormValues(
  sections: RunFormSection[],
  values: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const section of sections) {
    for (const field of section.fields) {
      const value = values[section.nodeId]?.[field.key];
      if (value === undefined || value === null || value === "") continue;
      flat[field.key] = value;
    }
  }
  return flat;
}

/** Seed the editor from a stored trigger's flat payload. */
export function expandDefaultInputs(
  sections: RunFormSection[],
  defaults: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const values: Record<string, Record<string, unknown>> = {};
  for (const section of sections) {
    const sectionValues: Record<string, unknown> = {};
    for (const field of section.fields) {
      if (field.key in defaults) {
        sectionValues[field.key] = defaults[field.key];
      } else if (field.defaultValue !== null && field.defaultValue !== undefined) {
        sectionValues[field.key] = field.defaultValue;
      } else if (field.type === "yes_no") {
        sectionValues[field.key] = false;
      }
    }
    values[section.nodeId] = sectionValues;
  }
  return values;
}

/**
 * Required field labels a trigger would fire WITHOUT a value for. Nobody is
 * present when a schedule fires, so a missing required input is not a prompt —
 * it is a run that will park on its first node. Say so before it is saved.
 */
export function missingTriggerInputs(
  sections: RunFormSection[],
  flat: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const section of sections) {
    for (const field of section.fields) {
      if (!field.required) continue;
      const value = flat[field.key];
      if (value === undefined || value === null || value === "") {
        missing.push(field.label);
      }
    }
  }
  return missing;
}
