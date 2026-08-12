/**
 * Validation core for the `matrx-user/marketing-authority` write targets.
 *
 * Kept as pure functions OUTSIDE the React component on purpose: the surface
 * writeback seam (`applySurfaceWrite`) wraps `await handler(value)` in a
 * try/catch and turns a throw into the error envelope the agent reads. A throw
 * raised inside a React state updater would land asynchronously and never
 * reach that catch, so every check runs here and the component only wires them
 * up. Same reasoning as `features/administration/lib/sql-editor-write-targets`
 * and the `applications` notice core.
 *
 * THE ONE VOCABULARY: `AUTHORITY_GUIDANCE_MAX_CHARS` is imported by the
 * Textarea's `maxLength`, interpolated into the manifest's model-facing
 * description, and enforced here — so the limit the agent is told, the limit
 * the handler enforces, and the limit the control imposes cannot drift.
 */

/** Max characters of the "Optional priority" guidance note. */
export const AUTHORITY_GUIDANCE_MAX_CHARS = 4000;

/**
 * Validate a guidance value for `authority_guidance`.
 *
 * Returns the string to stage. The empty string is ALLOWED and means "clear
 * the note" — guidance is optional by design, so clearing it is a real
 * intention rather than a malformed write.
 */
export function validateAuthorityGuidance(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      `authority_guidance must be a string containing the priority note to stage, got ${
        value === null ? "null" : typeof value
      }.`,
    );
  }
  if (value.length > AUTHORITY_GUIDANCE_MAX_CHARS) {
    throw new Error(
      `authority_guidance is ${value.length} characters; the maximum is ${AUTHORITY_GUIDANCE_MAX_CHARS}.`,
    );
  }
  return value;
}
