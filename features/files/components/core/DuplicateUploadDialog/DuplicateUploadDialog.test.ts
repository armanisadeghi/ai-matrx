import { isInlineMediaMimeType } from "./DuplicateUploadDialog";

describe("DuplicateUploadDialog preview policy", () => {
  it.each(["text/plain", "application/pdf", "application/json", null])(
    "does not mount a browser media element for %s",
    (mimeType) => {
      expect(isInlineMediaMimeType(mimeType)).toBe(false);
    },
  );

  it.each(["image/png", "video/mp4", "audio/mpeg"])(
    "keeps inline preview support for %s",
    (mimeType) => {
      expect(isInlineMediaMimeType(mimeType)).toBe(true);
    },
  );
});
