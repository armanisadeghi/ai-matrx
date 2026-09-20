import { toast } from "@/lib/toast";
import type { TransferOutcome } from "@ai-matrx/kit/content-transfer";
import {
  NOTHING_CHANGED_YET,
  announceProposedGoogleWrite,
  isProposedGoogleWrite,
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
  // kind of change first, so the server filed it in the approval queue. It
  // must not say "Created" (round-2 verification § A-vii) and it must not say
  // "failed" either (F-99): until kit 0.16.0 this rode `success` +
  // `delivered: "action"` because `TransferOutcome` had no member for
  // "accepted for review, nothing delivered yet". The kit now states it —
  // `queued` carries the sentence AND the remedy, and its `target` is the
  // pending request itself (which exists and opens), never the destination
  // record, which does not exist yet. `@ai-matrx/design-system` 0.21.13+
  // renders the state (sentence + remedy + the receipt door).
  if (isProposedGoogleWrite(result)) {
    announceProposedGoogleWrite(result);
    return {
      status: "queued",
      message: result.message,
      remedy: `${NOTHING_CHANGED_YET} Open the approval to see it.`,
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
