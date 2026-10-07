
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/;

/**
 * Infer a table column's data type for a single value. Used by both the
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
