/**
 * Feedback draft write — the PURE validator behind the `matrx-user/feedback`
 * surface's single write target (`feedback_draft`).
 *
 * Deliberately a pure module (no "use client", no React, no Redux):
 *
 *  - The surface manifest imports `FEEDBACK_DRAFT_FIELDS` to spell the
 *    contract out for the agent, and a manifest must stay importable without
 *    dragging the window's Redux / upload / toast graph along with it.
 *  - `FeedbackWindow`'s handler calls `parseFeedbackDraft` at the TOP of the
 *    handler — outside any `setState` updater — so a bad shape throws
 *    SYNCHRONOUSLY inside `applySurfaceWrite`, which is what turns it into the
 *    error envelope the agent reads. The same check inside a functional
 *    `setState` updater would throw during React's render instead, where the
 *    writeback seam cannot catch it and the agent learns nothing.
 *
 * The type vocabulary is `FEEDBACK_TYPES` from `@/types/feedback.types` — the
 * one runtime array `FeedbackType` is derived from. Never a re-typed literal.
 */

import { FEEDBACK_TYPES, type FeedbackType } from "@/types/feedback.types";

/**
 * Fields `feedback_draft` accepts. Anything else is refused BY NAME rather
 * than silently dropped — a key the agent thought it wrote is worse than a
 * refusal it can read.
 */
export const FEEDBACK_DRAFT_FIELDS = ["description", "feedback_type"] as const;
export type FeedbackDraftField = (typeof FEEDBACK_DRAFT_FIELDS)[number];

/** A validated partial patch — only the keys the caller actually sent. */
export interface FeedbackDraftPatch {
  /** Replacement body text for the description textarea. */
  description?: string;
  /** Replacement selection for the type chips. */
  feedbackType?: FeedbackType;
}

const FIELD_LIST = FEEDBACK_DRAFT_FIELDS.join(" | ");
const TYPE_LIST = FEEDBACK_TYPES.join(" | ");

/**
 * A description that arrived as a JSON-ENCODED string rather than plain text —
 * the classic double-encoding the inline-tool layer provokes. That layer
 * parses a JSON-looking argument before the handler ever sees it, so a model
 * that gets one shape refused often "fixes" it by encoding harder and ships a
 * body full of literal `\n` and `\"` sequences. Detecting it and saying so is
 * the difference between the agent correcting itself and it escalating.
 *
 * Narrow on purpose: a quoted-and-escaped wrapper, not merely text that
 * happens to contain a backslash.
 */
function looksJsonEncoded(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length > 1 &&
    trimmed.startsWith('"') &&
    trimmed.endsWith('"') &&
    /\\[n"]/.test(trimmed)
  );
}

/**
 * Validate an agent-supplied `feedback_draft` value and return the patch to
 * apply. THROWS on every bad shape — the writeback seam converts the throw
 * into a safe error envelope the agent reads and can act on, so the messages
 * here are written for a model, not a log file.
 */
export function parseFeedbackDraft(value: unknown): FeedbackDraftPatch {
  if (typeof value === "string")
    throw new Error(
      `feedback_draft expects an OBJECT, not a string. Send { ${FIELD_LIST} } as structured arguments — do not JSON-encode the object into a string.`,
    );

  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(
      `feedback_draft expects an object with at least one of: ${FIELD_LIST}.`,
    );

  const draft = value as Record<string, unknown>;
  const keys = Object.keys(draft);

  if (keys.length === 0)
    throw new Error(
      `feedback_draft needs at least one field to stage: ${FIELD_LIST}.`,
    );

  const unknownKeys = keys.filter(
    (key) => !(FEEDBACK_DRAFT_FIELDS as readonly string[]).includes(key),
  );
  if (unknownKeys.length > 0)
    throw new Error(
      `feedback_draft does not accept: ${unknownKeys.join(", ")}. Allowed fields: ${FIELD_LIST}. Attachments, the admin category/assignee, and submitting are not writable on this surface.`,
    );

  const patch: FeedbackDraftPatch = {};

  if ("description" in draft) {
    const raw = draft.description;
    if (typeof raw !== "string")
      throw new Error(
        "feedback_draft.description expects the report body as PLAIN TEXT — not JSON and not JSON-encoded. Send the prose itself, with real line breaks.",
      );
    if (!raw.trim())
      throw new Error(
        "feedback_draft.description cannot be empty — send the real report text, or omit the field to leave the user's description alone.",
      );
    if (looksJsonEncoded(raw))
      throw new Error(
        'feedback_draft.description arrived JSON-encoded (wrapped in quotes with escaped characters). Send it as PLAIN TEXT — not JSON and not JSON-encoded: real newlines, no surrounding quotes, no \\n or \\" escapes.',
      );
    patch.description = raw;
  }

  if ("feedback_type" in draft) {
    const raw = draft.feedback_type;
    if (typeof raw !== "string")
      throw new Error(
        `feedback_draft.feedback_type expects a plain string, one of: ${TYPE_LIST}.`,
      );
    if (!(FEEDBACK_TYPES as readonly string[]).includes(raw))
      throw new Error(
        `"${raw}" is not a feedback type. Use exactly one of: ${TYPE_LIST} (lower-case).`,
      );
    patch.feedbackType = raw as FeedbackType;
  }

  return patch;
}
