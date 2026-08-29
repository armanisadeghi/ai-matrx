import { buildEmbeddedFileContextData } from "./buildFilesContextData";
import type { CloudFileRecord } from "@/features/files/types";

const file: CloudFileRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  ownerId: "22222222-2222-4222-8222-222222222222",
  filePath: "/tests/photo.jpg",
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  fileSize: 1234,
  checksum: "checksum",
  visibility: "personal",
  currentVersion: 1,
  parentFolderId: null,
  metadata: {},
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
  deletedAt: null,
  publicUrl: null,
  url: null,
  cdnUrl: null,
  downloadUrl: null,
  thumbnailUrl: null,
  source: { kind: "real" },
  _dirty: false,
  _dirtyFields: {},
  _loadedFields: {},
  _loading: false,
  _error: null,
  _pendingRequestIds: [],
  _fieldHistory: {},
};

describe("buildEmbeddedFileContextData", () => {
  it("emits the active file plus honest defaults for every embedded browser value", () => {
    const context = buildEmbeddedFileContextData(file);

    expect(context).toMatchObject({
      files_section: "embedded",
      tree_status: "loaded",
      preview_open: true,
      active_file_id: file.id,
      active_file_name: file.fileName,
      active_file_mime_type: file.mimeType,
      focused_row_id: file.id,
      kind_filter: "all",
      sort_by: "updated_at",
      sort_direction: "desc",
      view_mode: "list",
      details_level: "compact",
      visible_file_count: 1,
      visible_folder_count: 0,
      upload_in_progress: false,
      active_upload_count: 0,
      upload_progress_percent: 0,
    });
    expect(context.visible_files).toEqual([
      expect.objectContaining({ id: file.id, name: file.fileName }),
    ]);
    expect(context.visible_folders).toEqual([]);
    expect(context.recent_uploads).toEqual([]);
  });
});
