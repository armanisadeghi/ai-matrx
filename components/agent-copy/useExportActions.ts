import { toast } from "@/lib/toast";
import type { TransferOutcome } from "@ai-matrx/kit/content-transfer";

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
