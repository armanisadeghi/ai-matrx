/**
 * Kind ↔ agent-spec bridge (SHAPE_SYSTEM.md ruling R5) — pure translators
 * between the Shape System's KindSchema field model and the production agent
 * input system (VariableDefinition) and context slots (ContextSlot).
 *
 * Three converters, all pure (no React / Redux / Supabase):
 *   1. kindFieldsToVariableDefinitions — kind fields → agent variables
 *   2. variableDefinitionsToKindFields — agent variables → kind fields
 *   3. contextSlotsToKindFields        — agent context slots → kind fields
 *
 * LOSS DISCIPLINE — conversions never silently drop semantics. The two
 * reverse converters return `{ fields, losses }`; every value-domain
 * narrowing (toggleValues, min/max/step, enum-set on checkbox, media refs,
 * runtime picklists, skipped bindings, json-slot narrowing, duplicate names)
 * lands as an explicit `BridgeLoss`. Authoring-layer attributes with no
 * FieldSchema v1 home — helpText, defaultValue, and WHICH component rendered
 * a value — are uniformly not carried and documented here once, rather than
 * flooding the report with a loss per field (they shape the editor, not the
 * value domain).
 *
 * ROUND-TRIP LAW (tested) — for the CLEAN subset (non-nullable string /
 * number / boolean / enum fields, `required` either `true` or absent),
 * kindFields → variables → kindFields is the identity with zero losses.
 * Documented one-way flattenings: scalar arrays and all structured fields
 * (array / object / inline_object / record / union) become textareas on the
 * way out and therefore come back as plain `string`; `nullable` has no
 * VariableDefinition home and degrades to absent.
 */

import {
  KIND_KEY,
  type ArrayItemScalarType,
  type FieldSchema,
  type KindSchema,
} from "../core/kind-schema.types";
import type {
  VariableComponentType,
  VariableCustomComponent,
  VariableDefinition,
} from "@/features/agents/types/agent-definition.types";
import type { ContextSlot } from "@/features/agents/types/agent-api-types";
import { sanitizeVariableName } from "@/features/agents/utils/variable-utils";

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** One recorded semantic narrowing. `name` is the variable / slot the loss applies to. */
export type BridgeLoss = {
  name: string;
  reason: string;
};

/** Result of a reverse conversion: the kind fields plus every recorded loss. */
export type KindFieldsConversion = {
  fields: KindSchema["fields"];
  losses: BridgeLoss[];
};

/** helpText stamped on scalar-array fields flattened to a textarea. */
export const LIST_HELP_TEXT = "One per line.";

/** helpText stamped on structured fields flattened to a JSON textarea. */
export function structuredJsonHelpText(shape: string): string {
  return `Structured JSON (${shape}).`;
}

const DUPLICATE_NAME_REASON =
  "duplicate name — this definition overwrote an earlier field of the same name";

// ---------------------------------------------------------------------------
// 1) Kind fields → VariableDefinitions
// ---------------------------------------------------------------------------

export type KindFieldsToVariablesOptions = {
  /**
   * Run each field key through the variables system's canonical
   * `sanitizeVariableName` (default `true`). Kind field keys are normally
   * already machine keys, so this is usually the identity. When sanitization
   * yields an empty string the verbatim key is kept; post-sanitization
   * collisions get a numeric suffix (`_2`, `_3`, …) so no field silently
   * vanishes.
   */
  sanitizeNames?: boolean;
};

