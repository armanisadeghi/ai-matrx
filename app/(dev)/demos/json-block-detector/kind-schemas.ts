/** System discriminator — hardcoded, not part of per-kind field schemas. */
export const KIND_KEY = "__kind";

export type ScalarFieldType = "string" | "number" | "boolean";

export type ArrayItemScalarType = "string" | "number" | "boolean";

type FieldBase = {
  required?: boolean;
  nullable?: boolean;
};

export type FieldSchema =
  | (FieldBase & { type: ScalarFieldType })
  | (FieldBase & { type: "string[]" | "number[]" | "boolean[]" })
  | (FieldBase & { type: "array"; itemKinds: string[] })
  | (FieldBase & { type: "object"; kind: string })
  | (FieldBase & { type: "inline_object"; fields: Record<string, FieldSchema> })
  | (FieldBase & { type: "record"; values: ArrayItemScalarType })
  | (FieldBase & { type: "enum"; values: string[] })
  | (FieldBase & {
      type: "union";
      scalars: Array<"string" | "number" | "boolean">;
    });

/** Domain fields only — __kind is enforced by the parser via KindSchema.kind (block slug). */
export type KindSchema = {
  kind: string;
  fields: Record<string, FieldSchema>;
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

/** Placeholder for a required field not yet received during streaming. */
export function emptyValueForFieldSchema(field: FieldSchema): unknown {
  if (field.nullable) return null;

  switch (field.type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string[]":
    case "number[]":
    case "boolean[]":
    case "array":
      return [];
    case "object":
    case "inline_object":
    case "record":
      return {};
    case "enum":
      return "";
    case "union":
      if (field.scalars.includes("string")) return "";
      if (field.scalars.includes("number")) return 0;
      return false;
    default:
      return null;
  }
}

export function buildCompliantKindSnapshot(
  schema: KindSchema,
  partial: Record<string, unknown>,
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    [KIND_KEY]: schema.kind,
  };

  for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
    if (fieldName in partial && partial[fieldName] !== undefined) {
      snapshot[fieldName] = partial[fieldName];
    } else if (fieldSchema.required) {
      snapshot[fieldName] = emptyValueForFieldSchema(fieldSchema);
    }
  }

  for (const [fieldName, value] of Object.entries(partial)) {
    if (fieldName === KIND_KEY) continue;
    if (fieldName in schema.fields) continue;
    snapshot[fieldName] = value;
  }

  return snapshot;
}
