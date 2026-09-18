/**
 * THE ONE WAY A SURFACE SAYS "filed for approval, nothing was written".
 *
 * `sendToGoogle` answers `reason: "proposed"` when the organization's autonomy
 * mode for this capability says a person reviews the change first: the server
 * filed it in the ONE approval queue and answered 202 WITHOUT writing anything
 * to Google. Four surfaces reach that branch — the message-options menu, the
 * content-action registry, the markdown-table Send button and the Alchemy
 * copy/export menus — and each had hand-written its own toast, its own
 * description and its own door. Four copies of one sentence drift: the Alchemy
 * one had already drifted into reporting the filing as a FAILED send
 * (`status: "error"`, code `google_sheet_proposed` — Cursor Bugbot MEDIUM,
 * F-99). This module owns the words and the door so they cannot diverge again.
 *
 * 🚨 A QUEUED WRITE IS NEITHER A DELIVERY NOR A FAILURE. Saying "Created" would
 * claim a file that does not exist; saying it failed tells the user their work
 * was lost when it is sitting in a queue with their name on it. Both are lies,
 * in opposite directions.
 */

import { toast } from "@/lib/toast";

import type { SendToGoogleResult } from "./sendToGoogle";

/** The `202, a person reviews this first` branch of the ONE Google path. */
export type ProposedGoogleWrite = Extract<SendToGoogleResult, { reason: "proposed" }>;

/** The half of the truth the server's own message never states. */
export const NOTHING_CHANGED_YET = "Nothing in Google has changed yet.";

/** The door: the queue row this filing created, which does exist and opens. */
export const OPEN_APPROVAL_LABEL = "Open the approval";

export function isProposedGoogleWrite(
  result: SendToGoogleResult,
): result is ProposedGoogleWrite {
  return !result.ok && result.reason === "proposed";
}

/** The whole truth in one sentence, for hosts that show a line rather than a toast. */
export function proposedGoogleWriteSentence(result: ProposedGoogleWrite): string {
  return `${result.message} ${NOTHING_CHANGED_YET}`;
}

/** The toast every surface shows: what happened, what did not, and the door. */
export function announceProposedGoogleWrite(result: ProposedGoogleWrite): void {
  toast.info(result.message, {
    description: NOTHING_CHANGED_YET,
    action: {
      label: OPEN_APPROVAL_LABEL,
      onClick: () => window.open(result.queueHref, "_blank", "noopener"),
    },
  });
}
