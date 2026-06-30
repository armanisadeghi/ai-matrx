import { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeFieldName, validateFieldName } from "./field-name-sanitizer";

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
  default_value?: any;
}

export interface TableField extends FieldDefinition {
  id: string;
}

export interface CreateTableParams {
  tableName: string;
  description?: string;
  isPublic?: boolean;
  authenticatedRead?: boolean;
  fields?: FieldDefinition[] | null;
}

export interface CreateTableResult {
  success: boolean;
  tableId?: string;
  error?: string;
}

export interface AddColumnParams {
  tableId: string;
  fieldName: string;
  displayName: string;
  dataType: string;
  isRequired: boolean;
  defaultValue?: any;
}

export interface AddColumnResult {
  success: boolean;
  columnId?: string;
  error?: string;
}

export interface AddRowParams {
  tableId: string;
  data: Record<string, any>;
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

/**
 * Create a new user-generated table
 */
export async function createTable(
  supabase: SupabaseClient,
  params: CreateTableParams,
): Promise<CreateTableResult> {
  try {
    const {
      tableName,
      description = "",
      isPublic = false,
      authenticatedRead = false,
      fields = null,
    } = params;

    if (!tableName.trim()) {
      return { success: false, error: "Table name is required" };
    }

    // Normalize data types and sanitize field names if provided
    const normalizedFields = fields?.map((field) => {
      const sanitizedFieldName = sanitizeFieldName(field.field_name);

      // Log warning if field name was modified
      if (field.field_name !== sanitizedFieldName) {
        console.warn(
          `Field name "${field.field_name}" was sanitized to "${sanitizedFieldName}"`,
        );
      }

      return {
        ...field,
        field_name: sanitizedFieldName,
        data_type: normalizeDataType(field.data_type),
      };
    });

    // Log the parameters being sent
    const rpcParams = {
      p_table_name: tableName,
      p_description: description,
      p_is_public: isPublic,
      p_initial_fields: normalizedFields,
    };

    console.log("=== CREATE TABLE RPC CALL ===");
    console.log("Parameters:", JSON.stringify(rpcParams, null, 2));

    // Call the RPC function
    const { data, error } = await supabase.rpc(
      "create_new_user_table_dynamic",
      rpcParams,
    );

    console.log("RPC Response:", { data, error });
    console.log("=== END CREATE TABLE RPC ===");

    if (error) {
      console.error("Supabase RPC error:", error);
      return { success: false, error: error.message };
    }

    if (!data || !data.success) {
      console.error("API response error:", data);
      return { success: false, error: data?.error || "Failed to create table" };
    }

    return { success: true, tableId: data.table_id };
  } catch (err) {
    console.error("Error creating table:", err);
    const errorMessage =
      err instanceof Error ? err.message : "An unexpected error occurred";
    return { success: false, error: errorMessage };
  }
}

/**
 * Add a column to an existing table
 */
export async function addColumn(
  supabase: SupabaseClient,
  params: AddColumnParams,
): Promise<AddColumnResult> {
  try {
    const { tableId, displayName, dataType, isRequired, defaultValue } = params;
    let { fieldName } = params;

    if (!fieldName.trim()) {
      return { success: false, error: "Field name is required" };
    }

    if (!displayName.trim()) {
      return { success: false, error: "Display name is required" };
    }

    // Sanitize the field name to ensure it's valid
    const sanitizedFieldName = sanitizeFieldName(fieldName);

    // Log warning if field name was modified
    if (fieldName !== sanitizedFieldName) {
      console.warn(
        `Field name "${fieldName}" was sanitized to "${sanitizedFieldName}"`,
      );
      fieldName = sanitizedFieldName;
    }

    // Validate the sanitized field name
    if (!validateFieldName(fieldName)) {
      return {
        success: false,
        error: `Invalid field name: "${fieldName}". Field names must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.`,
      };
    }

    // Normalize the data type
    const normalizedDataType = normalizeDataType(dataType);

    // Format default value based on data type
    let formattedDefaultValue: string | number | boolean | null = null;
    if (defaultValue !== undefined && defaultValue !== null) {
      switch (normalizedDataType) {
        case "number":
          formattedDefaultValue =
            typeof defaultValue === "number"
              ? defaultValue
              : parseFloat(String(defaultValue));
          break;
        case "integer":
          formattedDefaultValue =
            typeof defaultValue === "number"
              ? Math.floor(defaultValue)
              : parseInt(String(defaultValue));
          break;
        case "boolean":
          formattedDefaultValue =
            typeof defaultValue === "boolean"
              ? defaultValue
              : String(defaultValue).toLowerCase() === "true";
          break;
        default:
          formattedDefaultValue = defaultValue;
      }
    }

    // Call the RPC function
    const { data, error } = await supabase.rpc("add_column_to_user_table", {
      p_table_id: tableId,
      p_field_name: fieldName,
      p_display_name: displayName,
      p_data_type: normalizedDataType,
      p_is_required: isRequired,
      p_default_value: formattedDefaultValue,
    });

    if (error) {
      console.error("Supabase RPC error:", error);
      return { success: false, error: error.message };
    }

    if (!data || !data.success) {
      console.error("API response error:", data);
      return { success: false, error: data?.error || "Failed to add column" };
    }

    return { success: true, columnId: data.column_id };
  } catch (err) {
    console.error("Error adding column:", err);
    const errorMessage =
      err instanceof Error ? err.message : "An unexpected error occurred";
    return { success: false, error: errorMessage };
  }
}

/**
 * Get table details including fields
 */
export async function getTableDetails(
  supabase: SupabaseClient,
  tableId: string,
): Promise<GetTableResult> {
  try {
    const { data, error } = await supabase.rpc("get_user_table_complete", {
      p_table_id: tableId,
    });

    if (error) {
      console.error("Supabase RPC error:", error);
      return { success: false, error: error.message };
    }

    if (!data || !data.success) {
      console.error("API response error:", data);
      return {
        success: false,
        error: data?.error || "Failed to load table details",
      };
    }

    return {
      success: true,
      table: data.table,
      fields: data.fields,
    };
  } catch (err) {
    console.error("Error loading table details:", err);
    const errorMessage =
      err instanceof Error ? err.message : "An unexpected error occurred";
    return { success: false, error: errorMessage };
  }
}

/**
 * Add a row of data to a table
 */
export async function addRow(
  supabase: SupabaseClient,
  params: AddRowParams,
): Promise<AddRowResult> {
  try {
    const { tableId, data } = params;

    // Call the RPC function
    const { data: result, error } = await supabase.rpc(
      "add_data_row_to_user_table",
      {
        p_table_id: tableId,
        p_data: data,
      },
    );

    if (error) {
      console.error("Supabase RPC error:", error);
      return { success: false, error: error.message };
    }

    if (!result || !result.success) {
      console.error("API response error:", result);
      return { success: false, error: result?.error || "Failed to add row" };
    }

    return { success: true, rowId: result.row_id };
  } catch (err) {
    console.error("Error adding row:", err);
    const errorMessage =
      err instanceof Error ? err.message : "An unexpected error occurred";
    return { success: false, error: errorMessage };
  }
}
