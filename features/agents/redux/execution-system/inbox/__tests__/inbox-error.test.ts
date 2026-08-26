import { classifyInboxEnqueueFailure } from "../inbox-error";

describe("classifyInboxEnqueueFailure", () => {
  it("treats a missing conversation as recoverable stale client state", () => {
    expect(
      classifyInboxEnqueueFailure({
        status: 404,
        message: "The requested resource was not found.",
      }),
    ).toEqual({
      message:
        "This conversation is no longer available. Open a current conversation and try again.",
      reportAsSystemError: false,
      toastSeverity: "info",
    });
  });

  it("keeps unexpected enqueue failures reportable", () => {
    expect(
      classifyInboxEnqueueFailure({ status: 503, message: "Unavailable" }),
    ).toEqual({
      message: "Unavailable",
      reportAsSystemError: true,
      toastSeverity: "error",
    });
  });
});
