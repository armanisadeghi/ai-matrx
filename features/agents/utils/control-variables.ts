/**
 * Controls as first-class variables — the client half of the platform primitive.
 *
 * A model control (aspect ratio, quality, voice, speed, target language,
 * temperature, …) on an agent is either a literal in `settings` or BOUND to a
 * variable. A bound control is declared on the variable (`control: { key }`), its
 * key is absent from `settings`, and the variable's `defaultValue` IS the agent's
 * value — one source of truth. The variable renders on the run page and in chat
 * in a "Settings" group after the content inputs, with the component DERIVED here
 * from the control's catalog definition; headless callers pass it in the same
 * `variables` payload. The server resolves it before the catalog compile
 * (aidream `matrx_ai/agents/control_bindings.py`).
 *
 * Canonical doc: common-docs/systems/agents/typed-messages/FEATURE.md (The slot).
 */

import type { ControlDefinition } from "@/features/agents/hooks/useModelControls";
import { choiceComponentType } from "@/features/agents/utils/choice-rule";
import type {
  VariableCustomComponent,
  VariableDefinition,
} from "@/features/agents/types/agent-definition.types";

/** The org knob that decides which controls may be exposed as variables. */
export const CONTROL_BINDABLE_KNOB = {
  feature: "agents.controls",
  key: "variable_bindable_keys",
} as const;

export interface ControlBindablePolicy {
  allow: string[];
  deny: string[];
}

/** Mirrors the seeded knob default (aidream ai_089) until the knob answers. */
export const DEFAULT_CONTROL_BINDABLE_POLICY: ControlBindablePolicy = {
  allow: ["*"],
  deny: [
    "moderation",
    "disable_safety_checker",
    "safety_tolerance",
    "safety_filter_level",
    "safety_settings",
    "person_generation",
    "include_rai_reason",
  ],
};

/** Labels for a boolean control's toggle; the server reads On/Off as true/false. */
export const CONTROL_TOGGLE_VALUES: [string, string] = ["Off", "On"];

/** A bounded integer with this few steps reads best as pills ("1 2 3 4"). */
const INTEGER_PILL_MAX_STEPS = 4;
/** A bounded range wider than this is typed, never dragged (seeds, token caps). */
const SLIDER_MAX_SPAN = 1000;

/** Common BCP-47 codes for a free-form language control with no catalog enum. */
export const LANGUAGE_OPTIONS = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "sv",
  "pl",
  "ru",
  "uk",
  "tr",
  "ar",
  "he",
  "fa",
  "hi",
  "bn",
  "ur",
  "zh",
  "ja",
  "ko",
  "vi",
  "th",
  "id",
  "ms",
  "tl",
] as const;

export function isControlVariable(def: VariableDefinition): boolean {
  return typeof def.control?.key === "string" && def.control.key.length > 0;
}

export function findControlVariable(
  defs: readonly VariableDefinition[] | null | undefined,
  key: string,
): VariableDefinition | undefined {
  return (defs ?? []).find((d) => d.control?.key === key);
}

/** Content inputs first, bound controls after — stable within each group. */
export function partitionControlVariables<T extends VariableDefinition>(
  defs: readonly T[],
): { content: T[]; settings: T[] } {
  const content: T[] = [];
  const settings: T[] = [];
  for (const d of defs) (isControlVariable(d) ? settings : content).push(d);
  return { content, settings };
}

/** The order every variable form renders in. Returns the same array when already ordered. */
export function orderVariablesForForm<T extends VariableDefinition>(
  defs: T[],
): T[] {
  const { content, settings } = partitionControlVariables(defs);
  if (settings.length === 0) return defs;
  const ordered = [...content, ...settings];
  return ordered.every((d, i) => d === defs[i]) ? defs : ordered;
}

/** Read the knob's value defensively: a malformed policy falls back to the default. */
export function readControlBindablePolicy(
  value: unknown,
): ControlBindablePolicy {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    const allow = Array.isArray(v.allow)
      ? v.allow.filter((x): x is string => typeof x === "string")
      : [];
    const deny = Array.isArray(v.deny)
      ? v.deny.filter((x): x is string => typeof x === "string")
      : [];
    return { allow, deny };
  }
  return DEFAULT_CONTROL_BINDABLE_POLICY;
}

export function isControlBindable(
  key: string,
  policy: ControlBindablePolicy,
): boolean {
  if (policy.deny.includes(key)) return false;
  return policy.allow.includes("*") || policy.allow.includes(key);
}

function isLanguageKey(key: string): boolean {
  return key.includes("language");
}

function numericStep(control: ControlDefinition): number {
  if (control.type === "integer") return 1;
  const span =
    typeof control.min === "number" && typeof control.max === "number"
      ? control.max - control.min
      : 1;
  return span <= 2 ? 0.01 : span <= 20 ? 0.1 : 1;
}

/** A unit suffix for a numeric control, read from its key. */
export function controlUnit(key: string): string | undefined {
  if (/(^|_)(seconds|secs|duration)(_|$)/.test(key)) return "s";
  if (/(^|_)ms(_|$)/.test(key)) return "ms";
  if (/(^|_)(fps)(_|$)/.test(key)) return "fps";
  if (/(^|_)(percent|pct)(_|$)/.test(key)) return "%";
  if (/(^|_)(tokens)(_|$)/.test(key)) return "tokens";
  return undefined;
}

