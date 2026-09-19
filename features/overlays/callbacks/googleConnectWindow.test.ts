import {
  createGoogleConnectCallbackGroup,
  emitGoogleConnectEvent,
  type GoogleDriveImportedEvent,
} from "./googleConnectWindow";

const imported: GoogleDriveImportedEvent = {
  type: "drive-imported",
  files: [
    {
      fileId: "file-1",
      filePath: "My Files/Imports/report.pdf",
      checksum: "abc",
      versionNumber: 1,
      created: true,
      source: {
        provider: "google_drive",
        connection_id: "connection-1",
        source_ref: "provider-1",
        revision: null,
        modified_at: null,
      },
      file: {
        id: "file-1",
        ownerId: "admin-user",
        organizationId: null,
        filePath: "My Files/Imports/report.pdf",
        fileName: "report.pdf",
        mimeType: "application/pdf",
        fileSize: 117,
        checksum: "abc",
        visibility: "personal",
        currentVersion: 1,
        parentFolderId: "imports-folder",
        metadata: {},
        createdAt: "2026-09-19T12:00:00Z",
        updatedAt: "2026-09-19T12:00:00Z",
        deletedAt: null,
        publicUrl: null,
        url: "https://server.example/files/file-1/download?inline=1",
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
    },
  ],
  failures: [],
};
describe("Google connect command bridge", () => {
  it("keeps successful incremental deliveries available until explicit disposal", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const callbacks = createGoogleConnectCallbackGroup({
      onDriveImported: handler,
    });

    await emitGoogleConnectEvent(callbacks.callbackGroupId, imported);
    await emitGoogleConnectEvent(callbacks.callbackGroupId, imported);

    expect(handler).toHaveBeenCalledTimes(2);
    callbacks.dispose();
  });

  it("awaits the consumer and retains a rejected command for retry", async () => {
    const handler = jest
      .fn<Promise<void>, [GoogleDriveImportedEvent]>()
      .mockRejectedValueOnce(new Error("attachment failed"))
      .mockResolvedValueOnce();
    const callbacks = createGoogleConnectCallbackGroup({
      onDriveImported: handler,
    });

    await expect(
      emitGoogleConnectEvent(callbacks.callbackGroupId, imported),
    ).rejects.toThrow("attachment failed");
    await expect(
      emitGoogleConnectEvent(callbacks.callbackGroupId, imported),
    ).resolves.toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("makes explicit disposal terminal without invoking a callback", async () => {
    const handler = jest.fn();
    const callbacks = createGoogleConnectCallbackGroup({
      onDriveImported: handler,
    });

    callbacks.dispose();

    await expect(
      emitGoogleConnectEvent(callbacks.callbackGroupId, imported),
    ).resolves.toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });
});
