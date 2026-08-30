import {
  fileInfoAgentPayload,
  fileInfoHumanSummary,
  type FileInfoSnapshot,
} from "@/features/files/utils/file-info-format";
import {
  DROPPED_SIGNED_URL,
  DROPPED_STORAGE_PATH,
} from "@/lib/media/agent-payload";

const SIGNED_URL =
  "https://example.s3.amazonaws.com/file?X-Amz-Credential=test&X-Amz-Signature=secret&X-Amz-Expires=3600";
const RAW_PATH = "owner/raw/storage/document.pdf";

const snapshot: FileInfoSnapshot = {
  file: {
    id: "f1",
    ownerId: "u1",
    filePath: RAW_PATH,
    fileName: "document.pdf",
    mimeType: "application/pdf",
    fileSize: 42,
    checksum: null,
    visibility: "personal",
    currentVersion: 1,
    parentFolderId: null,
    metadata: { signedUrl: SIGNED_URL },
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    deletedAt: null,
    publicUrl: SIGNED_URL,
    url: SIGNED_URL,
    cdnUrl: SIGNED_URL,
    downloadUrl: SIGNED_URL,
    thumbnailUrl: null,
    source: { kind: "real" },
  },
  typeDisplayName: "PDF document",
  parentFolderPath: "owner/raw/storage",
  versionCount: 1,
  activeShareLinks: [],
  ragState: { status: "absent" },
};

describe("file info copy payloads", () => {
  it("keeps the human summary unchanged", () => {
    expect(fileInfoHumanSummary(snapshot)).toContain(RAW_PATH);
  });

  it("leads with file_ref and removes expiring URLs and raw storage paths", () => {
    const payload = fileInfoAgentPayload(snapshot);

    expect(payload.startsWith("<file_ref>\n")).toBe(true);
    expect(payload).toContain("<file_id>f1</file_id>");
    expect(payload).toContain("<durable_url>null</durable_url>");
    expect(payload).toContain(DROPPED_SIGNED_URL);
    expect(payload).toContain(DROPPED_STORAGE_PATH);
    expect(payload).not.toContain(SIGNED_URL);
    expect(payload).not.toContain(RAW_PATH);
  });
});
