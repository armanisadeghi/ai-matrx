/**
 * Moved to `@ai-matrx/media/files` (P16f). This path re-exports the package so existing
 * app imports keep resolving to the ONE implementation.
 */
export {
  blockFromMediaRef,
  imageBlockFromMediaRef,
  videoBlockFromMediaRef,
} from "@ai-matrx/media/files";
export type {
  MediaBlockKindArg,
} from "@ai-matrx/media/files";
