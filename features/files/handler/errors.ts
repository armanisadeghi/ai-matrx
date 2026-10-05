/**
 * Moved to `@ai-matrx/media/files` (P16f). This path re-exports the package so existing
 * app imports keep resolving to the ONE implementation.
 */
export {
  ExternalFetchError,
  FileAccessDeniedError,
  FileDeletedError,
  FileHandlerError,
  FileNotFoundError,
  FileUploadError,
  ShareLinkInvalidError,
  UploadCancelledError,
  isUploadCancelledError,
} from "@ai-matrx/media/files";
export type {
  FileHandlerErrorCode,
} from "@ai-matrx/media/files";
