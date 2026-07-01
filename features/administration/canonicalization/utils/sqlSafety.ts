// features/administration/canonicalization/utils/sqlSafety.ts
//
// `execute_admin_query` takes a raw SQL string (see actions/admin/database.ts)
// — there is no parameterized-query path. Every value that reaches this
// feature's query builders from an admin text input (schema/table/token/
// variant) must be validated as a plain identifier and/or escaped as a SQL
// string literal before interpolation.

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Rejects anything that isn't a plain snake_case-ish identifier. */
export function assertSafeIdentifier(value: string, label: string): string {
  const trimmed = value.trim();
  if (!IDENTIFIER_RE.test(trimmed)) {
    throw new Error(`Invalid ${label}: "${value}" is not a valid identifier`);
  }
  return trimmed;
}

/** Escapes and single-quotes a value for use as a SQL string literal. */
export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
