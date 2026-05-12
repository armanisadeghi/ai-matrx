import type { FieldDefinition } from "./table-utils";
import { sanitizeFieldName } from "./field-name-sanitizer";

// Extended field definition used during preview/edit flows. The `included`
// flag lets the caller toggle a detected column out of the create-table
// payload without losing its position or inferred type.
export interface DetectedField extends FieldDefinition {
  included: boolean;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/;

/**
 * Infer a `udt_datasets` data type for a single value. Used by both the
 * CSV/Excel import path and the JSON-to-table path. The returned strings
 * align with `VALID_DATA_TYPES` in `table-utils.ts`.
 */
export function inferDataType(value: unknown): string {
  if (value === null || value === undefined || value === "") return "string";

  if (typeof value === "boolean") return "boolean";

  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }

  if (typeof value === "object") {
    return Array.isArray(value) ? "array" : "json";
  }

  // Strings — try numeric parse, then date patterns, then boolean keywords,
  // else fall back to string.
  const str = String(value);
  const num = Number(str);
  if (!isNaN(num) && str.trim() !== "") {
    return Number.isInteger(num) ? "integer" : "number";
  }

  const lower = str.toLowerCase().trim();
  if (lower === "true" || lower === "false") return "boolean";

  if (DATE_PATTERN.test(str)) return "date";
  if (DATETIME_PATTERN.test(str)) return "datetime";

  return "string";
}

/**
 * Analyze an array of row objects, returning per-column `DetectedField`
 * entries with inferred data types. Looks at up to the first 100 non-empty
 * values per column and picks the most common inferred type.
 *
 * Column order matches the key order in the first row (deterministic).
 */
export function analyzeData(
  data: Record<string, unknown>[],
  options: { columns?: string[] } = {},
): DetectedField[] {
  if (!data || data.length === 0) return [];

  const columns =
    options.columns ??
    Array.from(new Set(data.flatMap((row) => Object.keys(row))));

  return columns.map((column, index) => {
    const sampleValues = data
      .slice(0, Math.min(100, data.length))
      .map((row) => row[column])
      .filter((val) => val !== null && val !== undefined && val !== "");

    let inferredType = "string";
    if (sampleValues.length > 0) {
      const typeCounts: Record<string, number> = {};
      for (const val of sampleValues) {
        const type = inferDataType(val);
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      }
      inferredType = Object.entries(typeCounts).sort(
        (a, b) => b[1] - a[1],
      )[0][0];
    }

    return {
      field_name: sanitizeFieldName(column),
      display_name: column,
      data_type: inferredType,
      field_order: index,
      is_required: false,
      included: true,
    };
  });
}
