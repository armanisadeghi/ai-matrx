import { prepareHostCapturedVideo } from "./useCameraCaptureHost";

describe("prepareHostCapturedVideo", () => {
  it("preserves the recorder's final MIME authority and normalized duration", () => {
    const captured = prepareHostCapturedVideo(
      {
        blob: new Blob(["video"], { type: "video/mp4" }),
        mime: "video/webm;codecs=vp8,opus",
        durationMs: 1_234.6,
      },
      "product",
    );

    expect(captured.mime).toBe("video/webm;codecs=vp8,opus");
    expect(captured.file.type).toBe("video/webm;codecs=vp8,opus");
    expect(captured.file.name).toMatch(/^product-video-\d+\.webm$/);
    expect(captured.durationMs).toBe(1_235);
  });
});