/**
 * Kind field schemas → agent variable definitions.
 *
 * MAPPING TABLE (v1 — encoded exactly; see the round-trip law in the header):
 *
 * | FieldSchema.type                | VariableDefinition                                                              |
 * |---------------------------------|---------------------------------------------------------------------------------|
 * | string                          | customComponent {type:"textarea"}, defaultValue ""                              |
 * | number                          | customComponent {type:"number"} — FieldSchema v1 has no min/max, so none emitted; defaultValue 0 |
 * | boolean                         | customComponent {type:"toggle"} (no toggleValues), defaultValue false           |
 * | enum {values}                   | customComponent {type:"select", options: values}, defaultValue "" (unselected)  |
 * | string[] / number[] / boolean[] | customComponent {type:"textarea"}, helpText LIST_HELP_TEXT ("One per line."), defaultValue "" — documented v1 flattening |
 * | array {itemKinds}               | textarea; defaultValue = pretty JSON stub `[{"__kind": k} …]` (one element per itemKind); helpText `Structured JSON (array of <k1 | k2>).` |
 * | object {kind}                   | textarea; stub `{"__kind": kind}`; helpText `Structured JSON (<kind>).`         |
 * | inline_object {fields}          | textarea; stub = object of per-field zero values (recursive); helpText `Structured JSON (inline object).` |
 * | record {values}                 | textarea; stub `{}`; helpText `Structured JSON (record of <values>).`           |
 * | union {scalars}                 | textarea; stub = zero value of the first scalar; helpText `Structured JSON (<s1 | s2>).` |
 *
 * The structured rows are the HONEST v1 per R5: nested fields render as a
 * structured-JSON textarea, never a fake sub-form. Stubs reflect the field
 * structure only — referenced kinds are NOT expanded (no resolver here), so
 * an `object`/`array` stub carries just the `__kind` discriminator.
 *
 * Cross-cutting:
 * - `field.required: true` → `required: true`; otherwise the key is omitted
 *   (never `required: false`) so round-trips stay canonical.
 * - `nullable` has no VariableDefinition home — documented flattening (an
 *   empty value plays the null role in variable space).
 * - FieldBase v1 carries no label/description, so the field KEY is the only
 *   name source; helpText comes solely from the rows above.
 */
export function kindFieldsToVariableDefinitions(
  schema: KindSchema,
  opts: KindFieldsToVariablesOptions = {},
): VariableDefinition[] {
  const sanitize = opts.sanitizeNames ?? true;
  const taken = new Set<string>();
  const out: VariableDefinition[] = [];
  for (const [key, field] of Object.entries(schema.fields)) {
    let name = key;
    if (sanitize) {
      const sanitized = sanitizeVariableName(key);
      name = sanitized === "" ? key : sanitized;
    }
    if (taken.has(name)) {
      let n = 2;
      while (taken.has(`${name}_${n}`)) n += 1;
      name = `${name}_${n}`;
    }
    taken.add(name);
    out.push(fieldToVariableDefinition(name, field));
  }
  return out;
}

function fieldToVariableDefinition(
  name: string,
  field: FieldSchema,
): VariableDefinition {
  const requiredPart = field.required ? { required: true as const } : {};
  switch (field.type) {
    case "string":
      return {
        name,
        defaultValue: "",
        customComponent: { type: "textarea" },
        ...requiredPart,
      };
    case "number":
      return {
        name,
        defaultValue: 0,
        customComponent: { type: "number" },
        ...requiredPart,
      };
    case "boolean":
      return {
        name,
        defaultValue: false,
        customComponent: { type: "toggle" },
        ...requiredPart,
      };
    case "enum":
      return {
        name,
        defaultValue: "",
        customComponent: { type: "select", options: [...field.values] },
        ...requiredPart,
      };
    case "string[]":
    case "number[]":
    case "boolean[]":
      return {
        name,
        defaultValue: "",
        helpText: LIST_HELP_TEXT,
        customComponent: { type: "textarea" },
        ...requiredPart,
      };
    case "array":
    case "object":
    case "inline_object":
    case "record":
    case "union":
      return {
        name,
        defaultValue: JSON.stringify(fieldStubValue(field), null, 2),
        helpText: structuredJsonHelpText(structuredShapeLabel(field)),
        customComponent: { type: "textarea" },
        ...requiredPart,
      };
  }
}

type StructuredField = Extract<
  FieldSchema,
  { type: "array" | "object" | "inline_object" | "record" | "union" }
>;

/** The `<kind or shape>` label inside the structured-JSON helpText. */
function structuredShapeLabel(field: StructuredField): string {
  switch (field.type) {
    case "array":
      return `array of ${field.itemKinds.join(" | ")}`;
    case "object":
      return field.kind;
    case "inline_object":
      return "inline object";
    case "record":
      return `record of ${field.values}`;
    case "union":
      return field.scalars.join(" | ");
  }
}

