/**
 * Canonical cloud-file field hydration contracts.
 *
 * A file id is the durable identity. Callers may seed fields they already
 * possess, then request one of these field sets. Readiness is determined by
 * `_loadedFields`, never by value truthiness: a loaded `mimeType: null` is a
 * completed read and must not create a request loop.
 */

import type {
  CloudFile,
  CloudFileReadRow,
  CloudFileRecord,
  FileIdentityHint,
  Visibility,
} from "@/features/files/types";

export const FILE_RENDER_FIELDS = [
  "fileName",
  "mimeType",
  "fileSize",
  "visibility",
] as const satisfies readonly (keyof CloudFile)[];

export const FILE_DB_RECORD_FIELDS = [
  "ownerId",
  "filePath",
  "fileName",
  "mimeType",
  "fileSize",
  "checksum",
  "visibility",
  "currentVersion",
  "parentFolderId",
  "metadata",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "parentFileId",
  "derivationKind",
  "derivationMetadata",
  "duplicateOfFileId",
  "canonicalProcessedDocumentId",
] as const satisfies readonly (keyof CloudFile)[];

export type CloudFileHydrationField = (typeof FILE_DB_RECORD_FIELDS)[number];

export const FILE_RENDER_TABLE_COLUMNS =
  "id, file_name, mime_type, size_bytes, visibility";

export type CloudFileRenderReadRow = Pick<
  CloudFileReadRow,
  "id" | "file_name" | "mime_type" | "size_bytes" | "visibility"
>;

export function normalizeFileVisibility(raw: string | null): Visibility {
  if (raw === "public" || raw === "link" || raw === "internal") return raw;
  return "personal";
}

export function renderRowToCloudFilePartial(
  row: CloudFileRenderReadRow,
): Partial<CloudFile> & Pick<CloudFile, "id"> {
  return {
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSize: row.size_bytes,
    visibility: normalizeFileVisibility(row.visibility),
  };
}

export function fileHintToCloudFilePartial(
  fileId: string,
  hint: FileIdentityHint | undefined,
): Partial<CloudFile> & Pick<CloudFile, "id"> {
  return hint ? { id: fileId, ...hint } : { id: fileId };
}

export function areCloudFileFieldsLoaded(
  record: Pick<CloudFileRecord, "_loadedFields"> | undefined,
  fields: readonly CloudFileHydrationField[],
): boolean {
  if (!record) return false;
  return fields.every((field) => record._loadedFields[field] === true);
}

export function needsOnlyRenderFields(
  fields: readonly CloudFileHydrationField[],
): boolean {
  return fields.every((field) =>
    (FILE_RENDER_FIELDS as readonly CloudFileHydrationField[]).includes(field),
  );
}
