import {
  getErrorSolution,
  isMicrophonePermissionDenial,
} from "./microphone-diagnostics";

describe("microphone permission error classification", () => {
  it.each(["NotAllowedError", "PermissionDeniedError"])(
    "treats %s as an expected permission denial",
    (name) => {
      // access-errors: ok — test fixture reproducing the browser's own getUserMedia denial message
      const error = Object.assign(new Error("Permission denied"), { name });

      expect(isMicrophonePermissionDenial(error)).toBe(true);
      expect(getErrorSolution(error)).toMatchObject({
        code: "PERMISSION_DENIED",
        message: "Microphone access was denied",
      });
    },
  );

  it.each(["NotFoundError", "NotReadableError", "SecurityError"])(
    "keeps %s outside the user-denial class",
    (name) => {
      expect(isMicrophonePermissionDenial({ name })).toBe(false);
    },
  );

  it("names WebKit's audio-session refusal as its own class, not an unknown error", () => {
    // The live 2026-09-17 /chat failure: the TTS unlock declared a "playback"
    // audio session and WebKit refused capture. It is neither a permission
    // denial nor a missing device.
    const error = Object.assign(
      new Error("AudioSession category is not compatible with audio capture."),
      { name: "InvalidStateError" },
    );

    expect(isMicrophonePermissionDenial(error)).toBe(false);
    expect(getErrorSolution(error)).toMatchObject({
      code: "AUDIO_SESSION_INCOMPATIBLE",
    });
    expect(getErrorSolution(error).solution).toMatch(/tap the microphone again/i);
  });

  it("is safe for non-error rejection values", () => {
    // access-errors: ok — test fixture reproducing the browser's own getUserMedia denial message
    expect(isMicrophonePermissionDenial("Permission denied")).toBe(false);
    expect(getErrorSolution(null)).toMatchObject({
      code: "UNKNOWN_ERROR",
    });
  });
});
