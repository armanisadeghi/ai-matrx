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

  it("is safe for non-error rejection values", () => {
    // access-errors: ok — test fixture reproducing the browser's own getUserMedia denial message
    expect(isMicrophonePermissionDenial("Permission denied")).toBe(false);
    expect(getErrorSolution(null)).toMatchObject({
      code: "UNKNOWN_ERROR",
    });
  });
});
