// lib/integrity/unwrap.ts
//
// `execute_admin_query` is declared `(query text, OUT result jsonb)`, so
// PostgREST returns the rows wrapped as `{ result: [...] }` rather than a bare
// array. Normalize both shapes to a row array.

import type { IntegrityFinding } from "./types";

export function unwrapRows(data: unknown): IntegrityFinding[] {
  if (Array.isArray(data)) return data as IntegrityFinding[];
  if (data && typeof data === "object") {
    const inner = (data as { result?: unknown }).result;
    if (Array.isArray(inner)) return inner as IntegrityFinding[];
  }
  return [];
}

/** Require the row envelope when an empty answer would misrepresent a failed admin read. */
export function requireAdminQueryRows<T>(data: unknown, label: string): T[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (data as { result?: unknown }).result
      : undefined;
  if (!Array.isArray(rows)) {
    throw new Error(`Admin query ${label} returned an invalid row envelope`);
  }
  return rows as T[];
}
