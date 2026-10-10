// features/scopes/service/rpcResult.ts — a supabase-js error as a `RecordsResult` error.
//
// Scope data no longer comes through here: it is `scopeDoors()` (`@ai-matrx/records/scopes`), which
// answers `RecordsResult` with the store's own words. What remains is the small helper a few host
// services (organizations, purpose, orchestras) use for their own direct reads, speaking the SAME
// vocabulary — `RecordsResult` / `RecordsError` from `@ai-matrx/records` — so there is one error
// vocabulary on the web, not three.

import { isTransportFailure } from "@ai-matrx/data/net";

import { personSentence } from "@/lib/errors/writeFailure";

import type { RecordsError, RecordsErrorCode, RecordsResult } from "@ai-matrx/records";

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

export function mapPgError(e: unknown): RecordsError {
  // Loud before lossy: the friendly mapping below discards the PG error
  // code / constraint / hint that production debugging needs. Log the raw
  // error with full context HERE — the single funnel every failure passes
  // through — so "my association didn't save" is diagnosable from the
  // console instead of vanishing into a generic message.
  //
  // EXCEPT a transport failure. A browser that is asleep, offline, or mid-wifi
  // handoff rejects fetch with `TypeError: Failed to fetch`; the Supabase
  // gateway can likewise return its bounded upstream-connect/reset-before-
  // headers shape. Neither carries a database refusal an engineer can act on.
  // Filing those as errors buries real failures, so they log as warnings; every
  // genuine Postgres/PostgREST failure stays loud.
  if (isTransportFailure(e)) {
    console.warn("[scopes/rpcResult] network unreachable (browser offline?)", e);
  } else if (!isPostgrestResultError(e)) {
    // Plain PostgREST result errors have already been captured with richer
    // relation/operation/call-site context by supabaseErrorCapture. Mirroring
    // them through console.error creates a second repair-queue row for the
    // same request. Thrown application errors still scream here.
    console.error("[scopes/rpcResult] supabase error", e);
  }
  const { pgCode, pgMessage, pgHint } = readPgFields(e);

  if (pgCode === "PGRST116") return { code: "not_found", message: "Not found" };
  if (pgCode === "42501")
    // access-errors: ok — maps Postgres 42501 (insufficient_privilege), the server's own explicit verdict, not a zero-row guess
    // The door's own sentence when it said one ("…is not yours to change."), never a bare
    // "Permission denied" over it (lane HANDOVER, 2026-09-27).
    return { code: "door", message: personSentence(pgMessage) ?? "You do not have permission to do this." };
  // The session's JWT is gone or expired — the user is signed out, not broken.
  if (pgCode === "PGRST301" || pgCode === "PGRST303")
    // access-errors: ok — PGRST301/303 is PostgREST's own expired-JWT verdict, verified by code, not a guess
    return { code: "door", message: "Your session expired" };
  // Postgres killed the statement at the role's `statement_timeout` (8s for
  // `authenticated`). The database is up and the query is valid; it ran out of
  // time — usually because something else was saturating the instance. Say so,
  // because "unexpected error" sends the reader hunting for the wrong fault.
  if (pgCode === "57014")
    return {
      code: "internal",
      message: "The database took too long to respond",
      hint: pgHint,
      detail: e,
    };

  return {
    // A real message from PostgREST beats our generic string every time; the
    // generic one is the LAST resort, not the default.
    message: pgMessage ?? "Unexpected error talking to Supabase",
    code: "internal",
    hint: pgHint,
    detail: e,
  };
}

function isPostgrestResultError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const value = e as { code?: unknown; message?: unknown };
  return typeof value.code === "string" && typeof value.message === "string";
}

/**
 * Pull `code` / `message` / `hint` off whatever supabase-js handed us.
 *
 * Three shapes reach here and only the first is common:
 *   1. a PLAIN object from PostgREST — `{ code, message, details, hint }`
 *   2. a thrown `Error` (network stack, our own `requireUserId`, a bug)
 *   3. something else entirely (a string, null) from a path we don't own
 */
function readPgFields(e: unknown): {
  pgCode: string | null;
  pgMessage: string | null;
  pgHint: string | undefined;
} {
  if (e && typeof e === "object") {
    const o = e as { code?: unknown; message?: unknown; hint?: unknown };
    return {
      pgCode: typeof o.code === "string" && o.code ? o.code : null,
      // `Error` instances land here too — `message` is an own/inherited
      // string property either way, so one read covers both shapes.
      pgMessage:
        typeof o.message === "string" && o.message ? o.message : null,
      pgHint: typeof o.hint === "string" && o.hint ? o.hint : undefined,
    };
  }
  return { pgCode: null, pgMessage: null, pgHint: undefined };
}

/** Paired return so `err(...mapPgErrorPair(e))` satisfies TS tuple unpacking. */
export function mapPgErrorPair(
  e: unknown,
): [RecordsErrorCode, string, unknown, string | undefined] {
  const mapped = mapPgError(e);
  return [mapped.code, mapped.message, mapped.detail, mapped.hint];
}
