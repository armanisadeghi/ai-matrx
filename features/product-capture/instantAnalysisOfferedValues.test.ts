/**
 * Provision `product_capture.instant_item` wave 4: a resale shop photographs a
 * used Makita drill (QR-tagged SKU) with one walk-around video.
 */
import { instantAnalysisOfferedValues } from "./instantAnalysisOfferedValues";

const item = {
  code: "SKU-44817",
  codeSource: "qr" as const,
  folderPath: "Product Capture/2026-09-28/SKU-44817",
  status: "captured" as const,
  createdAt: "2026-09-28T16:04:11.000Z",
};

describe("instantAnalysisOfferedValues", () => {
  it("offers the item's real facts with native types", () => {
    expect(
      instantAnalysisOfferedValues(item, [
        { kind: "photo", video: null },
        { kind: "photo", video: null },
        { kind: "photo", video: null },
        { kind: "video", video: { mime: "video/mp4", durationMs: 14250 } },
      ]),
    ).toEqual({
      product_code: "SKU-44817",
      code_source: "qr",
      photo_count: 3,
      has_video: true,
      has_audio: false,
      video_duration_ms: 14250,
      folder_path: "Product Capture/2026-09-28/SKU-44817",
      item_status: "captured",
      captured_at: "2026-09-28T16:04:11.000Z",
    });
  });

  it("omits an unassigned code and a video duration it cannot state exactly", () => {
    const values = instantAnalysisOfferedValues({ ...item, code: null, codeSource: null }, [
      { kind: "photo", video: null },
      { kind: "video", video: null },
      { kind: "audio", video: null },
    ]);
    expect("product_code" in values).toBe(false);
    expect("code_source" in values).toBe(false);
    expect("video_duration_ms" in values).toBe(false);
    expect(values.has_video).toBe(true);
    expect(values.has_audio).toBe(true);
  });
});