/** Zero/stub value for a field — recursive, used to build the pretty JSON stubs. */
function fieldStubValue(field: FieldSchema): unknown {
  switch (field.type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "enum":
      return field.values[0] ?? "";
    case "string[]":
    case "number[]":
    case "boolean[]":
      return [];
    case "array":
      return field.itemKinds.map((kind) => ({ [KIND_KEY]: kind }));
    case "object":
      return { [KIND_KEY]: field.kind };
    case "inline_object":
      return Object.fromEntries(
        Object.entries(field.fields).map(([key, child]) => [
          key,
          fieldStubValue(child),
        ]),
      );
    case "record":
      return {};
    case "union":
      return scalarZero(field.scalars[0] ?? "string");
  }
}

function scalarZero(
  scalar: ArrayItemScalarType,
): string | number | boolean {
  if (scalar === "number") return 0;
  if (scalar === "boolean") return false;
  return "";
}

// ---------------------------------------------------------------------------
// 2) VariableDefinitions → kind fields
// ---------------------------------------------------------------------------

/**
 * Agent variable definitions → kind field schemas, with an explicit loss
 * report for every semantic narrowing.
 *
 * MAPPING TABLE (v1 — precedence: binding → picklist → component type;
 * a variable with no customComponent is a textarea):
 *
 * | VariableDefinition                                          | FieldSchema              | loss entry                                   |
 * |--------------------------------------------------------------|--------------------------|----------------------------------------------|
 * | binding set (ContextItemBinding)                             | (no field emitted)       | always — runtime-filled from the active scope |
 * | picklist set + static options + !multiple                    | enum {values: options}   | —                                             |
 * | picklist set, otherwise (no static options, or multiple)     | string                   | always — options resolve at run time          |
 * | textarea / no customComponent                                | string                   | —                                             |
 * | number / slider                                              | number                   | if min/max/step present (not representable in FieldSchema v1) |
 * | toggle / light-switch                                        | boolean                  | if toggleValues present (custom labels are the wire values)    |
 * | select / radio / pill-toggle / selection-list / buttons + options, !allowOther | enum {values: options} | —                            |
 * |   〃 with allowOther                                          | string                   | always — allowOther widens past the enum set  |
 * |   〃 without options                                          | string                   | always — no static option set                 |
 * | checkbox                                                     | string[]                 | if options present (LOSSY: enum-set constraint not representable on string[]) |
 * | image / audio / video / youtube / document                   | string                   | always — media ref; string URL/file_id in kind space |
 *
 * Cross-cutting:
 * - `required: true` → `required: true`; otherwise omitted (canonical form).
 * - helpText / defaultValue / component identity are authoring-layer and are
 *   uniformly not carried (see module header) — no per-field loss entries.
 * - Duplicate variable names overwrite (last wins) and record a loss.
 * - Field keys are the variable names verbatim (the variables system already
 *   sanitizes on authoring).
 */
export function variableDefinitionsToKindFields(
  vars: VariableDefinition[],
): KindFieldsConversion {
  const fields: KindSchema["fields"] = {};
  const losses: BridgeLoss[] = [];
  for (const v of vars) {
    const { field, lossReasons } = convertVariable(v);
    for (const reason of lossReasons) losses.push({ name: v.name, reason });
    if (field === null) continue;
    if (v.name in fields) {
      losses.push({ name: v.name, reason: DUPLICATE_NAME_REASON });
    }
    fields[v.name] = field;
  }
  return { fields, losses };
}

type VariableConversion = {
  field: FieldSchema | null;
  lossReasons: string[];
};

