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
