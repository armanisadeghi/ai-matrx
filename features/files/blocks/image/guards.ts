/**
 * features/files/blocks/image/guards.ts
 *
 * Image-specific runtime guards. Re-exported from the canonical guards in
 * `../guards.ts`. New code should prefer importing from there directly.
 *
 * Usage:
 *
 *     if (!isUnifiedImageBlock(block.data)) return null;
 *     // block.data is now narrowed to ImageBlock (kind: "image")
 *     // by TypeScript.
 *
 * These guards check BOTH `kind === "image"` and the origin discriminator,
 * so a stray video/audio/document block will NOT pass through them.
 */

export { isMatrxImageBlock, isExternalImageBlock } from "../guards";

import { isImageBlock } from "../guards";
import type { UnifiedImageBlock } from "./types";

/**
 * Back-compat alias for `isImageBlock` — narrows to `UnifiedImageBlock`
 * (a.k.a. the `kind: "image"` variant of `UnifiedMediaBlock`).
 */
export function isUnifiedImageBlock(
  value: unknown,
): value is UnifiedImageBlock {
  return isImageBlock(value);
}
