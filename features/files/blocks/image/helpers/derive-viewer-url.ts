/**
 * features/files/blocks/image/helpers/derive-viewer-url.ts
 *
 * Derive the internal viewer route for a matrx-owned image. The route
 * `/files/f/{fileId}` is the canonical "deep link" for any cld_files row.
 *
 * External blocks do not have a viewer URL — return null.
 */

import type { UnifiedImageBlock } from "../types";

export function deriveViewerUrl(block: UnifiedImageBlock): string | null {
  if (block.origin === "external") return null;
  return `/files/f/${block.fileId}`;
}
