import { resolveTranscriptionFinalization } from "../transcriptionFinalization";

describe("resolveTranscriptionFinalization", () => {
  it("completes a clean chunk transcription", () => {
    expect(
      resolveTranscriptionFinalization({
        partialText: "  complete text  ",
        hadChunkFailures: false,
        fallbackResult: null,
      }),
    ).toEqual({
      result: { success: true, text: "complete text" },
      safetyStatus: "complete",
      finalText: "complete text",
    });
  });

  it("uses a successful full-recording fallback, including a valid silent result", () => {
    expect(
      resolveTranscriptionFinalization({
        partialText: "partial",
        hadChunkFailures: true,
        fallbackResult: { success: true, text: "" },
      }),
    ).toEqual({
      result: { success: true, text: "" },
      safetyStatus: "complete",
      finalText: "",
    });
  });

  it("keeps audio recoverable and returns failure when both transcription lanes fail", () => {
    expect(
      resolveTranscriptionFinalization({
        partialText: "partial words",
        hadChunkFailures: true,
        fallbackResult: {
          success: false,
          text: "",
          error: "Failed to fetch",
        },
      }),
    ).toEqual({
      result: {
        success: false,
        text: "partial words",
        error: "Failed to fetch",
      },
      safetyStatus: "failed",
      finalText: "partial words",
    });
  });
});
