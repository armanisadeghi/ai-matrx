/**
 * THE REVIEW WINDOW — `hitl.google.review_timeout_hours`, read the way the
 * server reads it.
 *
 * 🚨 UNTIL 2026-09-17 NOTHING IN `features/approvals/` READ THIS KNOB. aidream
 * evaluates it LAZILY at both approval doors — an expired proposal cannot be
 * applied (403 carrying the whole expiry sentence) and can still be rejected, by
 * design — so an admin's window was real, and the queue showed a proposal past it
 * with a live Approve button and no mark. The screen did not lie; it just could
 * not say so until after the click (round-3 hostile verification, common-docs
 * `/projects/google-native/VERIFY-U-P4-U-M1-R3.md` § A-N7).
 *
 * So the row is pre-marked here, and three things are deliberate:
 *
 * 1. **THE SERVER REMAINS THE AUTHORITY.** This marking removes a control whose
 *    refusal is already known; it never grants one, never applies anything and
 *    never reports a decision. The 403 is still what stops a write, which is why
 *    a stale clock in a browser cannot let an expired change through.
 * 2. **THE SAME BOUNDARY, EXCLUSIVE:** `age > hours`. Exactly 24.000000h is
 *    still actionable and one instant later is not — no window in which the two
 *    halves of the platform disagree (`is_expired` in
 *    `aidream/services/google_workspace/approvals.py`).
 * 3. **THE SAME SAFE DIRECTION, LOUDLY:** 0, negative, unparseable, unregistered
 *    or unreadable means NEVER EXPIRES — a proposal nobody can apply is worse
 *    than one that waited too long, and the person can still reject it either
 *    way. Every such answer says so in the console, because an admin who set a
 *    value nobody can read must be able to find out why nothing expires.
 *
 * The sentence is the SERVER'S, to the character: one rule, one wording, however
 * a person meets it (the same law as `./receipt.ts` § the server's sentence).
 */

import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";

/** The knob, by the same full key the settings surface edits. */
export const REVIEW_TIMEOUT_KNOB = "hitl.google.review_timeout_hours";

/**
 * The window in hours, or `null` for "nothing expires". Mirrors the server's
 * `float(raw)` — a numeric string is a number — and its `hours if hours > 0`.
 */
export function readReviewWindowHours(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const hours =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(hours)) {
    console.warn(
      `[approvals] ${REVIEW_TIMEOUT_KNOB} holds ${JSON.stringify(value)}, which is not a ` +
        "number of hours, so no queued Google proposal will be treated as expired until it " +
        "is fixed. Set it to a positive number of hours in the organization's settings.",
    );
    return null;
  }
  if (hours <= 0) {
    console.warn(
      `[approvals] ${REVIEW_TIMEOUT_KNOB} resolves to ${hours}, so queued Google proposals ` +
        "never expire (that is the knob's own way of saying 'no window'). Set a positive " +
        "number of hours to give one.",
    );
    return null;
  }
  return hours;
}

/**
 * The window for this organization and person, resolved through the ONE runtime
 * read (`platform.knob_resolve`), or `null` for "nothing expires".
 *
 * A read that fails is answered `null` WITH the reason: the queue must stay
 * usable when a setting is unreadable, and the failure must not be silent.
 */
export async function reviewWindowHours(
  organizationId: string | null | undefined,
  userId: string | null | undefined,
): Promise<number | null> {
  // The server answers None without an organization; there is no window to read.
  if (!organizationId) return null;
  try {
    return readReviewWindowHours(
      await ensureEffectiveKnob(organizationId, userId ?? null, REVIEW_TIMEOUT_KNOB),
    );
  } catch (error) {
    console.warn(
      `[approvals] could not read ${REVIEW_TIMEOUT_KNOB} for organization ${organizationId} — ` +
        "queued Google proposals are treated as never expiring, which leaves them decidable. " +
        `${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/** Has this pending proposal outlived the window? `age > hours`, exclusive. */
export function isExpiredProposal(
  /** The row's own clock — `assists.created_at`, as the server reads it. */
  createdAt: string | null | undefined,
  hours: number | null,
  now: Date = new Date(),
): boolean {
  if (!hours) return false;
  const created = createdAt ? new Date(createdAt) : null;
  if (!created || Number.isNaN(created.getTime())) {
    console.warn(
      "[approvals] a queued proposal carries no readable created_at, so the review window " +
        "could not be applied to it — it stays decidable, and the server's own doors remain " +
        "the authority on whether it is too old.",
    );
    return false;
  }
  const age = (now.getTime() - created.getTime()) / 3_600_000;
  return age > hours;
}

/**
 * What a person is told about a proposal that waited too long — `expiry_sentence`
 * in `aidream/services/google_workspace/approvals.py`, verbatim, because one rule
 * must not have two wordings.
 */
export function expirySentence(hours: number): string {
  // Python's `{:g}`: significant digits, no trailing zeros.
  const printed = Number(hours.toPrecision(6)).toString();
  return (
    `This change was proposed more than ${printed} hours ago, which is how long this ` +
    "organization gives a Google change to be reviewed, so it can no longer be " +
    "applied — what it was going to write may not match the file any more. Reject it " +
    "and ask for the change again."
  );
}
