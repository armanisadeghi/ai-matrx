import { toCaptureFile } from "./service";

describe("product-capture video link rehydration", () => {
  it("restores the exact normalized MIME and duration", () => {
    expect(
      toCaptureFile({
        id: "link-video",
        item_id: "item-video",
        file_id: "file-video",
        kind: "video",
        metadata: {
          video: {
            mime: "video/webm;codecs=vp8,opus",
            duration_ms: 1_235,
          },
        },
        created_at: "2026-09-01T00:00:00.000Z",
      }),
    ).toEqual({
      id: "link-video",
      itemId: "item-video",
      fileId: "file-video",
      kind: "video",
      video: {
        mime: "video/webm;codecs=vp8,opus",
        durationMs: 1_235,
      },
      createdAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("rejects malformed persisted facts and tolerates legacy absent facts", () => {
    expect(() =>
      toCaptureFile({
        id: "link-bad",
        item_id: "item-video",
        file_id: "file-video",
        kind: "video",
        metadata: { video: { mime: "video/webm", duration_ms: 0 } },
        created_at: "2026-09-01T00:00:00.000Z",
      }),
    ).toThrow(/positive integer duration_ms/i);

    expect(
      toCaptureFile({
        id: "link-legacy",
        item_id: "item-video",
        file_id: "file-video",
        kind: "video",
        metadata: {},
        created_at: "2026-09-01T00:00:00.000Z",
      }).video,
    ).toBeNull();
  });
});
