/**
 * Kind ↔ agent-spec bridge (SHAPE_SYSTEM.md ruling R5) — pure translators
 * between the Shape System's KindSchema field model and the production agent
 * input system (VariableDefinition) and context slots (ContextSlot).
 *
 * Three converters, all pure (no React / Redux / Supabase):
 *   1. kindFieldsToVariableDefinitions — kind fields (+ sidecar) → agent variables
 *   2. variableDefinitionsToKindFields — agent variables → kind fields + sidecar
 *   3. contextSlotsToKindFields        — agent context slots → kind fields
 *
 * FIDELITY MODEL (W3-A agent-input bridge, 2026-07-15) — the conversion is
 * faithful along two channels:
 *
 *   - STRUCTURE lives on FieldSchema. The input-semantics extension carries
 *     what the old bridge lost: option sets with `allowOther` (`enum.open`),
 *     defaults (`FieldBase.default`), help text (`FieldBase.description`),
 *     numeric bounds (`number.min/max/step`), multi-select option sets
 *     (`string[].values` + `open`), and toggleValues (a 2-value enum — the
 *     labels ARE the wire values).
 *   - PROVENANCE lives on the OUT-OF-BAND SIDECAR (`VariableBridgeSidecar`):
 *     picklist bindings (`customComponent.structured_list`), scope-context
 *     bindings (`VariableDefinition.binding`), and WHICH input component
 *     renders the value (media / datetime / slider / …). These shape the
 *     editor or the runtime fill, never the value's JSON structure, so they
 *     never enter FieldSchema — the reverse converter emits them beside the
 *     fields and the forward converter reattaches them.
 *
 * LOSS DISCIPLINE — conversions never silently drop semantics. The reverse
 * converters return `{ fields, losses, sidecar }`; every value-domain
 * narrowing that NEITHER FieldSchema NOR the sidecar can carry lands as an
 * explicit `BridgeLoss` (optionless select families, currency's structured
 * value, runtime-resolved picklist option sets, json-slot narrowing,
 * duplicate names). Authoring residue (`customComponent.stash`) is uniformly
 * not carried — it is a UI scratchpad, not semantics.
 *
 * ROUND-TRIP LAW (tested) — for the CLEAN subset (non-nullable string /
 * number / boolean / enum / enum.open / bounded number / string[]+values
 * fields, `required` either `true` or absent, plus any sidecar entries),
 * kindFields → variables → kindFields is the identity with zero losses, and
 * variables → kindFields → variables reproduces the variable modulo the
 * documented normalizations (legacy `picklist` key → `structured_list`,
 * stash dropped, zero-value defaults omitted). Documented one-way
 * flattenings: `number[]`/`boolean[]` and all structured fields (array /
 * object / inline_object / record / union / json) become textareas on the
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
  ContextItemBinding,
  StructuredListBinding,
  VariableComponentType,
  VariableCustomComponent,
  VariableDefinition,
} from "@/features/agents/types/agent-definition.types";
import type { ContextSlot } from "@/features/agents/types/agent-api-types";
import { sanitizeVariableName } from "@/features/agents/utils/variable-utils";
import { readStructuredList } from "@/features/agents/utils/variable-customcomponent";

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** One recorded semantic narrowing. `name` is the variable / slot the loss applies to. */
export type BridgeLoss = {
  name: string;
  reason: string;
};

/**
 * Out-of-band provenance for ONE field — everything about the variable that
 * is not value STRUCTURE: which component renders it, and its runtime
 * bindings. Emitted by the reverse converter, reattached by the forward one.
 */
export type VariableFieldSidecar = {
  /**
   * The input component that renders the value, recorded whenever it differs
   * from the canonical component for the field's shape (textarea / number /
   * toggle / select / checkbox). Media components (image/audio/video/
   * youtube/document) are the headline case: string values + an input-role
   * component annotation.
   */
  component?: VariableComponentType;
  /** Picklist binding — options + value resolve from a Structured List at run time. */
  structuredList?: StructuredListBinding;
  /** Scope-context binding — the value fills from the active scope at run time. */
  scopeBinding?: ContextItemBinding;
  /**
   * `allowOther` on a component whose FIELD cannot carry `open` (a plain
   * string from a runtime-options picklist / optionless select). When the
   * field is an enum / items-enum, openness lives ON the field instead.
   */
  allowOther?: boolean;
};

/** Field name → sidecar. Only fields with at least one entry appear. */
export type VariableBridgeSidecar = Record<string, VariableFieldSidecar>;

