// features/scopes/service/rpcResult.ts
//
// Shared result helpers for the scopes-module service chokepoints.
//
// `scopesService.ts` grew its own private copies of `ok`/`err`/`mapPgError`/
// `mapPgErrorPair`; this file extracts them and exports them so every sibling
// chokepoint — `scopesService.ts`, `associationsService.ts`, and
// `features/comments/service/commentsService.ts` — consumes ONE
// implementation. The private copies are gone; this file is the only one.
//
// Every method that returns a `ScopesRpcResult` builds it through `ok`/`err`
// here and NEVER throws to its caller.
//
// 🚨 A POSTGREST ERROR IS NOT AN `Error`. supabase-js resolves a failed
// request with a PLAIN OBJECT (`{ code, message, details, hint }`) parsed
// straight from the response body — `PostgrestError` is only ever *thrown*,
// and only when `shouldThrowOnError` is set, which we never set. So an
// `e instanceof Error ? e.message : <generic>` ternary discards the real
// message on EVERY genuine database failure and reports the generic string
// instead. That is exactly what happened on the CRM record page (2026-08-14):
// a real `57014 canceling statement due to statement timeout` reached the UI
// as `{code: "internal", message: "Unexpected error talking to Supabase"}`,
// which reads like a gateway fault and sent debugging after a PostgREST
// outage that was never happening. Read the fields off the OBJECT, not off
// `Error`, and keep the Postgres/PostgREST code in `detail` so the next
// failure is attributable instead of anonymous.

import { isTransportFailure } from "@/lib/net/errors";

import type { ScopesRpcError, ScopesRpcResult } from "@/features/scopes/types";

// Re-exported for convenience so a service file imports its envelope and its
// builders from one place.
export type { ScopesRpcError, ScopesRpcResult } from "@/features/scopes/types";

export function err(
  code: ScopesRpcError["code"],
  message: string,
  detail?: unknown,
  hint?: string,
): { ok: false; error: ScopesRpcError } {
  return { ok: false, error: { code, message, detail, hint } };
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
  //
  // EXCEPT a transport failure. A browser that is asleep, offline, or mid-wifi
  // handoff rejects fetch with `TypeError: Failed to fetch` — no code, no hint,
  // nothing lossy to preserve, and nothing an engineer can act on. Filing those
  // as errors buried the real ones under connectivity noise (2026-08-11), so
  // they log as warnings; every genuine Postgres/PostgREST failure stays loud.
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
    return { code: "forbidden_org", message: "Permission denied" };
  // The session's JWT is gone or expired — the user is signed out, not broken.
  if (pgCode === "PGRST301" || pgCode === "PGRST303")
    // access-errors: ok — PGRST301/303 is PostgREST's own expired-JWT verdict, verified by code, not a guess
    return { code: "unauthorized", message: "Your session expired" };
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
): [ScopesRpcError["code"], string, unknown, string | undefined] {
  const mapped = mapPgError(e);
  return [mapped.code, mapped.message, mapped.detail, mapped.hint];
}
