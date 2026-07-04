import { formatText } from "@/utils/text/text-case-converter";
import type { FieldSchema, KindSchema } from "./kind-schemas";

/** Human label from a slug or field key (snake_case → Title Case + acronym fixes). */
export function formatBlockLabel(key: string): string {
  return formatText(key, { textCase: "title" });
}

/**
 * Structural nesting depth of a kind schema — drives generic renderer layout.
 * 0 = flat card (scalars only)
 * 1 = grid (one array/object nesting level)
 * 2+ = expandable grid (parent → child → grandchild)
 */
export function schemaStructureDepth(
  schema: KindSchema,
  allSchemas: Record<string, KindSchema>,
  visiting: Set<string> = new Set(),
): number {
  if (visiting.has(schema.kind)) return 0;
  visiting.add(schema.kind);

  let max = 0;
  for (const field of Object.values(schema.fields)) {
    max = Math.max(max, fieldStructureDepth(field, allSchemas, visiting));
  }

  visiting.delete(schema.kind);
  return max;
}

function fieldStructureDepth(
  field: FieldSchema,
  allSchemas: Record<string, KindSchema>,
  visiting: Set<string>,
): number {
  switch (field.type) {
    case "array": {
      let itemMax = 0;
      for (const itemKind of field.itemKinds) {
        const itemSchema = allSchemas[itemKind];
        itemMax = Math.max(
          itemMax,
          itemSchema
            ? 1 + schemaStructureDepth(itemSchema, allSchemas, visiting)
            : 1,
        );
      }
      return itemMax;
    }
    case "object": {
      const ref = allSchemas[field.kind];
      return ref ? 1 + schemaStructureDepth(ref, allSchemas, visiting) : 1;
    }
    case "inline_object": {
      let nested = 0;
      for (const child of Object.values(field.fields)) {
        nested = Math.max(
          nested,
          fieldStructureDepth(child, allSchemas, visiting),
        );
      }
      return nested > 0 ? 1 + nested : 1;
    }
    default:
      return 0;
  }
}

export type SchemaLayoutMode = "flat" | "grid" | "nested";

export function schemaLayoutMode(
  schema: KindSchema,
  allSchemas: Record<string, KindSchema>,
): SchemaLayoutMode {
  const depth = schemaStructureDepth(schema, allSchemas);
  if (depth <= 0) return "flat";
  if (depth === 1) return "grid";
  return "nested";
}
