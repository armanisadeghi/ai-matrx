/**
 * Moved to `@ai-matrx/media/files` (P16f). This path re-exports the package so existing
 * app imports keep resolving to the ONE implementation.
 */
export {
  parseGenerationMetadata,
} from "@ai-matrx/media/files";
export type {
  AudioBlock,
  DocumentBlock,
  ExternalAudioBlock,
  ExternalDocumentBlock,
  ExternalImageBlock,
  ExternalVideoBlock,
  ImageBlock,
  MatrxAudioBlock,
  MatrxDocumentBlock,
  MatrxImageBlock,
  MatrxVideoBlock,
  MediaGenerationKind,
  MediaGenerationMetadata,
  MediaGenerationMetadataWire,
  MediaKind,
  MediaOrigin,
  MediaStatus,
  MediaVisibility,
  UnifiedMediaBlock,
  VideoBlock,
  YouTubeBlock,
} from "@ai-matrx/media/files";
