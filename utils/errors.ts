/**
 * utils/errors.ts — the two halves of an error's audience.
 *
 * `extractErrorMessage` is for LOGS and the Error Inspector: every scrap of
 * PostgREST detail, because we are the reader.
 *
 * `operationFailed` is for HUMANS: one plain sentence naming the action that
 * failed, with the raw error preserved as `cause` (devtools + the global
 * Supabase capture in `lib/diagnostics/supabaseErrorCapture.ts` already keep
 * the detail). Handing `error.message` straight to a user is the defect
 * `pnpm check:access-errors` counts — RLS codes, schema names, and PostgREST
 * prose are not sentences a person can act on.
 *
 * It deliberately does NOT say "please try again": a denial and a timeout are
 * indistinguishable here, and a retry that cannot succeed is the exact lie
 * `features/access-gate/` exists to kill. When the failure is a single-record
 * READ, don't use this at all — render `<AccessGate token id error/>`, which
 * asks the platform which of the four things actually happened.
 */

/**
 * A user-facing Error for a failed action. `action` completes the sentence
 * "We couldn't …" in the user's words — "join this class", not "call
 * edu_class_join".
 */
export function operationFailed(action: string, cause?: unknown): Error {
  return new Error(`We couldn't ${action}.`, cause ? { cause } : undefined);
}

/**
 * Safe string extraction for caught values (Supabase PostgrestError, axios, etc.).
 * Avoids `String(err)` on plain objects, which yields "[object Object]".
 *
 * For Supabase PostgrestError the returned string includes message, details,
 * hint, and error code so logs are immediately actionable.
 */
export function extractErrorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof e.message === "string" && e.message) parts.push(e.message);
    if (typeof e.details === "string" && e.details) parts.push(e.details);
    if (typeof e.hint === "string" && e.hint) parts.push(`Hint: ${e.hint}`);
    if (typeof e.code === "string" && e.code) parts.push(`Code: ${e.code}`);
    if (parts.length > 0) return parts.join(" · ");
    try {
      const s = JSON.stringify(err);
      if (s && s !== "{}") return s;
    } catch {
      /* ignore */
    }
  }
  return "An unexpected error occurred";
}
