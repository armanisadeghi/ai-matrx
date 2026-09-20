import type { CanonicalStorageImport } from "@/features/google-workspace/import/storageSourceImport";
import { canonicalImportToUploadedFile } from "./InlineUploadArea";

function importedFile(input: {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}): CanonicalStorageImport {
  return {
    fileId: input.id,
    filePath: `My Files/prompt-attachments/${input.name}`,
    checksum: `checksum-${input.id}`,
    versionNumber: 1,
    created: true,
    source: {
      provider: "google_drive",
      connection_id: "connection-1",
      source_ref: `provider-${input.id}`,
      revision: "7",
      modified_at: null,
    },
    file: {
      id: input.id,
      ownerId: "admin-user",
      organizationId: null,
      filePath: `My Files/prompt-attachments/${input.name}`,
      fileName: input.name,
      mimeType: input.mimeType,
      fileSize: input.size,
      checksum: `checksum-${input.id}`,
      visibility: "personal",
      currentVersion: 1,
      parentFolderId: "prompt-attachments-folder",
      metadata: {},
      createdAt: "2026-09-19T12:00:00Z",
      updatedAt: "2026-09-19T12:00:00Z",
      deletedAt: null,
      publicUrl: null,
      url: `https://server.example/files/${input.id}/download?inline=1`,
      cdnUrl: null,
      downloadUrl: null,
      thumbnailUrl: null,
      source: { kind: "real" },
      parentFileId: null,
      derivationKind: null,
      derivationMetadata: null,
      duplicateOfFileId: null,
      canonicalProcessedDocumentId: null,
    },
  };
}

describe("Google Drive canonical chat attachment", () => {
  it.each([
    {
      id: "pdf-file",
      name: "quarterly-report.pdf",
      mimeType: "application/pdf",
      size: 4401,
      type: "pdf",
    },
    {
      id: "sheet-file",
      name: "forecast.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 9182,
      type: "other",
    },
  ])(
    "uses the fetched name, MIME, size, URL, and file ID for $name",
    ({ id, name, mimeType, size, type }) => {
      const result = canonicalImportToUploadedFile(
        importedFile({ id, name, mimeType, size }),
      );

      expect(result).toMatchObject({
        name,
        fileId: id,
        url: `https://server.example/files/${id}/download?inline=1`,
        type,
        mime_type: mimeType,
        details: {
          filename: name,
          mimetype: mimeType,
          size,
          localId: id,
        },
      });
    },
  );
});
