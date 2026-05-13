import {
  buildPastedImageFileName,
  buildImageAssetViewerPayload,
} from "@/components/official/ImageAssetUploader";

describe("ImageAssetUploader", () => {
  it("builds a viewer payload from populated legacy variants only", () => {
    // Legacy four-key shape — the back-compat surface every existing
    // caller still consumes. Drops the og_url slot (null) and includes
    // every populated entry.
    const payload = buildImageAssetViewerPayload({
      variants: {
        image_url: "https://cdn.example.com/logo-primary.png",
        og_image_url: null,
        thumbnail_url: "https://cdn.example.com/logo-thumb.png",
        tiny_url: "https://cdn.example.com/logo-tiny.png",
      },
      label: "Organization logo",
      preset: "logo",
    });

    expect(payload).not.toBeNull();
    expect(payload?.images).toEqual([
      "https://cdn.example.com/logo-primary.png",
      "https://cdn.example.com/logo-thumb.png",
      "https://cdn.example.com/logo-tiny.png",
    ]);
    expect(payload?.title).toBe("Organization logo");
    // Alts are derived from the canonical variant-key dimension labels.
    // We assert only the first prefix to stay decoupled from exact
    // dimension strings — the label table is treated as UX, not contract.
    expect(payload?.alts?.length).toBe(3);
    expect(payload?.alts?.[0]).toContain("Organization logo");
  });

  it("returns null when no variants are populated", () => {
    expect(
      buildImageAssetViewerPayload({
        variants: {
          image_url: null,
          og_image_url: null,
          thumbnail_url: null,
          tiny_url: null,
        },
        label: "Empty",
        preset: "raw",
      }),
    ).toBeNull();
  });

  it("builds stable pasted image filenames from mime types", () => {
    expect(buildPastedImageFileName("image/png", 1710000000000)).toBe(
      "pasted-1710000000000.png",
    );
    expect(buildPastedImageFileName("image/jpeg", 1710000000000)).toBe(
      "pasted-1710000000000.jpg",
    );
    expect(buildPastedImageFileName("", 1710000000000)).toBe(
      "pasted-1710000000000.png",
    );
  });
});
