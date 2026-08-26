// lib/supabase/authRetry.ts
//
// One primitive for the class of failure where a browser operation reached
// PostgREST with NO user JWT even though the app believes a user is signed in
// (the supabase-js session was momentarily unavailable — refresh in flight,
// storage read mid-rewrite, cookie chunk swap). The request then executes as
// `anon`, and every RPC that resolves an owner answers with an authorization
// error that has nothing to do with the user's actual permissions.
//
// This fired for real (2026-08-15): artifact materialization on an agent-app
// run page lost a react artifact, and the browser console blamed
// "cannot create another user's personal organization" — an organization the
// caller was never creating. The DB edge now answers honestly
// (`28000 not authenticated`, see migrations/canvas_write_rpcs_resolve_actor_from_auth.sql);
// this is the client half that makes a momentary blip recoverable instead of
// losing the write.
//
// Deliberately NOT a general retry-on-error wrapper: it retries EXACTLY ONE
// cause (no authenticated session) EXACTLY ONCE, after asking supabase-js to
// re-resolve the session. Anything else — RLS denials, constraint violations,
// network errors — is returned untouched, because retrying those is how a
// client turns one failure into a storm.

import { supabase } from "@/utils/supabase/client";

/** The shape every supabase-js call returns, narrowed to what we inspect. */
export interface AuthRetryableResult<T> {
  data: T;
  error: { code?: string | null; message?: string | null } | null;
  status?: number;
}

class SessionUnavailableError extends Error {
  readonly code = "PGRST301";

  constructor() {
    super("Your session expired");
    this.name = "SessionUnavailableError";
  }
}

/**
 * True when the DB refused because the request carried no authenticated user.
 * `28000` is the SQLSTATE the canvas write RPCs raise; the message tests cover
 * RPCs that raise the same condition without setting ERRCODE, plus PostgREST's
 * own response when an anonymous request reaches an authenticated-only RPC.
 */
export function isMissingSessionError(
  error: { code?: string | null; message?: string | null } | null | undefined,
  status?: number,
): boolean {
  if (!error) return false;
  if (error.code === "28000") return true;
  const message = error.message?.toLowerCase();
  if (message?.startsWith("not authenticated")) return true;
  return (
    status === 401 &&
    error.code === "42501" &&
    message?.startsWith("permission denied for function ") === true
  );
}

/**
 * Run a supabase call; if it fails purely because no session reached the
 * server, re-resolve the session and run it ONCE more.
 *
 * The operation must be idempotent — reads are safe, and write callers use an
 * upsert keyed on a natural key, so the retry can only land the same row.
 *
 * Returns the second attempt's result when a retry happened, else the first.
 * `retried` / `sessionRecovered` are reported so callers can log the truth
 * instead of a generic "failed to persist".
 */
export async function runWithSessionRetry<T>(
  // PromiseLike, not Promise: a supabase-js query builder is a thenable, so
  // callers can hand the builder straight back without an extra await.
  run: () => PromiseLike<AuthRetryableResult<T>>,
): Promise<
  AuthRetryableResult<T> & { retried: boolean; sessionRecovered: boolean }
> {
  // Stop before PostgREST when the browser already knows the session is gone.
  // AuthSessionWatcher clears Redux authority as soon as its event arrives, but
  // a query can race that React effect. Executing during the gap creates a
  // guaranteed anonymous 401 and turns ordinary session expiry into a product
  // error. This cookie read is local/refresh-aware and is the final guard at
  // the database boundary.
  const { data: initialSession, error: initialSessionError } =
    await supabase.auth.getSession();
  if (!initialSession.session?.access_token || initialSessionError) {
    throw new SessionUnavailableError();
  }

  const first = await run();
  if (!isMissingSessionError(first.error, first.status)) {
    return { ...first, retried: false, sessionRecovered: false };
  }

  // getSession() re-reads the persisted session and refreshes it when expired —
  // the cheapest way to ask supabase-js "do we actually have a user right now?"
  const { data, error: sessionError } = await supabase.auth.getSession();
  const recovered = Boolean(data.session?.access_token) && !sessionError;
  if (!recovered) {
    console.error(
      "[authRetry] an operation reached the database with no authenticated session and the session could NOT be recovered — the user is signed out or their session expired. The operation was not retried.",
      sessionError ?? first.error,
    );
    return { ...first, retried: false, sessionRecovered: false };
  }

  console.error(
    "[authRetry] an operation reached the database with no authenticated session; the session re-resolved and the operation is being retried once. This is a recovery firing, which means a real session-availability bug got past the proactive layer.",
  );
  const second = await run();
  return { ...second, retried: true, sessionRecovered: true };
}
