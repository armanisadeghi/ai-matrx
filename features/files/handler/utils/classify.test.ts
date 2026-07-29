import { classify } from "./classify";

describe("file handler classification", () => {
  it("uses a definitive MIME when an opaque share URL has no useful filename", () => {
    expect(
      classify({
        fileName: "b7c881801367458db8e6a2d6804d6462",
        mime: "image/jpeg",
      }),
    ).toEqual(
      expect.objectContaining({
        mime: "image/jpeg",
        category: "IMAGE",
        previewKind: "image",
        thumbnailStrategy: "image",
      }),
    );
  });

  it("prefers MIME over a misleading filename extension", () => {
    expect(
      classify({
        fileName: "recording.webm",
        mime: "audio/webm",
      }),
    ).toEqual(
      expect.objectContaining({
        mime: "audio/webm",
        category: "AUDIO",
        previewKind: "audio",
      }),
    );
  });
});
