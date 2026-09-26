/**
 * The agent's settings DOCUMENT — the one projection every Model Settings view
 * reads (the Settings form, Raw Settings, Raw Editable) and the one parser the
 * Raw Editable tab writes back through.
 *
 * Why this exists: the form, the read-only JSON and the editable JSON each
 * derived their own picture of the agent's settings. A control bound to a
 * variable (controls as first-class variables — the key leaves `settings` and
 * lives on the variable as `control: { key }` with the value as its default)
 * showed in the form and was silently missing from both JSON views; an unset
 * control displayed its catalog default as if it were set; a legacy
 * `settings.model_id` overwrote the agent's real model in the JSON. Every view
 * now derives from `buildSettingsDocument` / `describeSetting`, which read the
 * same three stored fields: `modelId`, `settings`, `variableDefinitions`.
 *
 * Document shape (what Raw Settings shows and Raw Editable edits):
 *   {
 *     "model_id": "<agent.modelId>",          // the agent's model — never settings.model_id
 *     "tools": ["<tool uuid>", ...],           // the agent's tools, when any
 *     "<key>": <literal>,                      // every stored setting, exactly as stored
 *     "<bound key>": { "$var": "<variable name>", "default": "<variable default>" }
 *   }
 *
 * A `$var` marker is the binding itself — it is never written into `settings`
 * (the server would receive an object where a scalar belongs). Parsing the
 * document back:
 *   - marker on a bound key        → binding kept; an edited `default` updates the variable
 *   - marker on an unbound key     → the control becomes a run input (new bound variable)
 *   - literal on a bound key       → the binding is removed; the literal becomes the setting
 *   - bound key absent             → the binding is removed and the setting is unset
 *   - literal / absent otherwise   → exactly what the document says
 *
 * Canonical doc for controls as variables: common-docs/systems/agents/typed-messages/FEATURE.md.
 */

import type { ControlDefinition } from "@/features/agents/hooks/useModelControls";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import {
  deriveControlComponent,
  findControlVariable,
  isControlVariable,
} from "@/features/agents/utils/control-variables";

/** The marker key that says "this setting is a run input". */
export const BOUND_CONTROL_MARKER_KEY = "$var";

/** Top-level document keys that are agent identity, not model settings. */
const IDENTITY_KEYS = new Set(["model_id", "tools"]);

export interface BoundControlMarker {
  $var: string;
  default: string;
}

export interface SettingsDocumentSource {
  modelId: string | null | undefined;
  tools?: readonly string[] | null | undefined;
  settings: Record<string, unknown> | null | undefined;
  variableDefinitions: readonly VariableDefinition[] | null | undefined;
}

/** True for `{ "$var": "<name>" }` / `{ "$var": "<name>", "default": … }`. */
export function isBoundControlMarker(
  value: unknown,
): value is { $var: string; default?: unknown } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (typeof record[BOUND_CONTROL_MARKER_KEY] !== "string") return false;
  return Object.keys(record).every(
    (k) => k === BOUND_CONTROL_MARKER_KEY || k === "default",
  );
}

function variableDefaultText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function boundControlMarker(def: VariableDefinition): BoundControlMarker {
  return { $var: def.name, default: variableDefaultText(def.defaultValue) };
}

/**
 * THE projection. Raw Settings renders it; Raw Editable starts from it.
 * A bound control wins over a stale literal for the same key, because the
 * server applies the binding after the stored settings.
 */
export function buildSettingsDocument(
  source: SettingsDocumentSource,
): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  if (source.modelId) doc.model_id = source.modelId;
  if (source.tools && source.tools.length > 0) doc.tools = [...source.tools];
  for (const [key, value] of Object.entries(source.settings ?? {})) {
    // A legacy `settings.model_id` / `settings.tools` must never masquerade as
    // the agent's model or tool list. They stay stored untouched (see parse).
    if (IDENTITY_KEYS.has(key)) continue;
    doc[key] = value;
  }
  for (const def of source.variableDefinitions ?? []) {
    if (!isControlVariable(def)) continue;
    doc[def.control!.key] = boundControlMarker(def);
  }
  return doc;
}

export type SettingView =
  | { state: "bound"; variableName: string; value: string }
  | { state: "set"; value: unknown }
  | { state: "default"; value: unknown }
  | { state: "unset" };

/**
 * What the Settings form shows for one key — derived from the same stored
 * fields as the document, so the form and the JSON views cannot disagree.
 * `default` is the model catalog's default: shown to the person LABELLED as the
 * model default, never as if it were set.
 */
