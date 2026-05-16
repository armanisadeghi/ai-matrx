/**
 * features/files/blocks/image/types.ts
 *
 * Image-specific types — re-exported from the canonical `UnifiedMediaBlock`
 * union in `../types.ts`. THIS FILE IS THIN BY DESIGN: there is no
 * image-only shape anymore; an `ImageBlock` is just the `kind: "image"`
 * variant of the platform-wide media block.
 *
 * Keep this file alive so existing imports
 *   import type { UnifiedImageBlock, MatrxImageBlock, ExternalImageBlock }
 *     from "@/features/files/blocks/image/types";
 * continue to work without churn. New code should prefer importing from
 * `@/features/files/blocks/types` directly.
 *
 * See ../UNIFIED_IMAGE_BLOCK.md and docs/PYTHON_UPDATES.md for the wire
 * contract.
 */

export type { ImageBlock, MatrxImageBlock, ExternalImageBlock } from "../types";

import type { ImageBlock } from "../types";

/**
 * Back-compat alias. Past consumers know "UnifiedImageBlock" — this is the
 * same thing as `ImageBlock` from the canonical union. New code should
 * spell it `ImageBlock` for consistency with the other kinds.
 */
export type UnifiedImageBlock = ImageBlock;
