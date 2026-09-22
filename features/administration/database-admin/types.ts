// types/database.ts
export interface DatabaseFunction {
  name: string;
  schema: string;
  security_type: string;
  arguments: string;
  returns: string;
  definition: string;
}

/**
 * PostgreSQL permits overloaded functions. Their schema, name, and argument
 * list together are the stable identity used by the table and details URL.
 */
export function databaseFunctionSignature(
  func: Pick<DatabaseFunction, "schema" | "name" | "arguments">,
): string {
  return `${func.schema}.${func.name}(${func.arguments})`;
}

export interface DatabasePermission {
  object_name: string;
  object_type: string;
  role: string;
  privileges: string[];
}
