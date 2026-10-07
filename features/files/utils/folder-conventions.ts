/**
 * Moved to `@ai-matrx/media/files` (P16f). This path re-exports the package so existing
 * app imports keep resolving to the ONE implementation.
 */
export {
  CloudFolderDescriptions,
  CloudFolders,
  folderForAgentApp, // package name (@ai-matrx/media); its cloud folder is still "Agent Apps/<id>"
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
