/**
 * Pure validation for the `matrx-user/documents` write targets.
 *
 * Deliberately OUTSIDE the React updater. `applySurfaceWrite`
 * (`features/surfaces/runtime/surface-writeback.ts`) turns a THROW from a
 * handler into the error envelope the agent reads back. Validating inside a
 * `setState` updater would instead throw during React's render/commit — after
 * the seam has already reported success — so the agent would be told its bad
 * value landed. Validate here, synchronously, before touching any state.
 *
 * `DOCUMENT_NAME_MAX_LENGTH` is the single source of truth for the limit: it is
 * enforced here, interpolated into the manifest target description, AND set as
 * the `maxLength` of the header rename field on `/documents/[id]` — so the
 * contract the agent reads, the rule the handler enforces, and the limit the
 * human's own control applies cannot drift apart. The last of those matters
 * for a non-obvious reason: the blur commit swallows service failures, so
 * before the field was bounded a pasted 300-character title came back as a
 * `varchar(255)` 400 and reverted with nothing on screen to explain it.
 */

/**
 * `workbench.udt_documents.document_name` is `varchar(255) NOT NULL` — a
 * longer value is rejected by Postgres, not merely by taste. Verified against
 * `information_schema.columns` on 2026-08-11.
 */
export const DOCUMENT_NAME_MAX_LENGTH = 255;

/**
 * `workbench.udt_documents.description` is unbounded `text`, so this is a
 * product bound rather than a database one: it matches the 2000 the sibling
 * `workbook_description` target enforces, keeping the two mirrored services
 * mirrored in behaviour too. The library renders this as a two-line blurb —
 * anything near the cap is already past what a reader sees.
 */
export const DOCUMENT_DESCRIPTION_MAX_LENGTH = 2000;

/** How a rejected value is described back to the agent, without dumping it. */
function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

/**
 * Validate an agent-supplied document title and return the exact string to
 * persist. Throws (never coerces) so the agent hears about its own mistake.
 *
 * The `typeof` guard is load-bearing: the inline-tool layer PARSES a
 * JSON-looking argument before the handler ever sees it, so a caller that
 * sends `{"document_name":"..."}` or `"\"Quoted\""` arrives here as an object,
 * not text. The message names the fix explicitly, because an agent that only
 * hears "invalid" tends to retry by double-encoding — which lands escaped
 * quotes and `\n` in the user's title box.
 */
export function validateDocumentName(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      `document_name must be plain text, not JSON and not JSON-encoded — received ${describeValue(
        value,
      )}. Send only the title itself (for example: Q3 Revenue Review) with no surrounding braces, brackets, quotes or escape sequences.`,
    );
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error(
      "document_name cannot be empty or whitespace — a document must keep a title. Send the title text you want, or leave the current one alone.",
    );
  }

  if (/[\r\n]/.test(trimmed)) {
    throw new Error(
      "document_name must be a SINGLE line — it renders in the page header, and line breaks are not a title. Send one line of plain text (this is a title, not the document body).",
    );
  }

  if (trimmed.length > DOCUMENT_NAME_MAX_LENGTH) {
    throw new Error(
      `document_name must be ${DOCUMENT_NAME_MAX_LENGTH} characters or fewer (received ${trimmed.length}). Shorten it to a title; the document body is not stored in this field.`,
    );
  }

  return trimmed;
}

/**
 * Validate an agent-supplied document description and return the value to
 * persist — `null` for a deliberate clear, so the caller never has to decide
 * whether "" means "empty string" or "no description".
 *
 * Unlike the title this MAY span lines (it is a blurb, not a header), but it
 * carries the same not-JSON guard for the same reason: the inline-tool layer
 * parses a JSON-looking argument before the handler sees it.
 */
export function validateDocumentDescription(value: unknown): string | null {
  if (typeof value !== "string") {
    throw new Error(
      `document_description must be plain text, not JSON and not JSON-encoded — received ${describeValue(
        value,
      )}. Send only the description prose itself, with no surrounding braces, brackets, quotes or escape sequences.`,
    );
  }

  const trimmed = value.trim();

  // An empty string is the documented way to CLEAR the description, so it is
  // valid input rather than a bad shape — normalize it to null for the column.
  if (trimmed.length === 0) return null;

  if (trimmed.length > DOCUMENT_DESCRIPTION_MAX_LENGTH) {
    throw new Error(
      `document_description must be ${DOCUMENT_DESCRIPTION_MAX_LENGTH} characters or fewer (received ${trimmed.length}). This is the short blurb shown in the documents library, not the document body.`,
    );
  }

  return trimmed;
}