/** Result of a reverse conversion: kind fields + losses + out-of-band sidecar. */
export type KindFieldsConversion = {
  fields: KindSchema["fields"];
  losses: BridgeLoss[];
  sidecar: VariableBridgeSidecar;
};

/** helpText stamped on scalar-array fields flattened to a textarea. */
export const LIST_HELP_TEXT = "One per line.";

/** helpText stamped on structured fields flattened to a JSON textarea. */
export function structuredJsonHelpText(shape: string): string {
  return `Structured JSON (${shape}).`;
}

/**
 * Is this helpText one the FORWARD converter synthesized for a flattened
 * field (one-per-line list / structured-JSON textarea)? The reverse
 * converter must not read machine-stamped authoring hints back as a user
 * `description` (or their JSON stubs as a user `default`).
 */
export function isSyntheticBridgeHelpText(helpText: string): boolean {
  return (
    helpText === LIST_HELP_TEXT || /^Structured JSON \(.*\)\.$/.test(helpText)
  );
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
  /**
   * Out-of-band provenance (from a prior reverse conversion, or authored):
   * keyed by ORIGINAL field key. Reattaches picklist / scope bindings and
   * non-canonical component identity. An entry incompatible with the field's
   * shape (e.g. `component: "number"` on an enum) is ignored and the
   * canonical component used — the field's structure is authoritative.
   */
  sidecar?: VariableBridgeSidecar;
};

/**
 * Kind field schemas → agent variable definitions.
 *
 * MAPPING TABLE (structure channel; sidecar reattachment listed after):
 *
 * | FieldSchema                       | VariableDefinition                                                            |
 * |-----------------------------------|-------------------------------------------------------------------------------|
 * | string                            | textarea (or sidecar component)                                               |
 * | number (+min/max/step)            | {type:"number"} with min/max/step (or sidecar "slider"/"percent")             |
 * | boolean                           | {type:"toggle"} (or sidecar "light-switch")                                   |
 * | enum {values}                     | {type:"select", options: values} (or sidecar select-family component)         |
 * | enum {values, open}               | 〃 + allowOther: true                                                          |
 * | enum {values:[a,b]} + sidecar toggle | {type:"toggle"/"light-switch", toggleValues:[a,b]} (labels ARE wire values) |
 * | string[] {values}                 | {type:"checkbox", options: values} (+allowOther when open)                    |
 * | string[] (no values)              | textarea, helpText "One per line." (documented flattening)                    |
 * | number[] / boolean[]              | textarea, helpText "One per line." (documented flattening)                    |
 * | array/object/inline_object/record/union/json/json[] | textarea; defaultValue = pretty JSON stub; helpText `Structured JSON (<shape>).` |
 *
 * Cross-cutting:
 * - `description` → `helpText` (wins over the synthetic flattening hints).
 * - `default` → `defaultValue` (verbatim for scalars; stringified JSON when a
 *   structured field's default is not already a string). Absent default →
 *   the shape's zero value ("", 0, false, "" for enum).
 * - `required: true` → `required: true`; otherwise the key is omitted.
 * - `nullable` has no VariableDefinition home — documented flattening (an
 *   empty value plays the null role in variable space).
 * - Sidecar: `scopeBinding` → `binding` (customComponent omitted — inherited
 *   from the bound context item); `structuredList` → `customComponent.structured_list`;
 *   `component` → `customComponent.type` when shape-compatible.
 *
 * The structured rows are the HONEST flattening per R5: nested fields render
 * as a structured-JSON textarea, never a fake sub-form. Stubs reflect the
 * field structure only — referenced kinds are NOT expanded (no resolver
 * here), so an `object`/`array` stub carries just the `__kind` discriminator.
 */
export function kindFieldsToVariableDefinitions(
  schema: KindSchema,
  opts: KindFieldsToVariablesOptions = {},
): VariableDefinition[] {
  const sanitize = opts.sanitizeNames ?? true;
  const sidecar = opts.sidecar ?? {};
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
    out.push(fieldToVariableDefinition(name, field, sidecar[key] ?? {}));
  }
  return out;
}

/**
 * Components whose value is a plain string (textarea-compatible shapes).
 * The select family is included: an optionless / runtime-options (picklist)
 * select renders as a select whose options hydrate elsewhere — its VALUE is
 * still a plain string.
 */
