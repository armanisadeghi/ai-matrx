/**
 * KindSchema — the data-defined field model for a registered kind.
 *
 * `__kind` (KIND_KEY) is the carried discriminator: it is NOT part of a
 * kind's field map; the parser enforces it via `KindSchema.kind` and stamps
 * it onto every compliant snapshot.
 *
 * Moved from app/(dev)/demos/json-block-detector/kind-schemas.ts.
 *
 * 2026-07-15 expressivity extension (A2) — four constructs the Python-owned
 * pydantic schemas need that the v1 vocabulary could not express:
 *   - `{type:"json"}` / `{type:"json[]"}` — any JSON value / array of any
 *     JSON values (pydantic bare `Any` fields, `items: {}` arrays, `{}`
 *     schemas). A `json` value is implicitly nullable — `null` IS a JSON
 *     value — so `nullable` is meaningless (and ignored) on it.
 *   - `record` values widened to `"json"` (pydantic `dict[str, Any]` /
 *     `additionalProperties: true`).
 *   - `union` may now carry `kinds` (object unions — anyOf over kind refs,
 *     optionally mixed with scalars). Refs externalize to `kind_edge` rows
 *     exactly like `array.itemKinds`.
 *   - `KindSchema.root` — a NON-OBJECT root form: the kind's VALUE is the
 *     root field itself (scalar / array / json / open object), not a `__kind`
 *     object with fields. Root-form kinds are data-only: the streaming
 *     `__kind` parser cannot type them (a scalar cannot carry a
 *     discriminator) and refuses them loudly; validation goes through the
 *     emitted JSON Schema (ajv / Pydantic). `root` and a non-empty `fields`
 *     are mutually exclusive.
 *   - `inline_object.open` — `additionalProperties: true`; fixes the
 *     open-empty-object defect where an open `inline_object{fields:{}}`
 *     materialized as CLOSED (schema_proposal / item_presentation class).
 */

/** System discriminator — hardcoded, not part of per-kind field schemas. */
export const KIND_KEY = "__kind";

export type ScalarFieldType = "string" | "number" | "boolean";

export type ArrayItemScalarType = "string" | "number" | "boolean";

/** Value domain of a `record` field — typed scalars, or any JSON value. */
export type RecordValueType = ArrayItemScalarType | "json";

type FieldBase = {
  required?: boolean;
  nullable?: boolean;
};

export type FieldSchema =
  | (FieldBase & { type: ScalarFieldType })
  | (FieldBase & { type: "string[]" | "number[]" | "boolean[]" })
  | (FieldBase & { type: "json" })
  | (FieldBase & { type: "json[]" })
  | (FieldBase & { type: "array"; itemKinds: string[] })
  | (FieldBase & { type: "object"; kind: string })
  | (FieldBase & {
      type: "inline_object";
      fields: Record<string, FieldSchema>;
      /** additionalProperties: true — unknown keys are legal, not residue-only. */
      open?: boolean;
    })
  | (FieldBase & { type: "record"; values: RecordValueType })
  | (FieldBase & { type: "enum"; values: string[] })
  | (FieldBase & {
      type: "union";
      scalars: Array<"string" | "number" | "boolean">;
      /** Object union members — kind refs (anyOf of $refs), may mix with scalars. */
      kinds?: string[];
    });

/**
 * Domain fields only — __kind is enforced by the parser via KindSchema.kind
 * (block slug). A kind with `root` set has NO field map (fields stays `{}`):
 * its value is the root field's type at the top level. See the module header.
 */
export type KindSchema = {
  kind: string;
  fields: Record<string, FieldSchema>;
  /** Non-object root form — mutually exclusive with a non-empty `fields`. */
  root?: FieldSchema;
};

export function readObjectKind(value: Record<string, unknown>): string | null {
  const kind = value[KIND_KEY];
  return typeof kind === "string" ? kind : null;
}

export function isScalarArrayType(
  type: FieldSchema["type"],
): type is "string[]" | "number[]" | "boolean[]" {
  return type === "string[]" || type === "number[]" || type === "boolean[]";
}

export function scalarArrayItemType(
  type: "string[]" | "number[]" | "boolean[]",
): ArrayItemScalarType {
  if (type === "number[]") return "number";
  if (type === "boolean[]") return "boolean";
  return "string";
}

/**
 * Does this field's value domain accept ANY JSON shape (object/array/scalar/
 * null alike)? True for `json` and `json[]` ITEMS — the parser treats the
 * subtree under such a field as opaque (no kind identification, no raw_object
 * degradation: unknown structure is the declared contract, not a failure).
 */
export function isJsonAnyField(field: FieldSchema): boolean {
  return field.type === "json" || field.type === "json[]";
}
