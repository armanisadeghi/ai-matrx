import {
  feedbackScreenshotHref,
  getFeedbackScreenshotRefs,
} from "../screenshot-refs";

describe("feedback screenshot references", () => {
  const fileId = "17fe7ade-cc27-4f77-bea0-ca782fd1190d";

  it("keeps canonical file IDs first and preserves unique historical URLs", () => {
    expect(
      getFeedbackScreenshotRefs({
        image_file_ids: [fileId],
        image_urls: ["https://cdn-legacy.aimatrx.com/screenshot.png", fileId],
      }),
    ).toEqual([fileId, "https://cdn-legacy.aimatrx.com/screenshot.png"]);
  });

  it("opens IDs through the canonical file viewer and leaves legacy URLs intact", () => {
    expect(feedbackScreenshotHref(fileId)).toBe(`/files/f/${fileId}`);
    expect(feedbackScreenshotHref("https://cdn-legacy.aimatrx.com/screenshot.png")).toBe(
      "https://cdn-legacy.aimatrx.com/screenshot.png",
    );
  });
});
