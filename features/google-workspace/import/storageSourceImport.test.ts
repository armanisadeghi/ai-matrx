import { apiPost } from "@/lib/api/typed-client";
import { getFile } from "@/features/files/api/files";
import type { FileRecordApi } from "@/features/files/types";
import { importGoogleDriveFile } from "./storageSourceImport";

jest.mock("@/lib/api/typed-client", () => ({ apiPost: jest.fn() }));
jest.mock("@/features/files/api/files", () => ({ getFile: jest.fn() }));

function fileRow(overrides: Partial<FileRecordApi> = {}): FileRecordApi {
  return {
    id: "canonical-file",
    owner_id: "admin-user",
    file_path: "My Files/Imports/report.pdf",
    file_name: "report.pdf",
    mime_type: "application/pdf",
    size_bytes: 117,
    checksum: "abc",
    visibility: "personal",
    current_version: 1,
    parent_folder_id: "imports-folder",
    metadata: {},
    created_at: "2026-09-19T12:00:00Z",
    updated_at: "2026-09-19T12:00:00Z",
    deleted_at: null,
    url: "https://server.example/files/canonical-file/download?inline=1",
    ...overrides,
  };
}

describe("canonical Google Drive import", () => {
  it("sends only the selected source reference and safe destination fields", async () => {
    jest.mocked(apiPost).mockResolvedValue({
      data: {
        file_id: "canonical-file",
        file_path: "My Files/Imports/report.pdf",
        checksum: "abc",
        version_number: 1,
        created: true,
        source: {
          provider: "google_drive",
          connection_id: "connection-1",
          source_ref: "provider-file-1",
          revision: "7",
          modified_at: null,
        },
      },
      meta: {} as never,
    });
    jest.mocked(getFile).mockResolvedValue({
      data: fileRow(),
      meta: {} as never,
    });

    // A picker hands back MORE than the import needs — including a
    // short-lived download URL. It is passed through a variable, exactly as a
    // picker item reaches the caller, so the function's narrow
    // `{ id, name }` parameter stays the contract and this test proves the
    // extra fields never reach the wire.
    const pickedFromDrive = {
      id: "provider-file-1",
      name: "report.pdf",
      mimeType: "application/pdf",
      url: "https://drive.google.com/secret-download-url",
    };
    const result = await importGoogleDriveFile("connection-1", pickedFromDrive);

    expect(apiPost).toHaveBeenCalledWith("/storage-sources/import", {
      provider: "google_drive",
      connection_id: "connection-1",
      source_ref: "provider-file-1",
      file_path: "My Files/Imports/report.pdf",
      visibility: "personal",
    });
    expect(JSON.stringify(jest.mocked(apiPost).mock.calls[0])).not.toContain(
      "secret-download-url",
    );
    expect(result).toMatchObject({
      fileId: "canonical-file",
      source: { provider: "google_drive", source_ref: "provider-file-1" },
      file: {
        id: "canonical-file",
        fileName: "report.pdf",
        mimeType: "application/pdf",
        fileSize: 117,
        parentFolderId: "imports-folder",
      },
    });
    expect(getFile).toHaveBeenCalledWith("canonical-file");
  });

  it("uses the invoking Files folder without treating picker metadata as result truth", async () => {
    jest.mocked(apiPost).mockResolvedValue({
      data: {
        file_id: "canonical-doc",
        file_path: "My Files/Projects/Proposal",
        checksum: null,
        version_number: 1,
        created: true,
        source: {
          provider: "google_drive",
          connection_id: "connection-1",
          source_ref: "doc-1",
          revision: null,
          modified_at: null,
        },
      },
      meta: {} as never,
    });
    jest.mocked(getFile).mockResolvedValue({
      data: fileRow({
        id: "canonical-doc",
        file_path: "My Files/Projects/Proposal.docx",
        file_name: "Proposal.docx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size_bytes: 8042,
      }),
      meta: {} as never,
    });

    const pickedDoc = {
      id: "doc-1",
      name: "Proposal",
      mimeType: "application/vnd.google-apps.document",
      url: null,
    };
    const result = await importGoogleDriveFile(
      "connection-1",
      pickedDoc,
      "My Files/Projects",
    );

    expect(apiPost).toHaveBeenCalledWith(
      "/storage-sources/import",
      expect.objectContaining({ file_path: "My Files/Projects/Proposal" }),
    );
    expect(result).not.toHaveProperty("name");
    expect(result).not.toHaveProperty("mimeType");
    expect(result.file).toMatchObject({
      fileName: "Proposal.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileSize: 8042,
    });
  });

  it("imports into the Files root without sending an absolute path", async () => {
    jest.mocked(apiPost).mockResolvedValue({
      data: {
        file_id: "root-file",
        file_path: "root.txt",
        checksum: "root-checksum",
        version_number: 1,
        created: true,
        source: {
          provider: "google_drive",
          connection_id: "connection-1",
          source_ref: "provider-root",
          revision: "8",
          modified_at: null,
        },
      },
      meta: {} as never,
    });
    jest.mocked(getFile).mockResolvedValue({
      data: fileRow({
        id: "root-file",
        file_path: "root.txt",
        file_name: "root.txt",
        parent_folder_id: null,
      }),
      meta: {} as never,
    });

    await importGoogleDriveFile(
      "connection-1",
      { id: "provider-root", name: "root.txt" },
      "",
    );

    expect(apiPost).toHaveBeenCalledWith(
      "/storage-sources/import",
      expect.objectContaining({ file_path: "root.txt" }),
    );
  });
});
