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