function convertVariable(v: VariableDefinition): VariableConversion {
  const lossReasons: string[] = [];
  const finish = (field: FieldSchema): VariableConversion => ({
    field: v.required ? { ...field, required: true } : field,
    lossReasons,
  });

  if (v.binding) {
    lossReasons.push(
      `bound to scope context item "${v.binding.itemKey}" — value is resolved at run time, no kind field emitted`,
    );
    return { field: null, lossReasons };
  }

  const cc: VariableCustomComponent | undefined = v.customComponent;

  if (cc?.picklist) {
    const staticOptions = cc.options ?? [];
    if (staticOptions.length > 0 && !cc.picklist.multiple) {
      return finish({ type: "enum", values: [...staticOptions] });
    }
    lossReasons.push(
      `picklist-bound (list ${cc.picklist.listId}) — ${
        cc.picklist.multiple ? "multi-select, " : ""
      }options resolve at run time; string in kind space`,
    );
    return finish({ type: "string" });
  }

  const type: VariableComponentType = cc?.type ?? "textarea";
  switch (type) {
    case "textarea":
      return finish({ type: "string" });

    case "number":
    case "slider": {
      const bounds = (["min", "max", "step"] as const).filter(
        (key) => cc?.[key] !== undefined,
      );
      if (bounds.length > 0) {
        lossReasons.push(
          `min/max/step (${bounds.join(", ")}) not representable in FieldSchema v1 — number is unconstrained in kind space`,
        );
      }
      return finish({ type: "number" });
    }

    case "toggle":
    case "light-switch": {
      const toggleValues = cc?.toggleValues;
      if (toggleValues) {
        lossReasons.push(
          `toggleValues ["${toggleValues[0]}", "${toggleValues[1]}"] emit custom labels — boolean in kind space`,
        );
      }
      return finish({ type: "boolean" });
    }

    case "select":
    case "radio":
    case "pill-toggle":
    case "selection-list":
    case "buttons": {
      const options = cc?.options ?? [];
      if (options.length === 0) {
        lossReasons.push(`${type} has no static options — string in kind space`);
        return finish({ type: "string" });
      }
      if (cc?.allowOther) {
        lossReasons.push(
          `allowOther permits values outside [${options
            .map((option) => `"${option}"`)
            .join(", ")}] — enum widened to string`,
        );
        return finish({ type: "string" });
      }
      return finish({ type: "enum", values: [...options] });
    }

    case "checkbox": {
      const options = cc?.options ?? [];
      if (options.length > 0) {
        lossReasons.push(
          `enum-set constraint [${options
            .map((option) => `"${option}"`)
            .join(", ")}]${
            cc?.allowOther ? " (+allowOther)" : ""
          } not representable on string[] — any strings accepted in kind space`,
        );
      }
      return finish({ type: "string[]" });
    }

    case "image":
    case "audio":
    case "video":
    case "youtube":
    case "document":
      lossReasons.push(
        `media ref (${type}) — string URL/file_id in kind space`,
      );
      return finish({ type: "string" });

    default: {
      const exhaustive: never = type;
      throw new Error(
        `Unhandled variable component type: ${String(exhaustive)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3) ContextSlots → kind fields
// ---------------------------------------------------------------------------

/**
 * Agent context slots → kind field schemas, with an explicit loss report.
 *
 * MAPPING TABLE (v1):
 *
 * | ContextSlot.type                                                    | FieldSchema              | loss entry                                    |
 * |---------------------------------------------------------------------|--------------------------|-----------------------------------------------|
 * | text                                                                | string                   | —                                             |
 * | json                                                                | record {values:"string"} | always — arbitrary JSON narrowed to record-of-strings, the closest FieldSchema v1 shape (`record` values are scalar-typed; there is no `any`) |
 * | file_url / db_ref / user / org / workspace / project / task / variable | string                | always — structured runtime reference         |
 *
 * Cross-cutting:
 * - `required` is never emitted: a slot with no content sent is silently
 *   skipped server-side, so slots are structurally optional.
 * - label / description have no FieldSchema v1 home (no description field) —
 *   uniformly not carried; max_inline_chars / summary_agent_id / mutable /
 *   persist / source are delivery mechanics, not value shape.
 * - Field keys are the slot keys verbatim; duplicates overwrite (last wins)
 *   and record a loss.
 */
export function contextSlotsToKindFields(
  slots: ContextSlot[],
): KindFieldsConversion {
  const fields: KindSchema["fields"] = {};
  const losses: BridgeLoss[] = [];
  for (const slot of slots) {
    if (slot.key in fields) {
      losses.push({ name: slot.key, reason: DUPLICATE_NAME_REASON });
    }
    switch (slot.type) {
      case "text":
        fields[slot.key] = { type: "string" };
        break;
      case "json":
        fields[slot.key] = { type: "record", values: "string" };
        losses.push({
          name: slot.key,
          reason:
            "json slot — arbitrary JSON narrowed to record-of-strings (closest FieldSchema v1 shape)",
        });
        break;
      default:
        fields[slot.key] = { type: "string" };
        losses.push({
          name: slot.key,
          reason: `${slot.type} slot — structured runtime reference; string in kind space`,
        });
        break;
    }
  }
  return { fields, losses };
}
