/**
 * Value layer for the Inputs tab — the piece the R5 bridge deliberately does
 * NOT own.
 *
 * `convert/kind-variable-bridge.ts` translates SCHEMAS (KindSchema.fields ⇄
 * VariableDefinition[]). It says nothing about VALUES, because the agent
 * variable system is string-space: every text-style input in
 * `VariableInputComponent` emits a `string` (the number stepper emits
 * `"42"`, the toggle emits its `onLabel`/`offLabel` — `"Yes"`/`"No"` — and a
 * structured field emits the raw JSON text of its textarea).
 *
 * A kind INSTANCE, by contrast, is typed: `cards` is an array, `count` is a
 * number, `enabled` is a boolean. Somebody has to walk the derived variables
 * back into kind space. That is this module.
 *
 * It is pure (no React / Redux / Supabase). PROMOTED from admin/ to input/
 * (2026-07-15, D1): the canonical `KindInputForm` (./KindInputForm.tsx) is the
 * second consumer this header anticipated — the admin Inputs tab and the form
 * now share ONE value translator. It stays here rather than `convert/` because
 * convert/ is twin-managed and this module is web-host-specific (it encodes
 * how `VariableInputComponent` emits values, which has no Python twin).
 *
 * HONESTY DISCIPLINE (mirrors the bridge's loss reports):
 * - A value that cannot be coerced becomes an explicit `coercionErrors` entry
 *   and is OMITTED from the instance — never silently defaulted, never
 *   silently stringified.
 * - An empty input omits its key entirely, so a required-but-blank field
 *   surfaces as ajv's `must have required property '<x>'` rather than as a
 *   fake empty string that passes validation.
 * - `describeRoundTripDrift` exposes the forward flattenings that the reverse
 *   converter's `losses[]` does NOT record (array → textarea → string), because
 *   they are documented one-way flattenings rather than value-domain
 *   narrowings. Without this, a round trip that destroys `cards: array` looks
 *   lossless.
 */

import {
  kindFieldsToVariableDefinitions,
  type KindFieldsToVariablesOptions,
} from "@/features/content-ir/convert/kind-variable-bridge";
import {
  KIND_KEY,
  type FieldSchema,
  type KindSchema,
} from "@/features/content-ir/core/kind-schema.types";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

// ---------------------------------------------------------------------------
// Pairing — field key ⇄ derived variable
// ---------------------------------------------------------------------------

/**
 * One kind field paired with the VariableDefinition the bridge derived from it.
 *
 * `kindFieldsToVariableDefinitions` iterates `Object.entries(schema.fields)`
 * and pushes exactly one variable per field, in order — so index-zipping is
 * the contract, not a coincidence. We zip rather than match on name because
 * the bridge may rename a field (`sanitizeVariableName`, or a `_2` suffix on a
 * post-sanitization collision); the instance must be keyed by the ORIGINAL
 * field key, while the form state is keyed by the variable name.
 */
export interface KindInputPair {
  /** The key in `KindSchema.fields` — what an instance object must use. */
  fieldKey: string;
  field: FieldSchema;
  /** The bridge's derived variable — what the input renderer consumes. */
  variable: VariableDefinition;
  /** True when the bridge renamed the field (variable.name !== fieldKey). */
  renamed: boolean;
}

/** Thrown when the bridge's order/arity contract is violated — loud, never silent. */
export class KindInputPairingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KindInputPairingError";
  }
}

export function pairKindFieldsWithVariables(
  schema: KindSchema,
  opts?: KindFieldsToVariablesOptions,
): KindInputPair[] {
  const entries = Object.entries(schema.fields);
  const variables = kindFieldsToVariableDefinitions(schema, opts);
  if (variables.length !== entries.length) {
    throw new KindInputPairingError(
      `kindFieldsToVariableDefinitions returned ${variables.length} variables for ${entries.length} fields on kind "${schema.kind}" — the one-variable-per-field contract broke.`,
    );
  }
  return entries.map(([fieldKey, field], index) => {
    const variable = variables[index];
    return {
      fieldKey,
      field,
      variable,
      renamed: variable.name !== fieldKey,
    };
  });
}

// ---------------------------------------------------------------------------
// Coercion — variable string-space → kind typed-space
// ---------------------------------------------------------------------------

