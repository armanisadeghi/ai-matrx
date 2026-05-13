/**
 * Converts any thrown value from a Supabase/PostgREST call into a proper Error
 * with a descriptive message. PostgREST errors are plain objects with `message`,
 * `code`, `details`, and `hint` — they are NOT `instanceof Error`, which causes
 * generic catch blocks to lose the real reason.
 */
export function pgErrorToError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof e.message === "string" && e.message) parts.push(e.message);
    if (typeof e.details === "string" && e.details)
      parts.push(`Details: ${e.details}`);
    if (typeof e.hint === "string" && e.hint) parts.push(`Hint: ${e.hint}`);
    if (typeof e.code === "string" && e.code) parts.push(`(code: ${e.code})`);
    if (parts.length > 0) return new Error(parts.join(" — "));
  }
  return new Error(String(err));
}
