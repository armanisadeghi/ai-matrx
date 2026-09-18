import { toast } from "@/lib/toast";
import type { TransferOutcome } from "@ai-matrx/kit/content-transfer";
import {
  announceProposedGoogleWrite,
  isProposedGoogleWrite,
  proposedGoogleWriteSentence,
} from "@/features/google-workspace/export/proposedWrite";

/** Host port for the authenticated Google Sheets destination. */
export async function sendRowsToSheetOutcome(
  rows: Array<Record<string, unknown>>,
  label: string,
): Promise<TransferOutcome> {
  if (!rows.length) {
    return {
      status: "error",
      code: "empty_sheet",
      message: "Nothing to send — this view is empty.",
      retryable: false,
    };
  }
  const { sendRowsToGoogleSheet } =
    await import("@/features/google-workspace/export/sendToGoogle");
  const result = await sendRowsToGoogleSheet(rows, label);
  if (result.ok) {
    const openUrl = result.openUrl;
    if (openUrl) toast.success(`Created "${result.name}" in Google Drive`, {action: {label: "Open", onClick: () => window.open(openUrl, "_blank", "noopener")}});
    return {
      status: "success",
      delivered: "action",
      mimeTypes: [],
      message: `Created "${result.name}" in Google Drive`,
    };
  }
  // NOTHING WAS WRITTEN and it is not a failure: the organization reviews this
  // kind of change first, so the server filed it in the approval queue and this
  // must not say "Created" (round-2 verification § A-vii).
  //
  // 🚨 IT MUST NOT SAY "FAILED" EITHER (F-99, Cursor Bugbot MEDIUM). This
  // returned `status: "error"`, code `google_sheet_proposed`, so the copy/export
  // host treated a successfully queued write as a failed send while the three
  // sibling call sites — which all now share `announceProposedGoogleWrite` —
  // treated the same reply as a normal, non-failing outcome.
  //
  // `TransferOutcome` (@ai-matrx/kit 0.15.5) has no member for "accepted for
  // review, nothing delivered yet": it is success | degraded | cancelled |
  // error. The honest member of the four is `success` + `delivered: "action"`,
  // which the kit already defines as "an explicit page action completed" and
  // NOT as a persisted destination write (see its own `TransferTarget` note:
  // "opening an editor is not a persisted save"). So: the action completed, the
  // receipt is the approval row — which really exists and really opens — and
  // every word a person reads says nothing is in Google yet. The first-class
  // state belongs IN the kit and is not invented here: adding it needs a kit
  // release plus a design-system release to teach `outcomeMessage` about it,
  // and this container has no npm credentials (F-99 hand-back).
  if (isProposedGoogleWrite(result)) {
    announceProposedGoogleWrite(result);
    return {
      status: "success",
      delivered: "action",
      mimeTypes: [],
      message: proposedGoogleWriteSentence(result),
      target: {
        kind: "approval",
        id: result.assistId,
        label: "Filed for approval",
        href: result.queueHref,
      },
    };
  }
  if (result.reason === "not_connected") toast.info("Connect Google Workspace to send this to a Sheet", {action: {label: "Connect", onClick: () => window.open(result.settingsHref, "_blank", "noopener")}});
  return result.reason === "not_connected"
    ? {
        status: "error",
        code: "google_not_connected",
        message: "Connect Google Workspace before sending this to a Sheet.",
        retryable: true,
      }
    : {
        status: "error",
        code: "google_sheet_failed",
        message: result.message,
        retryable: true,
      };
}
