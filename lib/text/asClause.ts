/**
 * A message used INSIDE a sentence the render finishes itself:
 *
 *   The list could not be read: {asClause(error)}. Dropping a file still works.
 *
 * Messages usually end in their own full stop ("…try again."), so writing
 * `{error}. ` after one shows "try again.. Dropping" (RC-B12 round 9). This
 * drops the value's closing punctuation and whitespace; the sentence around it
 * supplies the stop. Anything that is not a string is rendered as its text.
 * Guarded: components/errors/__tests__/error-renders-carry-alchemy.test.ts
 * ("a message value is never followed by its own full stop") and the lint rule
 * matrx/error-render-carries-alchemy.
 */
export function asClause(value: unknown): string {
  if (value == null) return "";
  const text = typeof value === "string" ? value : String(value);
  return text.replace(/[\s.!?…。]+$/u, "");
}
