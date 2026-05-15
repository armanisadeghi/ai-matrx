"use server";

import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import {
  mapGetDatabaseFunctionsRows,
  type SqlFunction,
} from "@/types/sql-functions";

/**
 * Fetches all SQL functions from the database
 */
export async function getSqlFunctions(): Promise<SqlFunction[]> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("get_database_functions");

    if (error) throw error;

    return mapGetDatabaseFunctionsRows(data ?? []);
  } catch (error) {
    console.error("Error fetching SQL functions:", error);
    throw new Error("Failed to fetch SQL functions");
  }
}

/**
 * Fetches a single SQL function by its ID
 */
export async function getSqlFunctionById(id: string) {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("get_database_function_by_id", {
      function_id: id,
    });

    if (error) throw error;

    return data;
  } catch (error) {
    console.error("Error fetching SQL function:", error);
    throw new Error("Failed to fetch SQL function");
  }
}

/**
 * Fetches filtered SQL functions based on search parameters
 */
export async function searchSqlFunctions({
  schema,
  name,
  returnType,
}: {
  schema?: string;
  name?: string;
  returnType?: string;
}): Promise<SqlFunction[]> {
  try {
    const supabase = await createClient();

    let query = supabase.rpc("get_database_functions");

    // We'll filter the results on the client side for now
    // In a real implementation, we would create a specialized RPC function
    // to handle filtering on the database side
    const { data, error } = await query;

    if (error) throw error;

    // Apply filters
    let filteredData = data ?? [];

    if (schema) {
      filteredData = filteredData.filter((func) =>
        func.schema.toLowerCase().includes(schema.toLowerCase()),
      );
    }

    if (name) {
      filteredData = filteredData.filter((func) =>
        func.name.toLowerCase().includes(name.toLowerCase()),
      );
    }

    if (returnType) {
      filteredData = filteredData.filter((func) =>
        func.returns.toLowerCase().includes(returnType.toLowerCase()),
      );
    }

    return mapGetDatabaseFunctionsRows(filteredData);
  } catch (error) {
    console.error("Error searching SQL functions:", error);
    throw new Error("Failed to search SQL functions");
  }
}

/**
 * Creates a new SQL function
 */
export async function createSqlFunction(functionDefinition: string) {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("execute_admin_query", {
      query: functionDefinition,
    });

    if (error) throw error;

    revalidatePath("/administration/database/sql-functions");
    return data;
  } catch (error) {
    console.error("Error creating SQL function:", error);
    throw new Error("Failed to create SQL function");
  }
}

/**
 * Updates an existing SQL function
 */
export async function updateSqlFunction(functionDefinition: string) {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("execute_admin_query", {
      query: functionDefinition,
    });

    if (error) throw error;

    revalidatePath("/administration/database/sql-functions");
    return data;
  } catch (error) {
    console.error("Error updating SQL function:", error);
    throw new Error("Failed to update SQL function");
  }
}

interface FunctionCallArg {
  argName: string;
  argType: string;
  value: string;
  isNull: boolean;
}

function formatSqlArgValue(type: string, value: string): string {
  const lower = type.toLowerCase().replace(/\[\]$/, "").trim();
  const isArray = type.trim().endsWith("[]");

  if (isArray) {
    return `'${value.replace(/'/g, "''")}'::${lower}[]`;
  }

  const numericTypes = [
    "integer",
    "int",
    "int4",
    "int8",
    "int2",
    "bigint",
    "smallint",
    "serial",
    "bigserial",
    "numeric",
    "decimal",
    "real",
    "float",
    "float4",
    "float8",
    "double precision",
    "double",
    "oid",
  ];

  if (numericTypes.includes(lower)) {
    return value.trim() || "0";
  }

  if (["boolean", "bool"].includes(lower)) {
    return value === "true" ? "true" : "false";
  }

  if (["json", "jsonb"].includes(lower)) {
    return `'${value.replace(/'/g, "''")}'::${lower}`;
  }

  if (lower === "uuid") {
    return `'${value.replace(/'/g, "''")}'::uuid`;
  }

  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Executes a SQL function call for testing purposes and returns the result.
 */
export async function executeSqlFunctionCall(
  schema: string,
  name: string,
  returns: string,
  args: FunctionCallArg[],
): Promise<{ data: unknown; error: string | null; sql: string }> {
  const argParts = args.map((arg) => {
    if (arg.isNull) {
      return arg.argName ? `${arg.argName} => NULL` : "NULL";
    }
    const formatted = formatSqlArgValue(arg.argType, arg.value);
    return arg.argName ? `${arg.argName} => ${formatted}` : formatted;
  });

  const returnsLower = returns.toLowerCase().trim();
  const isVoid = returnsLower === "void";
  const functionCall = `${schema}.${name}(${argParts.join(", ")})`;
  const sql = isVoid
    ? `SELECT ${functionCall}`
    : `SELECT * FROM ${functionCall}`;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("execute_admin_query", {
      query: sql,
    });
    if (error) return { data: null, error: error.message, sql };
    return { data, error: null, sql };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { data: null, error: msg, sql };
  }
}

/**
 * Deletes a SQL function
 */
export async function deleteSqlFunction(
  schema: string,
  functionName: string,
  argumentTypes: string,
) {
  try {
    const supabase = createAdminClient();

    // Construct the DROP FUNCTION query
    const query = `DROP FUNCTION IF EXISTS ${schema}.${functionName}(${argumentTypes});`;

    const { data, error } = await supabase.rpc("execute_admin_query", {
      query,
    });

    if (error) throw error;

    revalidatePath("/administration/database/sql-functions");
    return data;
  } catch (error) {
    console.error("Error deleting SQL function:", error);
    throw new Error("Failed to delete SQL function");
  }
}