const STRING_COMPONENTS: ReadonlySet<VariableComponentType> = new Set([
  "textarea",
  "datetime",
  "time",
  "email",
  "url",
  "phone",
  "color",
  "markdown",
  "currency",
  "image",
  "audio",
  "video",
  "youtube",
  "document",
  "select",
  "radio",
  "pill-toggle",
  "selection-list",
  "buttons",
  "checkbox",
]);

const NUMBER_COMPONENTS: ReadonlySet<VariableComponentType> = new Set([
  "number",
  "slider",
  "percent",
]);

const BOOLEAN_COMPONENTS: ReadonlySet<VariableComponentType> = new Set([
  "toggle",
  "light-switch",
]);

const SELECT_FAMILY: ReadonlySet<VariableComponentType> = new Set([
  "select",
  "radio",
  "pill-toggle",
  "selection-list",
  "buttons",
]);

/** Pick the sidecar component when shape-compatible, else the canonical one. */
function componentFor(
  compatible: ReadonlySet<VariableComponentType>,
  canonical: VariableComponentType,
  sidecar: VariableFieldSidecar,
): VariableComponentType {
  return sidecar.component !== undefined && compatible.has(sidecar.component)
    ? sidecar.component
    : canonical;
}

function withStructuredList(
  cc: VariableCustomComponent,
  sidecar: VariableFieldSidecar,
): VariableCustomComponent {
  return sidecar.structuredList !== undefined
    ? { ...cc, structured_list: sidecar.structuredList }
    : cc;
}

function fieldToVariableDefinition(
  name: string,
  field: FieldSchema,
  sidecar: VariableFieldSidecar,
): VariableDefinition {
  const requiredPart = field.required ? { required: true as const } : {};
  const helpPart =
    field.description !== undefined ? { helpText: field.description } : {};
  /** default → defaultValue verbatim; `zero` is the shape's empty value. */
  const defaultOr = (zero: unknown): unknown =>
    field.default !== undefined ? field.default : zero;

  // Scope-bound variables carry NO customComponent — the component is
  // inherited from the bound context item (see ContextItemBinding docs).
  if (sidecar.scopeBinding !== undefined) {
    return {
      name,
      defaultValue: defaultOr(""),
      binding: sidecar.scopeBinding,
      ...helpPart,
      ...requiredPart,
    };
  }

  switch (field.type) {
    case "string": {
      const type = componentFor(STRING_COMPONENTS, "textarea", sidecar);
      return {
        name,
        defaultValue: defaultOr(""),
        customComponent: withStructuredList(
          {
            type,
            // allowOther could not live on a plain string field — reattach
            // from the sidecar onto option-bearing components.
            ...(sidecar.allowOther &&
            (SELECT_FAMILY.has(type) || type === "checkbox")
              ? { allowOther: true }
              : {}),
          },
          sidecar,
        ),
        ...helpPart,
        ...requiredPart,
      };
    }
    case "number": {
      const type = componentFor(NUMBER_COMPONENTS, "number", sidecar);
      return {
        name,
        defaultValue: defaultOr(0),
        customComponent: withStructuredList(
          {
            type,
            ...(field.min !== undefined ? { min: field.min } : {}),
            ...(field.max !== undefined ? { max: field.max } : {}),
            ...(field.step !== undefined ? { step: field.step } : {}),
          },
          sidecar,
        ),
        ...helpPart,
        ...requiredPart,
      };
    }
    case "boolean":
      return {
        name,
        defaultValue: defaultOr(false),
        customComponent: withStructuredList(
          { type: componentFor(BOOLEAN_COMPONENTS, "toggle", sidecar) },
          sidecar,
        ),
        ...helpPart,
        ...requiredPart,
      };
    case "enum": {
      // A 2-value enum whose sidecar names a toggle component came FROM
      // toggleValues — the two labels are the wire values.
      const [off, on] = field.values;
      if (
        sidecar.component !== undefined &&
        BOOLEAN_COMPONENTS.has(sidecar.component) &&
        field.values.length === 2 &&
        off !== undefined &&
        on !== undefined
      ) {
        return {
          name,
          defaultValue: defaultOr(""),
          customComponent: withStructuredList(
            { type: sidecar.component, toggleValues: [off, on] },
            sidecar,
          ),
          ...helpPart,
          ...requiredPart,
        };
      }
      return {
        name,
        defaultValue: defaultOr(""),
        customComponent: withStructuredList(
          {
            type: componentFor(SELECT_FAMILY, "select", sidecar),
            options: [...field.values],
            ...(field.open ? { allowOther: true } : {}),
          },
          sidecar,
        ),
        ...helpPart,
        ...requiredPart,
      };
    }
    case "string[]": {
      // Items-enum → multi-select checkbox; optionless string[] falls through
      // to the one-per-line textarea flattening below.
      if (field.values !== undefined) {
        return {
          name,
          defaultValue: defaultOr(""),
          customComponent: withStructuredList(
            {
              type: "checkbox",
              options: [...field.values],
              ...(field.open ? { allowOther: true } : {}),
            },
            sidecar,
          ),
          ...helpPart,
          ...requiredPart,
        };
      }
      if (sidecar.component === "checkbox") {
        return {
          name,
          defaultValue: defaultOr(""),
          customComponent: withStructuredList(
            {
              type: "checkbox",
              ...(sidecar.allowOther ? { allowOther: true } : {}),
            },
            sidecar,
          ),
          ...helpPart,
          ...requiredPart,
        };
      }
      return {
        name,
        defaultValue: defaultOr(""),
        helpText: field.description ?? LIST_HELP_TEXT,
        customComponent: { type: "textarea" },
        ...requiredPart,
      };
    }
    case "number[]":
    case "boolean[]":
      return {
        name,
        defaultValue: defaultOr(""),
        helpText: field.description ?? LIST_HELP_TEXT,
        customComponent: { type: "textarea" },
        ...requiredPart,
      };
    case "array":
    case "object":
    case "inline_object":
    case "record":
    case "union":
    case "json":
    case "json[]": {
      const stubDefault =
        field.default === undefined
          ? JSON.stringify(fieldStubValue(field), null, 2)
          : typeof field.default === "string"
            ? field.default
            : JSON.stringify(field.default, null, 2);
      return {
        name,
        defaultValue: stubDefault,
        helpText:
          field.description ??
          structuredJsonHelpText(structuredShapeLabel(field)),
        customComponent: { type: "textarea" },
        ...requiredPart,
      };
    }
  }
}

