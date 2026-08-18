import { shouldPersistTranscriptionError } from "../transcriptionErrorPolicy";

describe("shouldPersistTranscriptionError", () => {
  it.each(["Load failed", "Failed to fetch", "Network request failed"])(
    "keeps recoverable chunk transport failure local: %s",
    (errorMessage) => {
      expect(
        shouldPersistTranscriptionError({
          errorCode: "CHUNK_FAILED",
          errorMessage,
        }),
      ).toBe(false);
    },
  );

  it("persists actionable chunk failures", () => {
    expect(
      shouldPersistTranscriptionError({
        errorCode: "CHUNK_FAILED",
        errorMessage: "Provider rejected the audio format",
      }),
    ).toBe(true);
  });

  it("persists a final fallback failure even when the transport died", () => {
    expect(
      shouldPersistTranscriptionError({
        errorCode: "FALLBACK_FAILED",
        errorMessage: "Load failed",
      }),
    ).toBe(true);
  });
});
