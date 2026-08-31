import type { CloudFile } from "@/features/files/types";
import { fromCloudFile } from "./normalize";

describe("fromCloudFile", () => {
  it("retains the logical path needed for version writes resolved by file id", () => {
    const cloudFile = {
      id: "generated-file-id",
      ownerId: "owner-id",
      filePath: "Images/Generated/run/generated.png",
      fileName: "generated.png",
      mimeType: "image/png",
      fileSize: 3,
      checksum: "checksum",
      visibility: "personal",
      currentVersion: 1,
      parentFolderId: null,
      metadata: {},
      createdAt: "2026-08-31T00:00:00Z",
      updatedAt: "2026-08-31T00:00:00Z",
      deletedAt: null,
      publicUrl: null,
      url: null,
      cdnUrl: null,
      downloadUrl: null,
      thumbnailUrl: null,
      source: { kind: "real" },
    } satisfies CloudFile;

    const normalized = fromCloudFile(cloudFile, {
      kind: "file_id",
      fileId: cloudFile.id,
    });

    expect(normalized.filePath).toBe(cloudFile.filePath);
  });
});