export function describeSetting(
  key: string,
  source: Pick<SettingsDocumentSource, "settings" | "variableDefinitions">,
  control: ControlDefinition | null | undefined,
): SettingView {
  const bound = findControlVariable(source.variableDefinitions, key);
  if (bound) {
    return {
      state: "bound",
      variableName: bound.name,
      value: variableDefaultText(bound.defaultValue),
    };
  }
  const value = (source.settings ?? {})[key];
  if (value !== undefined && value !== null) return { state: "set", value };
  if (control && control.default !== undefined && control.default !== null) {
    return { state: "default", value: control.default };
  }
  return { state: "unset" };
}

export interface ParsedSettingsDocument {
  /** `model_id` from the document, when present. */
  modelId: unknown;
  /** `tools` from the document, when present. */
  tools: unknown;
  settings: Record<string, unknown>;
  variableDefinitions: VariableDefinition[];
  /** True when any binding was added, removed or had its default edited. */
  bindingsChanged: boolean;
  /** Problems that make the document unappliable; nothing is applied when non-empty. */
  errors: string[];
}

/** Parse an edited document back into `settings` + `variableDefinitions`. */
export function parseSettingsDocument(
  doc: Record<string, unknown>,
  current: {
    settings: Record<string, unknown> | null | undefined;
    variableDefinitions: readonly VariableDefinition[] | null | undefined;
  },
  getControl?: (key: string) => ControlDefinition | null | undefined,
): ParsedSettingsDocument {
  const errors: string[] = [];
  const currentSettings = current.settings ?? {};
  const currentDefs = [...(current.variableDefinitions ?? [])];

  // Legacy identity keys stored inside settings are not shown, so they are
  // carried through untouched rather than silently deleted by an Apply.
  const settings: Record<string, unknown> = {};
  for (const key of IDENTITY_KEYS) {
    if (key in currentSettings) settings[key] = currentSettings[key];
  }

  const markers = new Map<string, { $var: string; default?: unknown }>();
  for (const [key, value] of Object.entries(doc)) {
    if (IDENTITY_KEYS.has(key)) continue;
    if (isBoundControlMarker(value)) {
      markers.set(key, value);
      continue;
    }
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      BOUND_CONTROL_MARKER_KEY in value
    ) {
      errors.push(
        `"${key}": a run-input marker may only hold "${BOUND_CONTROL_MARKER_KEY}" (the variable name) and "default".`,
      );
      continue;
    }
    settings[key] = value;
  }

  let bindingsChanged = false;
  let variableDefinitions: VariableDefinition[] = [];
  const takenNames = new Set(currentDefs.map((d) => d.name));

  for (const def of currentDefs) {
    if (!isControlVariable(def)) {
      variableDefinitions.push(def);
      continue;
    }
    const key = def.control!.key;
    const marker = markers.get(key);
    if (!marker) {
      // Bound key replaced by a literal, or removed from the document: the
      // binding goes. A literal (already in `settings`) becomes the setting.
      bindingsChanged = true;
      takenNames.delete(def.name);
      continue;
    }
    markers.delete(key);
    if (marker.$var !== def.name) {
      errors.push(
        `"${key}" is the run input "${def.name}" — rename it in Variables, not here ("${marker.$var}" was given).`,
      );
      variableDefinitions.push(def);
      continue;
    }
    if (
      "default" in marker &&
      variableDefaultText(marker.default) !== variableDefaultText(def.defaultValue)
    ) {
      bindingsChanged = true;
      variableDefinitions.push({
        ...def,
        defaultValue: variableDefaultText(marker.default),
      });
    } else {
      variableDefinitions.push(def);
    }
  }

  // Markers on keys that were not bound: make them run inputs.
  for (const [key, marker] of markers) {
    if (takenNames.has(marker.$var)) {
      errors.push(
        `"${key}": a variable named "${marker.$var}" already exists — choose another name for this run input.`,
      );
      continue;
    }
    const control = getControl?.(key) ?? null;
    const def: VariableDefinition = {
      name: marker.$var,
      defaultValue: variableDefaultText(marker.default),
      required: false,
      control: { key },
    };
    if (control) def.customComponent = deriveControlComponent(key, control);
    variableDefinitions = [...variableDefinitions, def];
    takenNames.add(marker.$var);
    bindingsChanged = true;
  }

  return {
    modelId: doc.model_id,
    tools: doc.tools,
    settings,
    // Unchanged → the SAME array, so an Apply that touched no binding writes no
    // variable edit (no dirty flag, no undo step).
    variableDefinitions: bindingsChanged
      ? variableDefinitions
      : ((current.variableDefinitions ?? currentDefs) as VariableDefinition[]),
    bindingsChanged,
    errors,
  };
}