export type CoercionOutcome =
  | { status: "omitted" }
  | { status: "ok"; value: unknown }
  | { status: "error"; message: string };

const TRUE_WORDS = new Set(["true", "yes", "on", "1"]);
const FALSE_WORDS = new Set(["false", "no", "off", "0"]);

/**
 * Empty means "the user supplied nothing" — omit the key so a required field
 * fails on `required`, not on `type`. Note `false` and `0` are NOT empty: a
 * toggle left off, or a number left at its `0` default, are real values.
 */
function isEmptyRaw(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true;
  return typeof raw === "string" && raw.trim() === "";
}

function splitLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseBoolean(text: string): boolean | null {
  const lower = text.trim().toLowerCase();
  if (TRUE_WORDS.has(lower)) return true;
  if (FALSE_WORDS.has(lower)) return false;
  return null;
}

/**
 * Coerce one raw input value into the field's kind-space type.
 *
 * The `raw` is whatever `VariableInputComponent.onChange` handed back, or the
 * variable's untouched `defaultValue` (which is already typed: `0`, `false`,
 * `""`, or a JSON stub string).
 */
export function coerceInputValueToKindValue(
  field: FieldSchema,
  raw: unknown,
): CoercionOutcome {
  if (isEmptyRaw(raw)) return { status: "omitted" };

  switch (field.type) {
    case "string":
    case "enum":
      // Value-domain membership for `enum` is ajv's job, not ours.
      return { status: "ok", value: String(raw) };

    case "number": {
      if (typeof raw === "number") return { status: "ok", value: raw };
      const parsed = Number(String(raw).trim());
      if (Number.isNaN(parsed)) {
        return {
          status: "error",
          message: `"${String(raw)}" is not a number`,
        };
      }
      return { status: "ok", value: parsed };
    }

    case "boolean": {
      if (typeof raw === "boolean") return { status: "ok", value: raw };
      const parsed = parseBoolean(String(raw));
      if (parsed === null) {
        return {
          status: "error",
          message: `"${String(raw)}" is not a boolean (expected one of yes/no, true/false, on/off, 1/0)`,
        };
      }
      return { status: "ok", value: parsed };
    }

    case "string[]":
      return { status: "ok", value: splitLines(String(raw)) };

    case "number[]": {
      const lines = splitLines(String(raw));
      const out: number[] = [];
      for (const [index, line] of lines.entries()) {
        const parsed = Number(line);
        if (Number.isNaN(parsed)) {
          return {
            status: "error",
            message: `line ${index + 1} ("${line}") is not a number`,
          };
        }
        out.push(parsed);
      }
      return { status: "ok", value: out };
    }

    case "boolean[]": {
      const lines = splitLines(String(raw));
      const out: boolean[] = [];
      for (const [index, line] of lines.entries()) {
        const parsed = parseBoolean(line);
        if (parsed === null) {
          return {
            status: "error",
            message: `line ${index + 1} ("${line}") is not a boolean`,
          };
        }
        out.push(parsed);
      }
      return { status: "ok", value: out };
    }

    // Every structured field is a JSON textarea on the way out (R5: nested
    // fields v1 = structured-JSON textarea, never a fake sub-form), so the way
    // back in is a JSON parse.
    case "array":
    case "object":
    case "inline_object":
    case "record":
    case "union":
    case "json":
    case "json[]": {
      if (typeof raw !== "string") return { status: "ok", value: raw };
      try {
        return { status: "ok", value: JSON.parse(raw) as unknown };
      } catch (err) {
        return {
          status: "error",
          message: `not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Instance assembly
// ---------------------------------------------------------------------------

export interface AssembledKindInstance {
  /** The `__kind`-stamped object. `validateStructuralLeg` strips `__kind` before ajv. */
  instance: Record<string, unknown>;
  /** fieldKey → why its value could not be coerced. Those keys are absent from `instance`. */
  coercionErrors: Record<string, string>;
  /** fieldKeys whose input was blank, so the key was omitted entirely. */
  omittedFields: string[];
}

/**
 * Build the kind instance from the live form state.
 *
 * `values` is keyed by VARIABLE NAME (that is what the form collects);
 * `instance` is keyed by FIELD KEY (that is what the kind's schema declares).
 * The pair list is the only thing that knows both.
 */
export interface AssembleKindInstanceOptions {
  /**
   * Field keys whose value was SEEDED as the literal empty string "" from an
   * existing instance (edit flows — see `emptyStringSeededFields`). For these
   * keys an empty string input means "" — the stored value — not "the user
   * supplied nothing", so the key is kept instead of omitted. Without this, a
   * required string field legitimately holding "" would be DROPPED on re-save
   * and fail validation though the original passed (round-trip asymmetry).
   */
  emptyStringFields?: ReadonlySet<string>;
}

export function assembleKindInstance(
  kind: string,
  pairs: KindInputPair[],
  values: Record<string, unknown>,
  options?: AssembleKindInstanceOptions,
): AssembledKindInstance {
  const instance: Record<string, unknown> = { [KIND_KEY]: kind };
  const coercionErrors: Record<string, string> = {};
  const omittedFields: string[] = [];

  for (const pair of pairs) {
    const raw = values[pair.variable.name];
    const outcome = coerceInputValueToKindValue(pair.field, raw);
    if (outcome.status === "omitted") {
      if (
        options?.emptyStringFields?.has(pair.fieldKey) &&
        typeof raw === "string" &&
        raw.trim() === ""
      ) {
        instance[pair.fieldKey] = "";
        continue;
      }
      omittedFields.push(pair.fieldKey);
      continue;
    }
    if (outcome.status === "error") {
      coercionErrors[pair.fieldKey] = outcome.message;
      continue;
    }
    instance[pair.fieldKey] = outcome.value;
  }

  return { instance, coercionErrors, omittedFields };
}

/** Seed the form from each derived variable's `defaultValue`. */
export function initialValuesForVariables(
  variables: VariableDefinition[],
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const variable of variables) values[variable.name] = variable.defaultValue;
  return values;
}

/**
 * The EXACT inverse of `coerceInputValueToKindValue`: map one kind-space
 * value back into the raw shape its `VariableInputComponent` edits, so a
 * stored instance can prefill the form (edit flows). Round-trip law:
 * `coerceInputValueToKindValue(field, inputValueForKindValue(field, v))`
 * yields `v` for any schema-valid `v`.
 */
export function inputValueForKindValue(field: FieldSchema, value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  switch (field.type) {
    case "string":
    case "enum":
    case "number":
    case "boolean":
      return value;
    case "string[]":
    case "number[]":
    case "boolean[]":
      return Array.isArray(value) ? value.map(String).join("\n") : String(value);
    // Structured fields are JSON textareas both ways (R5 v1 posture).
    case "array":
    case "object":
    case "inline_object":
    case "record":
    case "union":
    case "json":
    case "json[]":
      return JSON.stringify(value, null, 2);
  }
}

/**
 * Seed form values from an existing instance's data (keyed by FIELD KEY),
 * falling back to each variable's default for keys the instance omits.
 */
export function initialValuesFromInstance(
  pairs: KindInputPair[],
  instanceData: Record<string, unknown>,
): Record<string, unknown> {
  const values = initialValuesForVariables(pairs.map((p) => p.variable));
  for (const pair of pairs) {
    if (!(pair.fieldKey in instanceData)) continue;
    const seeded = inputValueForKindValue(pair.field, instanceData[pair.fieldKey]);
    if (seeded !== undefined) values[pair.variable.name] = seeded;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Round-trip drift — the losses[] report does NOT cover these
// ---------------------------------------------------------------------------

/** Short human label for a field's type, including its structural payload. */
export function fieldTypeLabel(field: FieldSchema): string {
  switch (field.type) {
    case "enum":
      return `enum(${field.values.join(" | ")})`;
    case "union":
      return `union(${[...field.scalars, ...(field.kinds ?? [])].join(" | ")})`;
    case "record":
      return `record<string, ${field.values}>`;
    case "object":
      return `object(${field.kind})`;
    case "array":
      return `array(${field.itemKinds.join(" | ")})`;
    case "inline_object":
      return `inline_object(${Object.keys(field.fields).length} fields)`;
    default:
      return field.type;
  }
}

export interface FieldTypeDrift {
  fieldKey: string;
  /** The variable the bridge derived — the reconstruction is keyed by this. */
  variableName: string;
  originalType: string;
  /** null when the reverse converter emitted no field at all (e.g. a bound variable). */
  reconstructedType: string | null;
  changed: boolean;
}

/**
 * Compare the ORIGINAL kind fields against the fields reconstructed by
 * `variableDefinitionsToKindFields`.
 *
 * This is the second honesty channel. `losses[]` records value-domain
 * narrowings the REVERSE converter performs (toggleValues, min/max, allowOther,
 * media refs…). It cannot record the FORWARD flattenings — `cards: array`
 * became a textarea, and a textarea comes back as `string`, with zero losses
 * reported, because from the reverse converter's point of view a textarea has
 * always been a string. Only a before/after comparison sees that.
 */
export function describeRoundTripDrift(
  pairs: KindInputPair[],
  reconstructed: KindSchema["fields"],
): FieldTypeDrift[] {
  return pairs.map((pair) => {
    const rebuilt = reconstructed[pair.variable.name];
    const originalType = fieldTypeLabel(pair.field);
    const reconstructedType = rebuilt ? fieldTypeLabel(rebuilt) : null;
    return {
      fieldKey: pair.fieldKey,
      variableName: pair.variable.name,
      originalType,
      reconstructedType,
      changed: reconstructedType !== originalType,
    };
  });
}

// ---------------------------------------------------------------------------
// ajv error attribution
// ---------------------------------------------------------------------------

export interface AttributedSchemaErrors {
  /** fieldKey → the errors ajv raised for (or about) that field. */
  byField: Record<string, string[]>;
  /** Errors that belong to the object as a whole, or to an unknown key. */
  formLevel: string[];
}

const DETAIL_PREFIX = "sample failed schema: ";
const REQUIRED_PROPERTY = /must have required property '([^']+)'/;

/**
 * Attribute `validateStructuralLeg`'s `detail` string back to individual fields.
 *
 * `LegResult` is `{ ok, detail? }` — it carries no structured error list, so
 * the only way to reuse the ONE canonical validator (rather than standing up a
 * parallel ajv, which is exactly what the Shape System forbids) is to parse the
 * string it already formats:
 *
 *   `sample failed schema: /cards/0 must have required property 'back'; (root) must have required property 'title'`
 *
 * built as `` `${e.instancePath || "(root)"} ${e.message}` `` joined by `"; "`.
 *
 * This is parsing, so it is best-effort by construction: callers MUST also
 * render `detail` verbatim (the tab does), and anything unattributable lands in
 * `formLevel` rather than being dropped. The clean fix is a structured
 * `LegResult.errors` on `kind-dual-gate.ts`; until that exists this is the
 * honest seam.
 *
 * Note ajv runs with `allErrors: true` but `validateStructuralLeg` slices to
 * the first 8 — so an instance with many faults shows a truncated set.
 *
 * DEDUPED: ajv's `allErrors` revisits the same instance path once per anyOf
 * branch (a card missing `front` fails flashcard AND enhanced_flashcard AND
 * tiered_flashcard → three identical messages), and consumers key their error
 * lists by message text — duplicates crash React's key invariant and can OMIT
 * rows. Identical strings carry no extra signal; each lands once.
 */
export function attributeStructuralErrors(
  detail: string | undefined,
  fieldKeys: readonly string[],
): AttributedSchemaErrors {
  const byField: Record<string, string[]> = {};
  const formLevel: string[] = [];
  const seen = new Set<string>();
  if (!detail) return { byField, formLevel };

  const known = new Set(fieldKeys);
  const body = detail.startsWith(DETAIL_PREFIX)
    ? detail.slice(DETAIL_PREFIX.length)
    : detail;

  const push = (field: string, message: string) => {
    const list = byField[field];
    if (list) list.push(message);
    else byField[field] = [message];
  };

  for (const entry of body.split("; ")) {
    const trimmed = entry.trim();
    if (trimmed === "") continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);

    if (trimmed.startsWith("/")) {
      // `/cards/0 must have required property 'back'` → owner is `cards`.
      const spaceAt = trimmed.indexOf(" ");
      const instancePath = spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt);
      const owner = instancePath.split("/")[1] ?? "";
      if (known.has(owner)) {
        push(owner, trimmed);
        continue;
      }
      formLevel.push(trimmed);
      continue;
    }

    // `(root) must have required property 'title'` → owner is `title`.
    const required = REQUIRED_PROPERTY.exec(trimmed);
    if (required && known.has(required[1])) {
      push(required[1], trimmed);
      continue;
    }
    formLevel.push(trimmed);
  }

  return { byField, formLevel };
}