/**
 * THE derivation: a control's catalog definition → the variable input component.
 * enum → THE CHOICE RULE (`./choice-rule.ts`: pills ≤ 4 short options, select
 * otherwise; the renderer upgrades long lists to a searchable select and ratio
 * lists to the aspect-ratio picker); bounded integer with ≤ 4 steps → pills;
 * bounded range ≤ 1000 wide → slider; otherwise a number field; numeric fields
 * carry a unit read from the key; boolean → labelled switch; a language control
 * with no enum → select of languages; free text → textarea.
 */
export function deriveControlComponent(
  key: string,
  control: ControlDefinition,
): VariableCustomComponent {
  const options = control.enum ?? [];
  if (options.length > 0) {
    return { type: choiceComponentType(options), options: [...options] };
  }
  if (control.type === "boolean") {
    return { type: "toggle", toggleValues: CONTROL_TOGGLE_VALUES };
  }
  if (control.type === "number" || control.type === "integer") {
    const hasBounds =
      typeof control.min === "number" && typeof control.max === "number";
    if (
      hasBounds &&
      control.type === "integer" &&
      control.max! - control.min! + 1 <= INTEGER_PILL_MAX_STEPS
    ) {
      const values: string[] = [];
      for (let v = control.min!; v <= control.max!; v += 1)
        values.push(String(v));
      return { type: "pill-toggle", options: values };
    }
    const slider = hasBounds && control.max! - control.min! <= SLIDER_MAX_SPAN;
    const component: VariableCustomComponent = {
      type: slider ? "slider" : "number",
      step: numericStep(control),
    };
    if (typeof control.min === "number") component.min = control.min;
    if (typeof control.max === "number") component.max = control.max;
    const unit = controlUnit(key);
    if (unit) component.unit = unit;
    return component;
  }
  if (isLanguageKey(key)) {
    return { type: "select", options: [...LANGUAGE_OPTIONS], allowOther: true };
  }
  return { type: "textarea" };
}

/** A settings literal → the variable's default (variables carry text). */
export function controlLiteralToVariableDefault(
  literal: unknown,
  control: ControlDefinition | null | undefined,
): string {
  const value = literal ?? control?.default;
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") {
    return value ? CONTROL_TOGGLE_VALUES[1] : CONTROL_TOGGLE_VALUES[0];
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** A variable's value → the typed settings literal (the unbind direction). */
export function variableValueToControlLiteral(
  value: unknown,
  control: ControlDefinition | null | undefined,
): unknown {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return value;
  if (!control) {
    // No catalog definition at hand (e.g. the variable chip's remove): infer the
    // literal's type from the text so a toggle's "On" never lands as a string.
    const lowered = value.toLowerCase();
    if (lowered === "on" || lowered === "true") return true;
    if (lowered === "off" || lowered === "false") return false;
    const n = Number(value);
    return value.trim() !== "" && Number.isFinite(n) ? n : value;
  }
  if (control.type === "boolean") {
    const lowered = value.toLowerCase();
    return lowered === "on" || lowered === "true" || lowered === "yes";
  }
  if (control.type === "number" || control.type === "integer") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return value;
}

/** A variable name for the control that does not collide with an existing one. */
export function controlVariableName(
  key: string,
  existing: readonly VariableDefinition[] | null | undefined,
): string {
  const taken = new Set((existing ?? []).map((d) => d.name));
  if (!taken.has(key)) return key;
  let i = 2;
  while (taken.has(`${key}_${i}`)) i += 1;
  return `${key}_${i}`;
}

/**
 * Bind: returns the next `{settings, variableDefinitions}` — the literal moves to
 * the new variable's default and leaves `settings`.
 */
export function bindControlToVariable(params: {
  key: string;
  control: ControlDefinition;
  settings: Record<string, unknown>;
  variableDefinitions: VariableDefinition[] | null | undefined;
}): {
  settings: Record<string, unknown>;
  variableDefinitions: VariableDefinition[];
  variable: VariableDefinition;
} {
  const { key, control, settings } = params;
  const defs = params.variableDefinitions ?? [];
  const existing = findControlVariable(defs, key);
  if (existing) {
    return { settings, variableDefinitions: defs, variable: existing };
  }
  const variable: VariableDefinition = {
    name: controlVariableName(key, defs),
    defaultValue: controlLiteralToVariableDefault(settings[key], control),
    required: false,
    customComponent: deriveControlComponent(key, control),
    control: { key },
  };
  const nextSettings = { ...settings };
  delete nextSettings[key];
  return {
    settings: nextSettings,
    variableDefinitions: [...defs, variable],
    variable,
  };
}

/** Unbind: the variable's default is written back as the settings literal. */
export function unbindControlVariable(params: {
  key: string;
  control: ControlDefinition | null | undefined;
  settings: Record<string, unknown>;
  variableDefinitions: VariableDefinition[] | null | undefined;
}): {
  settings: Record<string, unknown>;
  variableDefinitions: VariableDefinition[];
} {
  const { key, control, settings } = params;
  const defs = params.variableDefinitions ?? [];
  const variable = findControlVariable(defs, key);
  if (!variable) return { settings, variableDefinitions: defs };
  const literal = variableValueToControlLiteral(variable.defaultValue, control);
  const nextSettings = { ...settings };
  if (literal !== undefined) nextSettings[key] = literal;
  return {
    settings: nextSettings,
    variableDefinitions: defs.filter((d) => d !== variable),
  };
}
