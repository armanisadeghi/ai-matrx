import {
  allCloudBrowserRowIds,
  buildCloudFilesBrowserRows,
  getCloudFileKindLabel,
  isCloudFileSelectable,
  toggleCloudBrowserSelection,
} from "../cloudFilesBrowserUtils";
import type {
  CloudFileRecord,
  CloudFolderRecord,
} from "@/features/files";

function file(
  patch: Partial<CloudFileRecord> & Pick<CloudFileRecord, "id" | "fileName">,
): CloudFileRecord {
  return {
    ownerId: "user-1",
    filePath: patch.fileName,
    storageUri: "",
    mimeType: null,
    fileSize: null,
    checksum: null,
    visibility: "private",
    currentVersion: 1,
    parentFolderId: null,
    metadata: {},
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    deletedAt: null,
    publicUrl: null,
    source: { kind: "real" },
    _dirty: false,
    _dirtyFields: {},
    _fieldHistory: {},
    _loadedFields: {},
    _loading: false,
    _error: null,
    _pendingRequestIds: [],
    ...patch,
  } as CloudFileRecord;
}

function folder(id: string, folderName: string): CloudFolderRecord {
  return {
    id,
    ownerId: "user-1",
    folderPath: folderName,
    folderName,
    parentId: null,
    visibility: "private",
    metadata: {},
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    deletedAt: null,
    source: { kind: "real" },
    _dirty: false,
    _dirtyFields: {},
    _fieldHistory: {},
    _loadedFields: {},
    _loading: false,
    _error: null,
    _pendingRequestIds: [],
  } as CloudFolderRecord;
}

describe("cloudFilesBrowserUtils", () => {
  it("builds folder rows before file rows and exposes stable ids", () => {
    const rows = buildCloudFilesBrowserRows({
      folders: [folder("folder-1", "Images")],
      files: [file({ id: "file-1", fileName: "avatar.jpg" })],
    });

    expect(rows.map((row) => row.kind)).toEqual(["folder", "file"]);
    expect(allCloudBrowserRowIds(rows)).toEqual(["folder-1", "file-1"]);
  });

  it("classifies image files by extension and selectable kind", () => {
    const image = file({
      id: "file-1",
      fileName: "avatar.jpg",
      mimeType: "image/jpeg",
    });

    expect(getCloudFileKindLabel(image)).toBe("JPG image");
    expect(isCloudFileSelectable(image, ["image"])).toBe(true);
    expect(isCloudFileSelectable(image, ["pdf"])).toBe(false);
  });

  it("toggles browser selection without mutating the original array", () => {
    const selected = ["a"];
    const added = toggleCloudBrowserSelection(selected, "b");
    const removed = toggleCloudBrowserSelection(added, "a");

    expect(selected).toEqual(["a"]);
    expect(added).toEqual(["a", "b"]);
    expect(removed).toEqual(["b"]);
  });
});
