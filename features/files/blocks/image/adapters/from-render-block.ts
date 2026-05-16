/**
 * features/files/blocks/image/adapters/from-render-block.ts
 *
 * Convert a markdown-parsed image render_block (e.g. from a text chunk that
 * contained `![alt](url)`) into a UnifiedImageBlock.
 *
 * Today's wire shape is minimal — `{ src, alt }`. We treat these as external
 * unless the URL pattern matches our canonical S3 key scheme, in which case
 * we promote to matrx via `extractFileIdFromUrl` (inside `fromImageOutputData`).
 *
 * Input type is `RenderBlockPayload` (not `ImageRenderBlock`) so callers can
 * pass the redux-stored loose shape without a force-cast. We validate the
 * payload structure internally; an empty src yields an external block with an
 * empty URL — the renderer's error state covers it.
 *
 * Delete when render_block:image emits UnifiedImageBlock in its `data` field
 * (Phase 2).
 */

import type { RenderBlockPayload } from "@/types/python-generated/stream-events";
import { fromImageOutputData } from "./from-image-output-data";
import type { UnifiedImageBlock } from "../types";

export function fromRenderBlock(block: RenderBlockPayload): UnifiedImageBlock {
  // Pull `src` defensively — the loose `Record<string, unknown>` data
  // shape gives no compile-time guarantee. Adapters at boundaries must
  // tolerate Python sending field names that drift slightly over time.
  const data = (block.data ?? {}) as Record<string, unknown>;
  const src = typeof data.src === "string" ? data.src : "";
  const mimeType =
    typeof data.mime_type === "string" ? data.mime_type : "image/*";

  // Forward into the rich adapter so the same heuristics (file_id extraction,
  // signed-url detection, expiry parsing) apply.
  return fromImageOutputData(
    {
      type: "image_output",
      url: src,
      mime_type: mimeType,
    },
    block.metadata ?? null,
  );
}
