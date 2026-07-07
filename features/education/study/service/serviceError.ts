// features/education/study/service/serviceError.ts
//
// Shared error plumbing for the education/study services (studyService,
// planService, …). Extracted so every study service surfaces DB/PostgREST
// failures the SAME loud way — never a bare "[object Object]" or an opaque
// "Unknown error" (see project memory: Supabase message-less errors).

import type { StudyResult } from "../types";

/**
 * Surface PostgREST/DB errors loudly (message + details + hint + code), never a
 * bare "[object Object]" or an opaque "Unknown error". PostgREST errors are
 * plain objects carrying `{ message, details, hint, code }`; other failures
 * (auth, network, fetch) arrive in other shapes — so when none of the known
 * fields are present we dump the raw object rather than hide it.
 */
export function describeError(error: unknown): string {
  if (error == null) return "Unknown error";
  if (error instanceof Error) return error.message || error.name || "Error";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    const parts = [
      e.message,
      e.details,
      e.hint && `hint: ${e.hint}`,
      e.code && `(${e.code})`,
    ].filter(Boolean);
    if (parts.length) return parts.join(" — ");
    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") return json;
    } catch {
      /* circular / non-serializable — fall through */
    }
  }
  return "Unknown error";
}

/** Log the described error loudly and return the `StudyResult` failure shape. */
export function fail<T>(context: string, error: unknown): StudyResult<T> {
  const message = describeError(error);
  console.error(`[study] ${context}: ${message}`, error);
  return { data: null, error: `${context}: ${message}` };
}

/**
 * A transient HTTP status worth retrying — a server/edge/gateway/network hiccup,
 * NOT a real DB rejection (4xx like 401/403/409 are deterministic and must
 * surface). PostgREST auto-retries idempotent GETs on transient 5xx but never
 * POSTs, so an INSERT hiccup would otherwise hard-fail.
 */
export function isTransientStatus(status: number | undefined): boolean {
  return (
    status === undefined ||
    status === 0 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}
