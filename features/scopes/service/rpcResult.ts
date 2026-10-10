// features/scopes/service/rpcResult.ts — the `ok` / `err` builders a few host services (organizations,
// purpose, orchestras) use for their own direct reads, in the SAME vocabulary as the scope doors —
// `RecordsResult` / `RecordsError` from `@ai-matrx/records`. A caught supabase / thrown error becomes a
// `RecordsError` through the package's `mapThrownError` (`@ai-matrx/records/core`); this file keeps no
// mapper of its own.

import type { RecordsErrorCode, RecordsResult } from "@ai-matrx/records";

export type { RecordsError, RecordsResult } from "@ai-matrx/records";

export function err(
  code: RecordsErrorCode,
  message: string,
  detail?: unknown,
  hint?: string,
): RecordsResult<never> {
  return { ok: false, error: { code, message, detail, hint } };
}

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}
