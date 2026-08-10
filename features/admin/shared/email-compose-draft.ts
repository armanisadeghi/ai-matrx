/**
 * The compose-draft contract for the Email Users admin surface
 * (`matrx-admin/email`) — ONE module owning the vocabulary, the bounds, and
 * the validation for the surface's single write target, `email_draft`.
 *
 * Why it is pure and lives outside the page component:
 *  - the manifest interpolates these constants into the target's model-facing
 *    description AND the page handler calls `parseEmailDraftPatch`, so the
 *    contract an agent reads is literally the contract that is enforced —
 *    they cannot drift the way two hand-written copies do;
 *  - the writeback seam (`features/surfaces/runtime/surface-writeback.ts`)
 *    turns a THROW into the safe error envelope the agent reads and corrects
 *    from. Validation therefore has to throw SYNCHRONOUSLY, before any React
 *    state updater runs — keeping it out of the component guarantees that.
 *
 * This module governs the DRAFT only. It never sends: `POST /api/admin/email`
 * is reached exclusively by the admin pressing "Send Email".
 */

/** The keys `email_draft` accepts, in the order the compose form shows them. */
export const EMAIL_DRAFT_KEYS = ["subject", "message_body"] as const;

export type EmailDraftKey = (typeof EMAIL_DRAFT_KEYS)[number];

/**
 * Sanity ceiling on a staged subject line. Not a platform limit — neither the
 * `<input>` nor `POST /api/admin/email` caps length — but a subject this long
 * is already broken for every mail client that truncates it, and the cap stops
 * a runaway model from stuffing an entire draft into the header field.
 */
export const EMAIL_SUBJECT_MAX_CHARS = 200;

/**
 * Sanity ceiling on a staged message body, same reasoning as the subject cap:
 * generous enough that no real announcement hits it, small enough that a
 * runaway generation cannot fill the admin's textarea with megabytes.
 */
export const EMAIL_BODY_MAX_CHARS = 25_000;

/** A validated partial patch — at least one key present, both optional. */
export interface EmailDraftPatch {
  subject?: string;
  message_body?: string;
}

function describeReceived(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

/**
 * Validate an `email_draft` payload and return the patch to apply.
 *
 * THROWS (never coerces) on any bad shape — a wrong value is the agent's
 * error to hear about, and the seam hands the message straight back to it.
 *
 * The per-field messages deliberately say "plain text, not JSON and not
 * JSON-encoded": the inline-tool layer PARSES a JSON-looking argument before
 * a handler ever sees it, so an agent told only "expected a string" tends to
 * "fix" the refusal by double-encoding — which lands escaped newlines and
 * stray quotes in the admin's compose box.
 */
export function parseEmailDraftPatch(value: unknown): EmailDraftPatch {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(
      `email_draft expects an object with at least one of { ${EMAIL_DRAFT_KEYS.join(", ")} }; received ${describeReceived(value)}. Send the fields you want to change as an object — a bare string is not enough, because the target carries two fields.`,
    );

  const patch = value as Record<string, unknown>;

  const unsupported = Object.keys(patch).filter(
    (key) => !(EMAIL_DRAFT_KEYS as readonly string[]).includes(key),
  );
  if (unsupported.length > 0)
    throw new Error(
      `email_draft got unsupported key(s): ${unsupported.join(", ")}. Accepted keys: ${EMAIL_DRAFT_KEYS.join(" | ")}. Recipients, the From address, and sending are NOT writable on this surface.`,
    );

  if (Object.keys(patch).length === 0)
    throw new Error(
      `email_draft needs at least one of: ${EMAIL_DRAFT_KEYS.join(" | ")}.`,
    );

  const result: EmailDraftPatch = {};

  if ("subject" in patch) {
    const subject = patch.subject;
    if (typeof subject !== "string")
      throw new Error(
        `email_draft.subject expects a plain-text string, not JSON and not JSON-encoded; received ${describeReceived(subject)}.`,
      );
    if (!subject.trim())
      throw new Error(
        "email_draft.subject expects a non-empty subject line. To leave the subject exactly as the admin has it, omit the key instead of sending an empty string.",
      );
    // A subject is ONE header line. The compose form's `<input type="text">`
    // makes a line break impossible to type, so a CR/LF here can only come
    // from an agent — and a newline in a subject is header-injection shaped.
    if (/[\r\n]/.test(subject))
      throw new Error(
        "email_draft.subject must be a single line — it is an email header, and line breaks are not allowed in one. Put the extra sentence in message_body instead.",
      );
    if (subject.length > EMAIL_SUBJECT_MAX_CHARS)
      throw new Error(
        `email_draft.subject is ${subject.length} characters; the maximum is ${EMAIL_SUBJECT_MAX_CHARS}.`,
      );
    result.subject = subject;
  }

  if ("message_body" in patch) {
    const body = patch.message_body;
    if (typeof body !== "string")
      throw new Error(
        `email_draft.message_body expects a plain-text string, not JSON and not JSON-encoded; received ${describeReceived(body)}. Real newline characters are fine and are preserved as written.`,
      );
    if (!body.trim())
      throw new Error(
        "email_draft.message_body expects a non-empty message. To leave the body exactly as the admin has it, omit the key instead of sending an empty string.",
      );
    if (body.length > EMAIL_BODY_MAX_CHARS)
      throw new Error(
        `email_draft.message_body is ${body.length} characters; the maximum is ${EMAIL_BODY_MAX_CHARS}.`,
      );
    result.message_body = body;
  }

  return result;
}
