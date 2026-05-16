/**
 * features/files/blocks/image/adapters/from-cld-files-row.ts
 *
 * Convert a `cld_files` row (read directly from Supabase) into a
 * UnifiedImageBlock. Used as the fallback re-hydrate path when a block
 * already in Redux has expired URLs and the file_id is the only valid
 * identity we have.
 *
 * Unlike the other adapters, this one is PERMANENT — frontend reads
 * Supabase directly for owned files; there's no upstream to wait on.
 *
 * The row alone doesn't carry signed/cdn URLs (those are minted by
 * Python). Callers typically follow this up with a fileHandler call to
 * mint fresh URLs. Until then the block carries identity + metadata
 * only.
 */

import type { CloudFileRow } from "@/features/files/types";
import type { MatrxImageBlock } from "../types";

export function fromCldFilesRow(row: CloudFileRow): MatrxImageBlock {
  const metadata = (row.metadata ?? null) as Record<string, unknown> | null;
  const width =
    typeof metadata?.width === "number" && Number.isFinite(metadata.width)
      ? metadata.width
      : null;
  const height =
    typeof metadata?.height === "number" && Number.isFinite(metadata.height)
      ? metadata.height
      : null;

  return {
    origin: "matrx",
    fileId: row.id,
    fileUri: row.storage_uri,
    canonicalFileUri: row.canonical_storage_uri ?? null,
    visibility:
      row.visibility === "public" ||
      row.visibility === "private" ||
      row.visibility === "shared"
        ? row.visibility
        : "private",
    thumbnailUrl: row.thumbnail_url ?? null,
    thumbnailUri: row.thumbnail_storage_uri ?? null,
    parentFileId: row.parent_file_id ?? null,
    derivationKind: row.derivation_kind ?? null,

    // No URLs from the DB row alone — caller follows up with fileHandler
    // to mint these. signedUrlExpiresAt stays null until that happens.
    cdnUrl: null,
    signedUrl: null,
    downloadUrl: null,
    base64: null,

    mimeType: row.mime_type ?? null,
    fileName: row.file_name,
    width,
    height,
    sizeBytes: row.file_size ?? null,

    status: "complete",
    progress: null,
    signedUrlExpiresAt: null,

    metadata,
  };
}
