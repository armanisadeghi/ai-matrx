/**
 * explainError — turn a raw platform/DB refusal into a short human sentence.
 *
 * THE LIVE SHAPE THIS CLOSES: admin tables and dialogs dumped the full
 * Postgres/provenance text into a cell or a truncated footer. The reader
 * could not tell what happened, and the wrapping made the words unreadable.
 *
 * A known class gets a title + a plain-English summary. Everything else
 * keeps a short title and the original text as the detail. Callers never
 * invent a second mapping.
 */

export interface ExplainedError {
  title: string;
  summary: string | null;
  detail: string;
}

const ACTOR_SYSTEM =
  /actor_system|actor_tier|x-matrx-actor-system|official_system|app\.actor_system/i;
const PERMISSION = /permission denied|42501|row-level security|rls/i;
const NOTHING_UPDATED = /no references were updated/i;

export function explainError(raw: string): ExplainedError {
  const detail = raw.trim();
  if (ACTOR_SYSTEM.test(detail)) {
    return {
      title: "Couldn't save this change",
      summary:
        "The platform blocked the write because it didn't record who made it. That's a bug on our side, not something you did. Copy the detail below if you need to report it.",
      detail,
    };
  }
  if (PERMISSION.test(detail)) {
    return {
      title: "You don't have permission for this",
      summary:
        "The database refused the write. If you should be able to do this, copy the detail below.",
      detail,
    };
  }
  if (NOTHING_UPDATED.test(detail)) {
    return {
      title: "Nothing was replaced",
      summary: "No matching references were found to update.",
      detail,
    };
  }
  return {
    title: "This didn't work",
    summary: null,
    detail,
  };
}

/** Compact label for a failed row action when the full error opens elsewhere. */
export const SHORT_FAILURE_LABEL = "Couldn't replace";
