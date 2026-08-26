import { isMessagePart } from "@/types/python-generated/stream-events";
import type { UnifiedImageBlock } from "../../types";
import { toCxMediaPart } from "../to-cx-media-part";

describe("toCxMediaPart", () => {
  it("keeps transient base64 out of the generated top-level message shape", () => {
    const block: UnifiedImageBlock = {
      kind: "image",
      origin: "matrx",
      status: "complete",
      progress: null,
      errorMessage: null,
      mimeType: "image/jpeg",
      fileName: "cover.jpg",
      sizeBytes: 935_359,
      base64: "cHJldmlldy1ieXRlcw==",
      metadata: { provider: "google" },
      fileId: "9a1c4285-6c12-4996-81ef-25d2c7687246",
      visibility: "personal",
      cdnUrl: "https://example.test/cover.jpg",
      downloadUrl: null,
      parentFileId: null,
      derivationKind: null,
      width: 1024,
      height: 1024,
      visionClass: null,
    };

    const part = toCxMediaPart(block);

    expect(part).toMatchObject({
      type: "media",
      kind: "image",
      origin: "matrx",
      file_id: block.fileId,
      url: "https://example.test/cover.jpg",
      mime_type: "image/jpeg",
      size_bytes: 935_359,
      width: 1024,
      height: 1024,
      metadata: {
        provider: "google",
        base64_data: "cHJldmlldy1ieXRlcw==",
      },
    });
    expect(part).not.toHaveProperty("base64_data");
    expect(isMessagePart(part)).toBe(true);
  });

  it("projects a base64-only external preview through a schema-valid data URL", () => {
    const block: UnifiedImageBlock = {
      kind: "image",
      origin: "external",
      status: "complete",
      progress: null,
      errorMessage: null,
      mimeType: "image/png",
      fileName: null,
      sizeBytes: null,
      base64: "aW1hZ2U=",
      metadata: null,
      externalUrl: "",
      sourceLabel: null,
      width: null,
      height: null,
      visionClass: null,
    };

    const part = toCxMediaPart(block);

    expect(part.url).toBe("data:image/png;base64,aW1hZ2U=");
    expect(part).not.toHaveProperty("base64_data");
    expect(isMessagePart(part)).toBe(true);
  });
});
