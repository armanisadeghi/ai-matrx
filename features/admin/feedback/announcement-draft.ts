/**
 * The announcement-draft contract for the Feedback & Announcements admin
 * surface (`matrx-admin/feedback`) — ONE module owning the vocabulary, the
 * bounds, and the validation for the surface's `announcement_draft` write
 * target.
 *
 * Why it is pure and lives outside the dialog components:
 *  - the manifest interpolates these constants into the target's model-facing
 *    description AND the console's handler calls `parseAnnouncementDraftPatch`,
 *    so the contract an agent reads is literally the contract that is enforced
 *    — they cannot drift the way two hand-written copies do;
 *  - there are TWO announcement editors (create and edit) that must validate
 *    identically, so the rules cannot live in either one of them;
 *  - the writeback seam (`features/surfaces/runtime/surface-writeback.ts`)
 *    turns a THROW into the safe error envelope the agent reads and corrects
 *    from. Validation therefore has to throw SYNCHRONOUSLY, before any React
 *    state updater runs — keeping it out of the component guarantees that, and
 *    is what lets the console validate the WHOLE payload before it opens a
 *    dialog (a rejected write must not leave a stray empty form on screen).
 *
 * This module governs the DRAFT only. It never publishes: `createAnnouncement`
 * and `updateAnnouncement` are reached exclusively by the admin pressing
 * "Create Announcement" / "Save Changes".
 */

import { ANNOUNCEMENT_TYPES, type AnnouncementType } from "@/types/feedback.types";

/** The keys `announcement_draft` accepts, in the order the form shows them. */
export const ANNOUNCEMENT_DRAFT_KEYS = [
  "title",
  "message",
  "announcement_type",
] as const;

export type AnnouncementDraftKey = (typeof ANNOUNCEMENT_DRAFT_KEYS)[number];

/**
 * Sanity ceiling on a staged title. Not a platform limit — neither the
 * `<input>` nor `createAnnouncement` caps length — but the user-facing
 * announcement card renders the title as a single `<h2>`, so a title this long
 * is already broken layout, and the cap stops a runaway model from stuffing an
 * entire announcement into the heading.
 */
export const ANNOUNCEMENT_TITLE_MAX_CHARS = 200;

/**
 * Sanity ceiling on a staged message, same reasoning as the title cap:
 * generous enough that no real announcement hits it, small enough that a
 * runaway generation cannot fill the admin's textarea with megabytes.
 */
export const ANNOUNCEMENT_MESSAGE_MAX_CHARS = 10_000;

/** A validated partial patch — at least one key present, all optional. */
export interface AnnouncementDraftPatch {
  title?: string;
  message?: string;
  announcement_type?: AnnouncementType;
}

function describeReceived(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

/**
 * Validate an `announcement_draft` payload and return the patch to apply.
 *
 * THROWS (never coerces) on any bad shape — a wrong value is the agent's error
 * to hear about, and the seam hands the message straight back to it.
 *
 * The per-field messages deliberately say "plain text, not JSON and not
 * JSON-encoded": the inline-tool layer PARSES a JSON-looking argument before a
 * handler ever sees it, so an agent told only "expected a string" tends to
 * "fix" the refusal by double-encoding — which lands escaped newlines and
 * stray quotes in the admin's form.
 */
export function parseAnnouncementDraftPatch(
  value: unknown,
): AnnouncementDraftPatch {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(
      `announcement_draft expects an object with at least one of { ${ANNOUNCEMENT_DRAFT_KEYS.join(", ")} }; received ${describeReceived(value)}. Send the fields you want to change as an object — a bare string is not enough, because the target carries three fields.`,
    );

  const patch = value as Record<string, unknown>;

  const unsupported = Object.keys(patch).filter(
    (key) => !(ANNOUNCEMENT_DRAFT_KEYS as readonly string[]).includes(key),
  );
  if (unsupported.length > 0)
    throw new Error(
      `announcement_draft got unsupported key(s): ${unsupported.join(", ")}. Accepted keys: ${ANNOUNCEMENT_DRAFT_KEYS.join(" | ")}. Whether an announcement is ACTIVE (shown to users), how long users are forced to read it, publishing it, and deleting it are NOT writable on this surface.`,
    );

  if (Object.keys(patch).length === 0)
    throw new Error(
      `announcement_draft needs at least one of: ${ANNOUNCEMENT_DRAFT_KEYS.join(" | ")}.`,
    );

  const result: AnnouncementDraftPatch = {};

  if ("title" in patch) {
    const title = patch.title;
    if (typeof title !== "string")
      throw new Error(
        `announcement_draft.title expects a plain-text string, not JSON and not JSON-encoded; received ${describeReceived(title)}.`,
      );
    if (!title.trim())
      throw new Error(
        "announcement_draft.title expects a non-empty title. To leave the title exactly as the admin has it, omit the key instead of sending an empty string.",
      );
    // The title is ONE heading. The form's `<input type="text">` makes a line
    // break impossible to type, so a CR/LF here can only come from an agent,
    // and the user-facing card renders it as a single `<h2>`.
    if (/[\r\n]/.test(title))
      throw new Error(
        "announcement_draft.title must be a single line — it renders as one heading on the announcement card. Put the extra sentence in message instead.",
      );
    if (title.length > ANNOUNCEMENT_TITLE_MAX_CHARS)
      throw new Error(
        `announcement_draft.title is ${title.length} characters; the maximum is ${ANNOUNCEMENT_TITLE_MAX_CHARS}.`,
      );
    result.title = title;
  }

  if ("message" in patch) {
    const message = patch.message;
    if (typeof message !== "string")
      throw new Error(
        `announcement_draft.message expects a plain-text string, not JSON and not JSON-encoded; received ${describeReceived(message)}. Real newline characters are fine and are preserved as written.`,
      );
    if (!message.trim())
      throw new Error(
        "announcement_draft.message expects a non-empty message. To leave the message exactly as the admin has it, omit the key instead of sending an empty string.",
      );
    if (message.length > ANNOUNCEMENT_MESSAGE_MAX_CHARS)
      throw new Error(
        `announcement_draft.message is ${message.length} characters; the maximum is ${ANNOUNCEMENT_MESSAGE_MAX_CHARS}.`,
      );
    result.message = message;
  }

  if ("announcement_type" in patch) {
    const type = patch.announcement_type;
    // Validated against the SAME constant the <Select> renders — a type
    // outside it is rejected, never coerced to "info".
    if (
      typeof type !== "string" ||
      !(ANNOUNCEMENT_TYPES as readonly string[]).includes(type)
    )
      throw new Error(
        `announcement_draft.announcement_type must be exactly one of ${ANNOUNCEMENT_TYPES.join(" | ")}; received ${typeof type === "string" ? `"${type}"` : describeReceived(type)}.`,
      );
    result.announcement_type = type as AnnouncementType;
  }

  return result;
}
