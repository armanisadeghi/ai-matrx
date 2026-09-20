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
 * 🚨 CORRECTED 2026-09-17 (round-2 verification § A-2): the sentence named
 * EMAIL DRAFTS FIRST, and the producer excludes Gmail ON PURPOSE — "the Gmail
 * review card IS the authorization and never enters this path"
 * (`aidream/services/google_workspace/approvals.py`). The one thing the screen
 * promised first could never appear. It now names exactly the six kinds the
 * producer files, and nothing else: a change to a Doc or a Sheet the person
 * already has, a new one in their Drive, or importing a Google contact or task
 * into their records.
 *
 * WHEN ANOTHER PRODUCER SHIPS: that lane rewrites `APPROVALS_EMPTY_BODY` to
 * name what now files proposals, in the same commit that makes it true. The
 * guard is `__tests__/one-predicate.test.ts`, which fails if this sentence
 * promises email again.
 */

export const APPROVALS_EMPTY_TITLE = "Nothing is waiting on you";

export const APPROVALS_EMPTY_BODY =
  "No proposals yet. When an agent proposes a change to one of your Google Docs or Sheets, a new one in your Drive, or importing a Google contact or task into your records, it waits here until you decide.";

/**
 * What the empty state says when a deep link points at a row that IS waiting,
 * just not in this list — a site-scoped keyword item (Bugbot round 9 #9). The
 * card must not claim nothing is waiting while the person is holding a link to
 * something that is.
 */
export const APPROVALS_EMPTY_TITLE_ELSEWHERE =
  "Nothing in this list is waiting on you";
