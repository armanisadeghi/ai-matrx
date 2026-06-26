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
 *
 * Phase 1b note: `cld_files.thumbnail_url` + `cld_files.thumbnail_storage_uri`
 * columns have been dropped (migration 011). The canonical thumbnail
 * source is now `Asset.variants["thumbnail_url"].url` via
 * `GET /assets/{file_id}`. See docs/PYTHON_UPDATES.md "Phase 1b".
 */

import type { CloudFileRow } from "@/features/files/types";
import type { MatrxImageBlock } from "../types";

export function fromCldFilesRow(row: CloudFileRow): MatrxImageBlock {
  const metadata = (row.metadata ?? null) as Record<string, unknown> | null;

  // Phase 1d.1: `cld_files.width` / `cld_files.height` are first-class
  // columns now and the server populates them at upload time. Prefer
  // the column; fall back to metadata for pre-Phase-1d.1 rows that were
  // probed by the old code path which dumped dims into metadata.
  const rowWidth =
    typeof row.width === "number" && Number.isFinite(row.width)
      ? row.width
      : null;
  const rowHeight =
    typeof row.height === "number" && Number.isFinite(row.height)
      ? row.height
      : null;
  const width =
    rowWidth ??
    (typeof metadata?.width === "number" && Number.isFinite(metadata.width)
      ? metadata.width
      : null);
  const height =
    rowHeight ??
    (typeof metadata?.height === "number" && Number.isFinite(metadata.height)
      ? metadata.height
      : null);

  return {
    kind: "image",
    origin: "matrx",
    fileId: row.id,
    fileUri: row.storage_uri,
    // `cld_files.canonical_storage_uri` was dropped; canonical processed doc id
    // is a separate dedup column. Legacy rows may still carry the URI in metadata.
    canonicalFileUri:
      typeof metadata?.canonical_file_uri === "string"
        ? metadata.canonical_file_uri
        : null,
    // `files.files.visibility` is the canonical `platform.visibility` enum now
    // (`private < internal < link < public`); the old free-text `'shared'` is
    // `'link'`. The image-block domain speaks `public | private | shared`, so
    // map `'link'` → `'shared'` and treat `'internal'`/unknown as `'private'`.
    visibility:
      row.visibility === "public"
        ? "public"
        : row.visibility === "link"
          ? "shared"
          : "private",
    parentFileId: row.parent_file_id ?? null,
    derivationKind: row.derivation_kind ?? null,

    // No URLs from the DB row alone — caller follows up with fileHandler
    // to mint these. signedUrlExpiresAt stays null until that happens.
    // Thumbnails come from the variants store (Asset.variants["thumbnail_url"])
    // via a separate fetch, not from this row.
    cdnUrl: null,
    signedUrl: null,
    downloadUrl: null,
    base64: null,

    mimeType: row.mime_type ?? null,
    fileName: row.file_name,
    width,
    height,
    // Phase 0 rename: cld_files.file_size → cld_files.size_bytes. See
    // docs/PYTHON_UPDATES.md §3.
    sizeBytes: row.size_bytes ?? null,
    visionClass: null,

    status: "complete",
    progress: null,
    errorMessage: null,
    signedUrlExpiresAt: null,

    metadata,
  };
}