type StructuredField = Extract<
  FieldSchema,
  {
    type:
      | "array"
      | "object"
      | "inline_object"
      | "record"
      | "union"
      | "json"
      | "json[]";
  }
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
      return [...field.scalars, ...(field.kinds ?? [])].join(" | ");
    case "json":
      return "any JSON value";
    case "json[]":
      return "array of any JSON values";
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
    case "json":
      return null;
    case "json[]":
      return [];
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
    case "union": {
      const [firstScalar] = field.scalars;
      if (firstScalar) return scalarZero(firstScalar);
      const [firstKind] = field.kinds ?? [];
      if (firstKind) return { [KIND_KEY]: firstKind };
      return "";
    }
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
 * Agent variable definitions → kind field schemas + out-of-band sidecar,
 * with an explicit loss report for every semantic narrowing NEITHER carries.
 *
 * MAPPING TABLE (precedence: binding → picklist → component type; a variable
 * with no customComponent is a textarea):
 *
 * | VariableDefinition                                       | FieldSchema                       | sidecar                    | loss |
 * |-----------------------------------------------------------|-----------------------------------|----------------------------|------|
 * | binding set (ContextItemBinding)                          | string                            | scopeBinding               | —    |
 * | picklist + static options + !multiple                     | enum {values} (+open on allowOther) | structuredList (+component) | — |
 * | picklist otherwise (runtime options / multiple)           | string                            | structuredList (+component/allowOther) | options resolve at run time |
 * | textarea / no customComponent                             | string                            | —                          | —    |
 * | number / slider / percent (+min/max/step)                 | number {min,max,step}             | component (non-"number")   | —    |
 * | toggle / light-switch, no toggleValues                    | boolean                           | component ("light-switch") | —    |
 * | toggle / light-switch + toggleValues [a,b]                | enum {values:[a,b]}               | component                  | —    |
 * | select family + options, !allowOther                      | enum {values: options}            | component (non-"select")   | —    |
 * |   〃 with allowOther                                       | enum {values, open:true}          | component (non-"select")   | —    |
 * |   〃 without options                                       | string                            | component (non-"select")   | always — no static option set |
 * | checkbox + options                                        | string[] {values} (+open on allowOther) | —                    | —    |
 * | checkbox without options                                  | string[]                          | component ("checkbox")     | —    |
 * | datetime/time/email/url/phone/color/markdown              | string                            | component                  | —    |
 * | currency                                                  | string                            | component                  | always — {amount,currency} serialized |
 * | image / audio / video / youtube / document                | string                            | component                  | —    |
 *
 * Cross-cutting:
 * - `helpText` → `description`, EXCEPT machine-stamped flattening hints
 *   (`isSyntheticBridgeHelpText`) which are never user data.
 * - `defaultValue` → `default` verbatim, EXCEPT the shape's zero value
 *   ("", 0, false) and the synthetic structured-JSON stubs — both are the
 *   forward converter's own emissions, not authored defaults.
 * - `required: true` → `required: true`; otherwise omitted (canonical form).
 * - `customComponent.stash` is authoring residue — uniformly not carried.
 * - Duplicate variable names overwrite (last wins) and record a loss.
 * - Field keys are the variable names verbatim (the variables system already
 *   sanitizes on authoring).
 */
