// features/data-tables/table-shapes.ts — the column and table shapes the table forms and the
// data seam (`features/data-tables/service.ts`) share, and the one data-type normalizer.
// Every read and write goes through the seam; nothing here calls the database.

// Valid data types according to the backend schema
export const VALID_DATA_TYPES = [
  "string",
  "number",
  "integer",
  "boolean",
  "date",
  "datetime",
  "json",
  "array",
] as const;

export type ValidDataType = (typeof VALID_DATA_TYPES)[number];

// Mapping common variations to valid data types
const DATA_TYPE_MAPPING: Record<string, ValidDataType> = {
  // Common variations for string
  text: "string",
  varchar: "string",
  char: "string",
  str: "string",
  textarea: "string",
  longtext: "string",
  mediumtext: "string",
  clob: "string",

  // Common variations for number
  float: "number",
  double: "number",
  decimal: "number",
  numeric: "number",

  // Common variations for integer
  int: "integer",
  bigint: "integer",
  smallint: "integer",

  // Common variations for boolean
  bool: "boolean",

  // Common variations for date/time
  timestamp: "datetime",
  timestamptz: "datetime",
  time: "datetime",
  timetz: "datetime",

  // Common variations for json
  jsonb: "json",

  // Common variations for array
  arrays: "array",
};

export interface FieldDefinition {
  field_name: string;
  display_name: string;
  data_type: string;
  field_order: number;
  is_required: boolean;
  default_value?: string | number | boolean | null;
}

export interface TableField extends FieldDefinition {
  id: string;
  is_public?: boolean;
  /**
   * Free-form per-column config. `metadata.format` holds the column's display
   * format ({id, options}) — read it with `resolveFieldFormat` from
   * `@ai-matrx/design-system/field-formats`, never by hand. See `lib/field-formats/FEATURE.md`.
   */
  metadata?: Record<string, unknown> | null;
  /**
   * The column's validation rules (min/max, lengths, pattern, allowed values,
   * unique). The seam returns this on every field row, so every surface that
   * loads fields already holds it. Read it with
   * `parseValidationRules` from `@/features/data-tables/validation`, never by
   * hand — it is a jsonb column that predates the feature, and an import or an
   * agent may have written something else into it. `required` is NOT in here:
   * `is_required` above is that fact's one home.
   */
  validation_rules?: unknown;
}

export interface CreateTableParams {
  tableName: string;
  description?: string;
  isPublic?: boolean;
  authenticatedRead?: boolean;
  fields?: FieldDefinition[] | null;
  /**
   * The organization the new table belongs to. A caller which already holds one passes it; a
   * caller which does not lets `ensureOrgId` hold the request, show the person their
   * memberships and resume. Nothing derives one.
   */
  organizationId?: string | null;
}

export interface CreateTableResult {
  success: boolean;
  tableId?: string;
  error?: string;
  /** Made, but not exactly as asked (a required mark the store did not keep, a description refused) — said, never dropped. */
  warning?: string;
}

export interface AddColumnParams {
  tableId: string;
  fieldName: string;
  displayName: string;
  dataType: string;
  isRequired: boolean;
  defaultValue?: string | number | boolean | null;
  /**
   * Where the column lands. Omit to append at the end; pass an existing
   * column's order to insert THERE (the caller renumbers the columns after it).
   */
  fieldOrder?: number;
}

export interface AddColumnResult {
  success: boolean;
  columnId?: string;
  error?: string;
}

export interface AddRowParams {
  tableId: string;
  data: Record<string, unknown>;
}

export interface AddRowResult {
  success: boolean;
  rowId?: string;
  error?: string;
}

export interface GetTableResult {
  success: boolean;
  table?: {
    id: string;
    name: string;
    description: string;
    is_public: boolean;
  };
  fields?: TableField[];
  error?: string;
}

/**
 * Normalize a data type string to ensure it's one of the valid types
 */
export function normalizeDataType(dataType: string): ValidDataType {
  dataType = dataType.toLowerCase().trim();

  // If it's already a valid type, return it
  if (VALID_DATA_TYPES.includes(dataType as ValidDataType)) {
    return dataType as ValidDataType;
  }

  // Check if we have a mapping for this type
  if (dataType in DATA_TYPE_MAPPING) {
    return DATA_TYPE_MAPPING[dataType];
  }

  // Default to string if unknown
  console.warn(`Unknown data type: ${dataType}, defaulting to string`);
  return "string";
}
