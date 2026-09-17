"use client";

/**
 * THE ONE DOOR a queued Google change is decided through.
 *
 * Every `google_workspace` proposal in this queue — the spreadsheet write, the
 * document append, the two "create a new file" kinds, the two imports — was
 * produced by ONE server module
 * (`aidream/services/google_workspace/approvals.py`) which stored, in the row's
 * own `metadata.google_workspace`, the exact action and arguments the approve
 * path re-runs. So the decision belongs on the server too:
 *
 *   POST /api/google-workspace/approvals/{id}/apply
 *   POST /api/google-workspace/approvals/{id}/reject
 *
 * 🚨 WHY NOT A CLIENT-SIDE WRITE. `sheet_write` used to approve by calling
 * `writeGoogleSheet` from the browser and then recording the decision as a
 * second, separate write. That is two executors for one proposal: the browser
 * could write the Sheet and then fail to record the decision (the row stays
 * "pending" over a change that already landed), two tabs could both approve and
 * write twice, and the five kinds below have no browser write path at all —
 * there is no client call that creates a Doc from a stored proposal. The server
 * door is atomic instead: it claims the row `pending → accepted` in ONE update,
 * re-runs the action through the tool's own handler, and stores the receipt. A
 * second approve writes to Google nothing and returns the first call's receipt
 * (`applied_now: false`).
 *
 * So these kinds never call `recordApprovalDecision` — the door already
 * recorded it, with evidence. Recording it again here would overwrite a real
 * receipt with a guess.
 *
 * Transport: `postGoogleBackend`, the one client this whole router family is
 * reached through (the same one `sendReviewedGmail` and `writeGoogleSheet`
 * use). It carries the Supabase JWT and the organization header, and the `/api`
 * prefix is stripped by aidream's `ApiPrefixCompatMiddleware` before matching.
 */

import { postGoogleBackend } from "@/features/marketing/google/service";
import type { GoogleApprovalDecisionPending } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The response, checked rather than cast. A shape we do not recognise is a
 * refusal with a remedy, never a silent success: the change may or may not have
 * landed, and saying "approved" over an unreadable answer is the screen lying.
 */
function decision(body: unknown): GoogleApprovalDecisionPending {
  if (!isRecord(body)) {
    throw new Error(
      "The approval service returned something this screen could not read, so it cannot say whether the change was made. Reload the queue to see where this proposal stands.",
    );
  }
  const {
    approval_id: approvalId,
    status,
    applied_now: appliedNow,
    sentence,
  } = body;
  if (
    typeof approvalId !== "string" ||
    typeof status !== "string" ||
    typeof appliedNow !== "boolean"
  ) {
    throw new Error(
      "The approval service answered in a shape this screen does not recognise, so it cannot say whether the change was made. Reload the queue to see where this proposal stands.",
    );
  }
  return {
    approval_id: approvalId,
    status,
    applied_now: appliedNow,
    receipt: isRecord(body.receipt) ? body.receipt : {},
    /**
     * 🚨 THE SERVER'S OWN SENTENCE, CARRIED THROUGH (round-3 verification
     * § A-N3). This narrowing used to stop at the three fields above, so the
     * one field aidream writes to prevent a screen inferring "what happened"
     * from a status enum was thrown away here — and the client's own inference
     * then disagreed with it about the same row. An absent or blank one is
     * `null`, never `""`: the adapter derives only when nothing was sent, and
     * an empty string is nothing sent.
     */
    sentence:
      typeof sentence === "string" && sentence.trim().length > 0
        ? sentence
        : null,
  };
}

/**
 * Approve one queued Google change and make it — exactly once.
 *
 * The approval id IS the idempotency key, on the server. Nothing is passed but
 * the id: the change itself is whatever the row already stored, so a browser
 * can never approve something other than what the reader was shown.
 */
export async function applyGoogleApproval(
  approvalId: string,
): Promise<GoogleApprovalDecisionPending> {
  const response = await postGoogleBackend(
    `/api/google-workspace/approvals/${encodeURIComponent(approvalId)}/apply`,
    {},
    "The approved change could not be made. Nothing was retried automatically.",
  );
  return decision(await response.json());
}

/** Turn one queued Google change down, with the reason kept on the record. */
export async function rejectGoogleApproval(
  approvalId: string,
  reason: string | null,
): Promise<GoogleApprovalDecisionPending> {
  const response = await postGoogleBackend(
    `/api/google-workspace/approvals/${encodeURIComponent(approvalId)}/reject`,
    reason ? { reason } : {},
    "This proposal could not be recorded as rejected, so it is still waiting on you.",
  );
  return decision(await response.json());
}
