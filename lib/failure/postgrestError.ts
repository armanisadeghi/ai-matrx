// lib/failure/postgrestError.ts
//
// A PostgREST / RPC error object → an Error a screen may print, with the
// engine's facts kept ON the error (code, details, hint, cause) for the error
// display and the Error Inspector — never glued into the sentence.
//
// Sixteen list services each carried a private copy of
//   `${error.message}${error.code ? ` (${error.code})` : ""}`
// so a timed-out read reached the screen as "canceling statement due to
// statement timeout (57014)" — Postgres talking to a DBA (the study-kit
// builder's "Use existing" list, 2026-10-03). This is the one translation:
// the engine's own refusals (timeout, busy, conflict, dropped connection) are
// rewritten through `describeFailure`; a sentence our own functions raised
// passes through word for word.

import { databaseRefusal, describeFailure } from "./transport";

export interface PostgrestishError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** The Error to throw for a failed PostgREST call. */
export function postgrestError(
  error: PostgrestishError,
  options: { action: string; fallback: string },
): Error & { code?: string; details?: string; hint?: string } {
  const message = error.message?.trim() ?? "";
  const sentence = databaseRefusal(error)
    ? describeFailure(error, { action: options.action }).sentence
    : message || options.fallback;
  const out = new Error(sentence, { cause: error }) as Error & {
    code?: string;
    details?: string;
    hint?: string;
  };
  if (error.code) out.code = error.code;
  if (error.details) out.details = error.details;
  if (error.hint) out.hint = error.hint;
  return out;
}
