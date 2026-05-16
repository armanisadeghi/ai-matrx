/**
 * features/files/blocks/image/adapters/from-cx-media-part.ts
 *
 * Convert a DB-stored `cx_message.content[]` media part (kind: "image") into
 * a UnifiedImageBlock.
 *
 * Today's storage shape (CxMediaContent → ImageMediaPart):
 *   { type: "media", kind: "image", url?, file_uri?, mime_type?, base64_data?,
 *     metadata? }
 *
 * Everything else (file_id, cdn_url, signed_url, visibility, thumbnails,
 * dimensions, file_name, prompt, model, etc.) gets dumped into `metadata`
 * today by `assembleMessageParts`. This adapter pulls them BACK out so the
 * round-trip is lossless.
 *
 * Delete when `cx_message.content[]` storage shape switches to
 * UnifiedImageBlock natively (Phase 3).
 */

import type { ImageMediaPart } from "@/types/python-generated/stream-events";
import type { UnifiedImageBlock } from "../types";
import { fromImageOutputData } from "./from-image-output-data";

export function fromCxMediaPart(part: ImageMediaPart): UnifiedImageBlock {
  const metadata = (part.metadata ?? null) as Record<string, unknown> | null;
  // Pull URL flavors and file_id from metadata if present (where
  // assembleMessageParts dumped them).
  const cdnFromMeta =
    typeof metadata?.cdn_url === "string" ? metadata.cdn_url : null;
  const signedFromMeta =
    typeof metadata?.signed_url === "string" ? metadata.signed_url : null;
  const downloadFromMeta =
    typeof metadata?.download_url === "string" ? metadata.download_url : null;
  const fileIdFromMeta =
    typeof metadata?.file_id === "string" ? metadata.file_id : null;

  // The on-disk `url` field is whatever was visible at save time — could be
  // CDN, could be signed (long-expired by now). Forward as the fallback.
  const fallbackUrl = part.url ?? cdnFromMeta ?? signedFromMeta ?? "";

  const block = fromImageOutputData(
    {
      type: "image_output",
      url: fallbackUrl,
      mime_type: part.mime_type ?? "image/*",
      file_id: fileIdFromMeta,
      cdn_url: cdnFromMeta,
      signed_url: signedFromMeta,
      download_url: downloadFromMeta,
    },
    {
      // Pass through all metadata so the extension fields (file_uri,
      // visibility, thumbnail, dimensions, etc.) get lifted by the rich
      // adapter.
      ...(metadata ?? {}),
      // Native `file_uri` lives at top-level on the media part — copy it
      // into metadata for the adapter to find.
      ...(part.file_uri ? { file_uri: part.file_uri } : {}),
    },
  );

  // Base64 inline payload (rare but allowed by the on-disk shape).
  if (typeof metadata?.base64_data === "string") {
    return { ...block, base64: metadata.base64_data };
  }
  return block;
}
