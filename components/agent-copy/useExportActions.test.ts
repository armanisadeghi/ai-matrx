/**
 * 🚨 F-99 (Cursor Bugbot MEDIUM) — A QUEUED EXPORT IS NOT A FAILED EXPORT.
 *
 * When the organization reviews Google writes first, `sendRowsToGoogleSheet`
 * answers `reason: "proposed"`: the server filed the change in the ONE approval
 * queue and wrote NOTHING to Google. `sendRowsToSheetOutcome` handed that back
 * as `status: "error"`, code `google_sheet_proposed`, so the copy/export host
 * (`AiCopyMenu`, `CopyButtons`, `ExportMenu`) reported a successful filing as a
 * failed send — while the three sibling call sites treated the same reply as a
 * normal outcome. This asserts the contract at the seam, both directions:
 *
 *  - a queued filing is never returned as a failure, and never says "Created";
 *  - the person is told what happened, what did NOT happen, and given the door
 *    to the queue row — through the ONE shared announcement the other three
 *    call sites use, never a fourth copy of the sentence;
 *  - a real failure and a missing connection still ARE errors (this is not a
 *    blanket "nothing is ever an error" regression).
 */

import type { TransferOutcome } from "@ai-matrx/kit/content-transfer";

import { sendRowsToSheetOutcome } from "./useExportActions";
import { NOTHING_CHANGED_YET, OPEN_APPROVAL_LABEL } from "@/features/google-workspace/export/proposedWrite";

const sendRowsToGoogleSheet = jest.fn();
jest.mock("@/features/google-workspace/export/sendToGoogle", () => ({
  sendRowsToGoogleSheet: (...args: unknown[]) => sendRowsToGoogleSheet(...args),
}));

const toastInfo = jest.fn();
const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const PROPOSED = {
  ok: false as const,
  reason: "proposed" as const,
  assistId: "assist-77",
  mode: "ask",
  queueHref: "/administration/approvals/assist-77",
  message: "Sent for approval.",
};

describe("sendRowsToSheetOutcome — the approval-queue reply (F-99)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("never reports a queued filing as a failure, and never says Created", async () => {
    sendRowsToGoogleSheet.mockResolvedValue(PROPOSED);

    const outcome: TransferOutcome = await sendRowsToSheetOutcome(
      [{ name: "Acme" }],
      "Pipeline",
    );

    // kit 0.16.0: the first-class state, neither a delivery nor a failure.
    expect(outcome.status).toBe("queued");
    expect(JSON.stringify(outcome)).not.toContain("Created");
    // The remedy is the half the server's sentence never states.
    expect("remedy" in outcome ? outcome.remedy : "").toContain(NOTHING_CHANGED_YET);
    // And the receipt is the queue row that really exists — never a Google file.
    expect("target" in outcome ? outcome.target?.href : undefined).toBe(
      PROPOSED.queueHref,
    );
  });

  it("tells the person through the ONE shared announcement, with the door", async () => {
    sendRowsToGoogleSheet.mockResolvedValue(PROPOSED);

    await sendRowsToSheetOutcome([{ name: "Acme" }], "Pipeline");

    expect(toastError).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastInfo).toHaveBeenCalledWith(
      PROPOSED.message,
      expect.objectContaining({
        description: NOTHING_CHANGED_YET,
        action: expect.objectContaining({ label: OPEN_APPROVAL_LABEL }),
      }),
    );
  });

  it("still calls a real refusal a failure", async () => {
    sendRowsToGoogleSheet.mockResolvedValue({
      ok: false,
      reason: "failed",
      message: "Google refused the request.",
    });

    const outcome = await sendRowsToSheetOutcome([{ name: "Acme" }], "Pipeline");

    expect(outcome).toMatchObject({
      status: "error",
      code: "google_sheet_failed",
      retryable: true,
    });
  });

  it("still calls a missing connection a retryable error", async () => {
    sendRowsToGoogleSheet.mockResolvedValue({
      ok: false,
      reason: "not_connected",
      settingsHref: "/settings/google",
    });

    const outcome = await sendRowsToSheetOutcome([{ name: "Acme" }], "Pipeline");

    expect(outcome).toMatchObject({ status: "error", code: "google_not_connected" });
  });

  it("a written Sheet is still a success that names the file", async () => {
    sendRowsToGoogleSheet.mockResolvedValue({
      ok: true,
      name: "Pipeline",
      fileId: "1Sheet",
      openUrl: "https://docs.google.com/spreadsheets/d/1Sheet",
    });

    const outcome = await sendRowsToSheetOutcome([{ name: "Acme" }], "Pipeline");

    expect(outcome).toMatchObject({ status: "success", delivered: "action" });
    expect("message" in outcome ? outcome.message : "").toContain("Created");
  });
});