export function variableDefinitionsToKindFields(
  vars: VariableDefinition[],
): KindFieldsConversion {
  const fields: KindSchema["fields"] = {};
  const losses: BridgeLoss[] = [];
  const sidecar: VariableBridgeSidecar = {};
  for (const v of vars) {
    const { field, sidecarEntry, lossReasons } = convertVariable(v);
    for (const reason of lossReasons) losses.push({ name: v.name, reason });
    if (field === null) continue;
    if (v.name in fields) {
      losses.push({ name: v.name, reason: DUPLICATE_NAME_REASON });
    }
    fields[v.name] = field;
    if (Object.keys(sidecarEntry).length > 0) {
      sidecar[v.name] = sidecarEntry;
    } else {
      // Last-wins for duplicates: a later entry without sidecar clears an
      // earlier one so fields and sidecar never disagree.
      delete sidecar[v.name];
    }
  }
  return { fields, losses, sidecar };
}

type VariableConversion = {
  field: FieldSchema | null;
  sidecarEntry: VariableFieldSidecar;
  lossReasons: string[];
};

/** Canonical component per produced field shape — sidecar records deviations. */
function canonicalComponentForField(field: FieldSchema): VariableComponentType {
  switch (field.type) {
    case "number":
      return "number";
    case "boolean":
      return "toggle";
    case "enum":
      return "select";
    case "string[]":
      return field.values !== undefined ? "checkbox" : "textarea";
    default:
      return "textarea";
  }
}

/** The zero value the FORWARD converter emits for a field shape. */
function isZeroDefault(field: FieldSchema, value: unknown): boolean {
  if (field.type === "number") return value === 0 || value === "";
  if (field.type === "boolean") return value === false || value === "";
  return value === "";
}

