/**
 * features/page-extraction/utils/schema-validation.ts
 *
 * Tiny schema helpers used by the ResultsTable and the (future)
 * SchemaBuilder. We intentionally don't pull in a full JSON Schema
 * validator on the client — the backend validates against the same
 * schema and persists raw responses on failure.
 */

import type {
  FlatObjectSchema,
  JobOutputSchema,
} from "@/features/page-extraction/types";

/**
 * Normalize the Job's `output_schema` to the per-row element schema.
 * Accepts either:
 *   - the element schema directly: { type: "object", properties: {...} }
 *   - an array wrapper: { type: "array", items: { type: "object", ... } }
 */
export function unwrapArraySchema(
  schema: unknown,
): FlatObjectSchema | null {
  if (!schema || typeof schema !== "object") return null;
  const s = schema as JobOutputSchema;
  if (s.type === "array") {
    if (s.items && s.items.type === "object") return s.items;
    return null;
  }
  if (s.type === "object") return s;
  return null;
}

/**
 * Ordered list of column keys for the ResultsTable. Preserves the order
 * defined in `properties`, with `required` keys first (within their group).
 */
export function schemaColumns(schema: FlatObjectSchema | null): string[] {
  if (!schema) return [];
  const required = new Set(schema.required ?? []);
  const keys = Object.keys(schema.properties);
  const req = keys.filter((k) => required.has(k));
  const opt = keys.filter((k) => !required.has(k));
  return [...req, ...opt];
}

/**
 * Human-friendly column label. Falls back to the key.
 */
export function columnLabel(
  key: string,
  schema: FlatObjectSchema | null,
): string {
  const prop = schema?.properties[key];
  if (prop?.description) return prop.description;
  return key;
}
