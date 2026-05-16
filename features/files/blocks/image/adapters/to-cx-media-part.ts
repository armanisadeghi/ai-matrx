/**
 * features/files/blocks/image/adapters/to-cx-media-part.ts
 *
 * Convert a `UnifiedImageBlock` into the DB on-disk media-part shape
 * (`CxMediaContent` with kind: "image").
 *
 * On-disk shape today (`CxMediaContent`):
 *   { type: "media", kind: "image", url?, mime_type?, file_uri?,
 *     base64_data?, metadata? }
 *
 * Strategy:
 *   - Keep the visible fields (`url`, `mime_type`, `file_uri`) populated so
 *     legacy readers that haven't migrated keep working.
 *   - Pack EVERY canonical field (origin, fileId, cdnUrl, signedUrl,
 *     downloadUrl, visibility, thumbnails, dimensions, etc.) into
 *     `metadata` under stable keys so `fromCxMediaPart` can re-lift them
 *     losslessly when the message is reloaded.
 *
 * Delete when `cx_message.content[]` storage switches to UnifiedImageBlock
 * natively (Phase 3).
 */

import type { CxMediaContent } from "@/features/public-chat/types/cx-tables";
import type { UnifiedImageBlock } from "../types";

export function toCxMediaPart(block: UnifiedImageBlock): CxMediaContent {
  // The visible `url` field: prefer the most permanent option so reload
  // works even if the signed URL has expired and metadata isn't read.
  const visibleUrl =
    (block.origin === "external" ? block.externalUrl : block.cdnUrl) ??
    block.signedUrl ??
    undefined;

  // Pack the canonical fields into metadata under explicit keys. We do NOT
  // drop the caller's free-form `metadata` — we merge it in first so any
  // adapter-promoted keys overwrite stale ones.
  const callerMetadata = block.metadata ?? {};
  const packed: Record<string, unknown> = {
    ...callerMetadata,
    origin: block.origin,
    cdn_url: block.cdnUrl,
    signed_url: block.signedUrl,
    download_url: block.downloadUrl,
    mime_type: block.mimeType,
    file_name: block.fileName,
    width: block.width,
    height: block.height,
    size_bytes: block.sizeBytes,
    status: block.status,
    progress: block.progress,
    signed_url_expires_at: block.signedUrlExpiresAt,
  };

  if (block.origin === "matrx") {
    packed.file_id = block.fileId;
    packed.file_uri = block.fileUri;
    packed.canonical_file_uri = block.canonicalFileUri;
    packed.visibility = block.visibility;
    packed.thumbnail_url = block.thumbnailUrl;
    packed.thumbnail_uri = block.thumbnailUri;
    packed.parent_file_id = block.parentFileId;
    packed.derivation_kind = block.derivationKind;
  } else {
    packed.external_url = block.externalUrl;
    packed.source_label = block.sourceLabel;
  }

  // Base64 (rare — only for streaming or tiny inline assets) goes onto its
  // own field so legacy readers can find it without parsing metadata.
  if (block.base64) {
    packed.base64_data = block.base64;
  }

  const part: CxMediaContent = {
    type: "media",
    kind: "image",
    url: visibleUrl,
    mime_type: block.mimeType ?? undefined,
    file_uri: block.origin === "matrx" ? block.fileUri : undefined,
    base64_data: block.base64 ?? undefined,
    metadata: packed,
  };
  return part;
}
