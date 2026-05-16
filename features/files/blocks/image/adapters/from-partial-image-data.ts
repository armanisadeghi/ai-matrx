/**
 * features/files/blocks/image/adapters/from-partial-image-data.ts
 *
 * Convert a Python `partial_image` event into an in-flight UnifiedImageBlock.
 *
 * Partial images are base64 frames Python emits during image generation.
 * They arrive BEFORE the final `image_output` event lands, so there's no
 * fileId yet. We model them as an external block in "streaming" status
 * whose `base64` carries the latest frame.
 *
 * When the final `image_output` arrives, the stream-ingest layer should
 * upsert by `blockId` so a single block transitions from streaming
 * (base64-only) → complete (matrx variant with URLs). This means partial
 * and final SHARE the same blockId in Redux.
 *
 * Delete when Python emits UnifiedImageBlock directly with status: "streaming"
 * (Phase 2).
 */

import type { PartialImageData } from "@/types/python-generated/stream-events";
import type { UnifiedImageBlock } from "../types";

export function fromPartialImageData(
  data: PartialImageData,
  carriedMetadata?: Record<string, unknown> | null,
): UnifiedImageBlock {
  // Partials are visually external — they're inline base64 with no identity
  // until the final event lands. The renderer treats them as "best available
  // preview" while waiting for the upsert.
  return {
    origin: "external",
    cdnUrl: null,
    signedUrl: null,
    downloadUrl: null,
    base64: data.b64_json,
    mimeType: data.mime_type ?? "image/png",
    fileName: null,
    width: null,
    height: null,
    sizeBytes: null,
    status: "streaming",
    progress: data.progress ?? null,
    signedUrlExpiresAt: null,
    metadata: carriedMetadata ?? null,
    externalUrl: "",
    sourceLabel: "Generating",
  };
}
