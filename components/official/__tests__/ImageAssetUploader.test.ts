import {
  buildPastedImageFileName,
  buildImageAssetViewerPayload,
  formatCloudUploadFailures,
} from "@/components/official/ImageAssetUploader";

describe("ImageAssetUploader", () => {
  it("builds a viewer payload from populated variants only", () => {
    const payload = buildImageAssetViewerPayload({
      variants: {
        image_url: "https://cdn.example.com/logo-512.png",
        og_image_url: null,
        thumbnail_url: "https://cdn.example.com/logo-200.png",
        tiny_url: "https://cdn.example.com/logo-64.png",
      },
      label: "Organization logo",
      preset: "logo",
    });

    expect(payload).toEqual({
      images: [
        "https://cdn.example.com/logo-512.png",
        "https://cdn.example.com/logo-200.png",
        "https://cdn.example.com/logo-64.png",
      ],
      alts: [
        "Organization logo 512x512",
        "Organization logo 200x200",
        "Organization logo 64x64",
      ],
      title: "Organization logo",
    });
  });

  it("formats cloud upload failures with filename and backend reason", () => {
    expect(
      formatCloudUploadFailures([
        { name: "hero.png", error: "File is too large" },
        { name: "logo.webp", error: "Unsupported content type" },
      ]),
    ).toBe(
      "hero.png: File is too large; logo.webp: Unsupported content type",
    );
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
