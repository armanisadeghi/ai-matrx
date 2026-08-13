import { validateFeedbackScreenshotFileIds } from "@/lib/services/agent-feedback.service";

describe("agent feedback screenshot contract", () => {
  test("accepts and deduplicates canonical file IDs", () => {
    const fileId = "4cd24752-2e65-4c31-92ee-7f12f2cb6d41";
    expect(validateFeedbackScreenshotFileIds([fileId, fileId])).toEqual([
      fileId,
    ]);
  });

  test.each(["file:///tmp/screenshot.png", "not-a-file-id"])(
    "rejects non-ID screenshot reference %s",
    (value) => {
      expect(() => validateFeedbackScreenshotFileIds([value])).toThrow(
        /file ID/,
      );
    },
  );
});
