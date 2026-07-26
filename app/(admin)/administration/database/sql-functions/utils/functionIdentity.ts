import { SqlFunction } from "@/types/sql-functions";

/** Stable identity for a Postgres function overload (schema + name + argument types). */
export function getSqlFunctionKey(func: SqlFunction): string {
  return `${func.schema}.${func.name}(${func.arguments})`;
}
