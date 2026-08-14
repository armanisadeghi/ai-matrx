/**
 * features/files/blocks/image/adapters/to-cx-media-part.ts
 *
 * Convert a `UnifiedImageBlock` into the generated DB on-disk
 * `ImageMediaPart` shape.
 *
 * On-disk shape today (`ImageMediaPart`):
 *   { type: "media", kind: "image", file_id? | url?, origin?,
 *     mime_type?, size_bytes?, width?, height?, metadata? }
 *
 * Strategy:
 *   - Keep generated top-level identity fields populated so
 *     legacy readers that haven't migrated keep working.
 *   - Pack EVERY canonical field (origin, fileId, cdnUrl, signedUrl,
 *     downloadUrl, visibility, thumbnails, dimensions, etc.) into
 *     `metadata` under stable keys so `fromCxMediaPart` can re-lift them
 *     losslessly when the message is reloaded.
 *
 * Delete when `cx_message.content[]` storage switches to UnifiedImageBlock
 * natively (Phase 3).
 */

import type { ImageMediaPart } from "@/types/python-generated/stream-events";
import type { UnifiedImageBlock } from "../types";

export function toCxMediaPart(block: UnifiedImageBlock): ImageMediaPart {
  // The visible `url` field: prefer the most permanent option so reload
  // works even if the signed URL has expired and metadata isn't read.
  const visibleUrl =
    block.origin === "matrx"
      ? (block.cdnUrl ?? block.signedUrl ?? undefined)
      : block.externalUrl || undefined;

  // Pack the canonical fields into metadata under explicit keys. We do NOT
  // drop the caller's free-form `metadata` — we merge it in first so any
  // adapter-promoted keys overwrite stale ones.
  const callerMetadata = block.metadata ?? {};
  const packed: Record<string, unknown> = {
    ...callerMetadata,
    kind: block.kind,
    origin: block.origin,
    mime_type: block.mimeType,
    file_name: block.fileName,
    width: block.width,
    height: block.height,
    size_bytes: block.sizeBytes,
    vision_class: block.visionClass,
    status: block.status,
    progress: block.progress,
    error_message: block.errorMessage,
  };

  if (block.origin === "matrx") {
    packed.cdn_url = block.cdnUrl;
    packed.signed_url = block.signedUrl;
    packed.download_url = block.downloadUrl;
    packed.signed_url_expires_at = block.signedUrlExpiresAt;
    packed.file_id = block.fileId;
    packed.visibility = block.visibility;
    // Phase 1b: `thumbnail_url` / `thumbnail_uri` removed from the block
    // shape; thumbnails are now sourced from `Asset.variants["thumbnail_url"]`.
    packed.parent_file_id = block.parentFileId;
    packed.derivation_kind = block.derivationKind;
  } else {
    packed.external_url = block.externalUrl;
    packed.source_label = block.sourceLabel;
  }

  // Base64 is transient render data, not a top-level ImageMediaPart field.
  // Preserve it inside extensible metadata for the live Redux round-trip;
  // emitting `base64_data` beside `type`/`kind` violates the generated
  // chat.message.content contract and crashes the strict read boundary.
  if (block.base64) {
    packed.base64_data = block.base64;
  }

  const common = {
    type: "media",
    kind: "image",
    ...(block.mimeType !== null ? { mime_type: block.mimeType } : {}),
    ...(block.sizeBytes !== null ? { size_bytes: block.sizeBytes } : {}),
    ...(block.width !== null ? { width: block.width } : {}),
    ...(block.height !== null ? { height: block.height } : {}),
    metadata: packed,
  } as const;

  if (block.origin === "matrx") {
    return {
      ...common,
      origin: "matrx",
      file_id: block.fileId,
      ...(visibleUrl ? { url: visibleUrl } : {}),
    };
  }

  const externalUrl =
    visibleUrl ??
    (block.base64
      ? `data:${block.mimeType ?? "image/*"};base64,${block.base64}`
      : null);
  if (!externalUrl) {
    throw new TypeError(
      "Cannot project external image into chat.message.content: missing URL and base64 locator",
    );
  }

  return {
    ...common,
    origin: "external",
    url: externalUrl,
  };
}
