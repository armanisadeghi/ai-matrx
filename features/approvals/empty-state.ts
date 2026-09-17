/**
 * THE EMPTY-STATE SENTENCE — in ONE place, so the lane that ships the first
 * producer flips it here and nowhere else.
 *
 * 🚨 IT PROMISES ONLY WHAT EXISTS. Until 2026-09-17 the screen read "When an
 * agent drafts an email, proposes a change to one of your spreadsheets, or
 * suggests anything else that needs a person, it appears here" — and a
 * zero-authorship verification (common-docs
 * `/projects/google-native/VERIFY-U-P4-U-M1.md` § A-2) found nothing on the
 * platform can produce a queue item: `proposeApproval` has no callers, aidream
 * emits no `approval_proposal`, and `platform.assists` holds zero rows on
 * `matrx-user/approval-queue`. A screen is absent or honest, so the one
 * sentence a person reads here now says what is true.
 *
 * WHEN THE FIRST PRODUCER SHIPS: that lane rewrites `APPROVALS_EMPTY_BODY` to
 * name what now files proposals, in the same commit that makes it true.
 */

export const APPROVALS_EMPTY_TITLE = "Nothing is waiting on you";

export const APPROVALS_EMPTY_BODY =
  "No proposals yet. Agents will file email drafts and spreadsheet changes here once those assists are switched on for your organization.";
