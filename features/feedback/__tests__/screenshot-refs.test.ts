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
        image_urls: ["https://legacy.example/screenshot.png", fileId],
      }),
    ).toEqual([fileId, "https://legacy.example/screenshot.png"]);
  });

  it("opens IDs through the canonical file viewer and leaves legacy URLs intact", () => {
    expect(feedbackScreenshotHref(fileId)).toBe(`/files/f/${fileId}`);
    expect(feedbackScreenshotHref("https://legacy.example/screenshot.png")).toBe(
      "https://legacy.example/screenshot.png",
    );
  });
});
