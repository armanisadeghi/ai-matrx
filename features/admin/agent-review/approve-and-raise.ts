/**
 * "Approve and raise" — the queue's answer to a false forced choice.
 *
 * Arman, 2026-09-16, on review row ca931876-f888-4675-8f30-80b7e1eacc23:
 *
 *   "this exposes a problem with this system where I have no way of closing
 *   this out but then starting a conversation about the problem I'm actually
 *   having here. So the only option is to not approve it, even though it's ok
 *   to approve now that I fixed it myself."
 *
 * The queue could Approve, or it could Request changes — so a row that was fine
 * to approve BUT exposed a separate problem had to be left un-approved, purely
 * to keep a thread alive. One action now does both: it approves the row through
 * the EXACT path Approve already uses (`recordHumanReviewAction`, which also
 * appends the note to the row's own conversation, so the history shows what was
 * raised), and files the same note as a new platform feedback item stamped
 * `metadata.raised_from_review_row`.
 *
 * THE TRANSACTIONAL STORY. Two systems, two writes, no distributed transaction
 * available: the approval lands in `agent.review_queue` + `communication`, the
 * item lands in `users.user_feedback`. So the outcome is never averaged into a
 * boolean. Approval runs FIRST (it is the state the human decided on) and the
 * result says exactly which halves happened:
 *
 *   - `approved_and_raised`   — both. The caller gets the item's id and door.
 *   - `approved_not_raised`   — the row IS approved, the note was NOT filed,
 *                               and `reason` says why. The caller must say so
 *                               and offer a retry, which re-runs ONLY the
 *                               filing (`alreadyApproved: true`) so a retry can
 *                               never approve twice or post the note twice.
 *   - `not_approved`          — nothing happened; no orphan feedback item is
 *                               ever filed for a row that did not approve.
 *
 * Never a silent half-success: every branch carries a sentence a person can act
 * on (`common-docs/policies/...` — nothing fails silently).
 */

import { submitFeedback } from "@/actions/feedback.actions";
import { feedbackHref } from "@/features/admin/feedback/doors";
import { reviewItemPath } from "@/features/admin/agent-review/doors";
import { recordHumanReviewAction } from "@/features/admin/agent-review/service";
import type { ReviewQueueRow } from "@/features/admin/agent-review/types";

/** The stamp that ties a raised item back to the row that exposed it. */
export const RAISED_FROM_REVIEW_ROW_KEY = "raised_from_review_row";

export type ApproveAndRaiseResult =
  | {
      status: "approved_and_raised";
      feedbackId: string;
      feedbackHref: string;
    }
  | { status: "approved_not_raised"; reason: string }
  | { status: "not_approved"; reason: string };

export type ApproveAndRaiseInput = {
  row: ReviewQueueRow;
  userId: string;
  /** What the human typed. It becomes the conversation note AND the item. */
  note: string;
  /**
   * Retry after `approved_not_raised`: the row is already approved and the note
   * is already in its conversation, so only the filing runs again.
   */
  alreadyApproved?: boolean;
};

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function approveAndRaise({
  row,
  userId,
  note,
  alreadyApproved = false,
}: ApproveAndRaiseInput): Promise<ApproveAndRaiseResult> {
  const trimmed = note.trim();
  if (!trimmed) {
    return {
      status: "not_approved",
      reason:
        "Write the note you want to raise. Approve on its own is the button for a review with nothing to raise.",
    };
  }

  if (!alreadyApproved) {
    try {
      await recordHumanReviewAction({
        row,
        userId,
        content: trimmed,
        status: "approved",
      });
    } catch (approvalError) {
      return {
        status: "not_approved",
        reason: messageOf(
          approvalError,
          "The review could not be approved, so the note was not raised either.",
        ),
      };
    }
  }

  let filed: Awaited<ReturnType<typeof submitFeedback>>;
  try {
    filed = await submitFeedback({
      feedback_type: "bug",
      route: reviewItemPath(row.id),
      description: trimmed,
      metadata: { [RAISED_FROM_REVIEW_ROW_KEY]: row.id },
    });
  } catch (filingError) {
    return {
      status: "approved_not_raised",
      reason: messageOf(filingError, "Filing the feedback item failed."),
    };
  }

  if (!filed.success || !filed.data) {
    return {
      status: "approved_not_raised",
      reason: filed.error || "Filing the feedback item failed.",
    };
  }

  return {
    status: "approved_and_raised",
    feedbackId: filed.data.id,
    feedbackHref: feedbackHref(filed.data.id),
  };
}
