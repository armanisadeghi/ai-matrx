/**
 * Moved to `@ai-matrx/media/files` (P16f). This path re-exports the package so existing
 * app imports keep resolving to the ONE implementation.
 */
export {
  CloudFolderDescriptions,
  CloudFolders,
  folderForApplet,
  folderForAgentBlock,
  folderForCaptures,
  folderForConversation,
  folderForIntakeAsset,
  folderForOrg,
  folderForPodcast,
  folderForProductCaptureItem,
  folderForTask,
  folderForWarRoomThread,
  isConventionalFolder,
  isHiddenFolder,
  isSystemPath,
  resolveDefaultVisibility,
} from "@ai-matrx/media/files";