function convertVariable(v: VariableDefinition): VariableConversion {
  const lossReasons: string[] = [];
  const sidecarEntry: VariableFieldSidecar = {};

  const cc: VariableCustomComponent | undefined = v.customComponent;
  const type: VariableComponentType = cc?.type ?? "textarea";
  const syntheticHelp =
    typeof v.helpText === "string" && isSyntheticBridgeHelpText(v.helpText);

  const finish = (core: FieldSchema): VariableConversion => {
    let field = core;
    if (v.required) field = { ...field, required: true };
    if (
      typeof v.helpText === "string" &&
      v.helpText !== "" &&
      !syntheticHelp
    ) {
      field = { ...field, description: v.helpText };
    }
    if (
      v.defaultValue !== undefined &&
      !isZeroDefault(field, v.defaultValue) &&
      !syntheticHelp
    ) {
      field = { ...field, default: v.defaultValue };
    }
    // Record the rendering component whenever it deviates from the shape's
    // canonical component (input-role annotation — media, slider, radio, …).
    // Scope-bound variables inherit their component; nothing to record.
    if (
      sidecarEntry.scopeBinding === undefined &&
      cc !== undefined &&
      type !== canonicalComponentForField(field)
    ) {
      sidecarEntry.component = type;
    }
    return { field, sidecarEntry, lossReasons };
  };

  if (v.binding) {
    // Scope-context binding — runtime-filled. The value STRUCTURE in kind
    // space is a string; the binding itself is provenance → sidecar.
    sidecarEntry.scopeBinding = v.binding;
    return finish({ type: "string" });
  }

  const structuredList = readStructuredList(cc);
  if (structuredList) {
    // Normalized to the canonical `structured_list` key on the way out —
    // the legacy `picklist` alias is read-only.
    sidecarEntry.structuredList = structuredList;
    const staticOptions = cc?.options ?? [];
    if (staticOptions.length > 0 && !structuredList.multiple) {
      // Cached static options are a real value domain — keep them (open when
      // allowOther permits values outside the set).
      return finish({
        type: "enum",
        values: [...staticOptions],
        ...(cc?.allowOther ? { open: true } : {}),
      });
    }
    if (cc?.allowOther) sidecarEntry.allowOther = true;
    lossReasons.push(
      `structured-list-bound (list ${structuredList.listId}) — ${
        structuredList.multiple ? "multi-select, " : ""
      }options resolve at run time; string in kind space (binding carried in the sidecar)`,
    );
    return finish({ type: "string" });
  }

  switch (type) {
    case "textarea":
    case "markdown":
    case "datetime":
    case "time":
    case "email":
    case "url":
    case "phone":
    case "color":
      // String-valued components — the component identity (when not
      // textarea) is an input-role annotation, carried in the sidecar.
      return finish({ type: "string" });

    case "currency":
      lossReasons.push(
        `currency {amount, currency} — serialized string in kind space`,
      );
      return finish({ type: "string" });

    case "image":
    case "audio":
    case "video":
    case "youtube":
    case "document":
      // Media refs — string values (URL / file_id) + input-role component
      // annotation in the sidecar (the ratified out-of-band treatment).
      return finish({ type: "string" });

    case "number":
    case "slider":
    case "percent":
      return finish({
        type: "number",
        ...(cc?.min !== undefined ? { min: cc.min } : {}),
        ...(cc?.max !== undefined ? { max: cc.max } : {}),
        ...(cc?.step !== undefined ? { step: cc.step } : {}),
      });

    case "toggle":
    case "light-switch": {
      const toggleValues = cc?.toggleValues;
      if (toggleValues) {
        // toggleValues emit the LABELS as wire values — a 2-value enum is
        // the faithful structure (the ratified bridge-only fix).
        return finish({ type: "enum", values: [...toggleValues] });
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
        if (cc?.allowOther) sidecarEntry.allowOther = true;
        lossReasons.push(`${type} has no static options — string in kind space`);
        return finish({ type: "string" });
      }
      return finish({
        type: "enum",
        values: [...options],
        // allowOther — "these options OR any string": the open-enum form.
        ...(cc?.allowOther ? { open: true } : {}),
      });
    }

    case "checkbox": {
      const options = cc?.options ?? [];
      if (options.length > 0) {
        return finish({
          type: "string[]",
          values: [...options],
          ...(cc?.allowOther ? { open: true } : {}),
        });
      }
      if (cc?.allowOther) sidecarEntry.allowOther = true;
      return finish({ type: "string[]" });
    }

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
 * (Slots have no component/binding provenance — the sidecar is always empty.)
 *
 * MAPPING TABLE:
 *
 * | ContextSlot.type                                                    | FieldSchema              | loss entry                                    |
 * |---------------------------------------------------------------------|--------------------------|-----------------------------------------------|
 * | text                                                                | string                   | —                                             |
 * | json                                                                | record {values:"string"} | always — arbitrary JSON narrowed to record-of-strings, the closest FieldSchema shape (`record` values are scalar-typed; there is no `any`) |
 * | file_url / db_ref / user / org / workspace / project / task / variable | string                | always — structured runtime reference         |
 *
 * Cross-cutting:
 * - `required` is never emitted: a slot with no content sent is silently
 *   skipped server-side, so slots are structurally optional.
 * - `description` → `description` (the slot's own field); `label` remains
 *   uncarried (FieldSchema has no display-label channel); max_inline_chars /
 *   summary_agent_id / mutable / persist / source are delivery mechanics,
 *   not value shape.
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
    const descPart =
      typeof slot.description === "string" && slot.description !== ""
        ? { description: slot.description }
        : {};
    switch (slot.type) {
      case "text":
        fields[slot.key] = { type: "string", ...descPart };
        break;
      case "json":
        fields[slot.key] = { type: "record", values: "string", ...descPart };
        losses.push({
          name: slot.key,
          reason:
            "json slot — arbitrary JSON narrowed to record-of-strings (closest FieldSchema shape)",
        });
        break;
      default:
        fields[slot.key] = { type: "string", ...descPart };
        losses.push({
          name: slot.key,
          reason: `${slot.type} slot — structured runtime reference; string in kind space`,
        });
        break;
    }
  }
  return { fields, losses, sidecar: {} };
}
