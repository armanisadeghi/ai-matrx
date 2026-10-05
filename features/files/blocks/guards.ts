/**
 * Moved to `@ai-matrx/media/files` (P16f). This path re-exports the package so existing
 * app imports keep resolving to the ONE implementation.
 */
export {
  isAudioBlock,
  isDocumentBlock,
  isExternalImageBlock,
  isExternalMediaBlock,
  isImageBlock,
  isMatrxImageBlock,
  isMatrxMediaBlock,
  isUnifiedMediaBlock,
  isVideoBlock,
  isYouTubeBlock,
} from "@ai-matrx/media/files";
