// features/scopes/service/rpcResult.ts
//
// Shared result helpers for the scopes-module service chokepoints.
//
// `scopesService.ts` grew its own private copies of `ok`/`err`/`mapPgError`/
// `mapPgErrorPair`; this file extracts them VERBATIM (same logic, same shape,
// same loud-before-lossy logging) and exports them so sibling chokepoints —
// `associationsService.ts` first — consume one implementation instead of
// forking a fourth. scopesService keeps its private copies for now; a separate
// pass dedupes it onto these. Until then, the two MUST stay byte-identical.
//
// Every method that returns a `ScopesRpcResult` builds it through `ok`/`err`
// here and NEVER throws to its caller.

import type { ScopesRpcError, ScopesRpcResult } from "@/features/scopes/types";

// Re-exported for convenience so a service file imports its envelope and its
// builders from one place.
export type { ScopesRpcError, ScopesRpcResult } from "@/features/scopes/types";

export function err(
  code: ScopesRpcError["code"],
  message: string,
  detail?: unknown,
): { ok: false; error: ScopesRpcError } {
  return { ok: false, error: { code, message, detail } };
}

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function mapPgError(e: unknown): ScopesRpcError {
  // Loud before lossy: the friendly mapping below discards the PG error
  // code / constraint / hint that production debugging needs. Log the raw
  // error with full context HERE — the single funnel every failure passes
  // through — so "my association didn't save" is diagnosable from the
  // console instead of vanishing into a generic message.
  console.error("[scopes/rpcResult] supabase error", e);
  if (e && typeof e === "object" && "code" in e) {
    const code = String((e as { code: string }).code);
    if (code === "PGRST116") return { code: "not_found", message: "Not found" };
    if (code === "42501")
      return { code: "forbidden_org", message: "Permission denied" };
  }
  const message =
    e instanceof Error ? e.message : "Unexpected error talking to Supabase";
  return { code: "internal", message, detail: e };
}

/** Paired return so `err(...mapPgErrorPair(e))` satisfies TS tuple unpacking. */
export function mapPgErrorPair(
  e: unknown,
): [ScopesRpcError["code"], string, unknown] {
  const mapped = mapPgError(e);
  return [mapped.code, mapped.message, mapped.detail];
}
