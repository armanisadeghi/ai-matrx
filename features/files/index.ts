/* eslint-disable no-barrel-files/no-barrel-files -- This file IS the public-
 * surface barrel for the file-handling system. The no-barrel-files rule is
 * a sane default; this is the documented exception per the consolidation
 * plan (docs/FILE_HANDLING_CONSOLIDATION_PLAN.md §6.1). */
/**
 * features/files/index.ts
 *
 * THE public surface of the file-handling system.
 *
 * Every consumer outside `features/files/**` and `features/files/handler/**`
 * should import from here — never from internal subdirectories. The ring-
 * fence ESLint rule lands in Phase 1; until then this file is the live
 * landing pad and the migration target.
 *
 * Status: **Phase 0 (locked surface, current shape).**
 *   - The five canonical hooks (useFile / useFileSrc / useFileBlob /
 *     useFileUpload / useFileMutation) plus <InlineMediaRef> arrive in
 *     Phase 1. Until then, the legacy + handler hooks are re-exported and
 *     external callers should prefer the most-canonical-available option
 *     listed under each section.
 *   - The `fileHandler` facade is the single non-React entry point.
 *   - MediaRef construction is funneled through the four converters in
 *     `redux/converters.ts`; ESLint will ban manual `{file_id, url, ...}`
 *     object literals outside that file in Phase 1.
 *
 * See docs/FILE_HANDLING_CONSOLIDATION_PLAN.md (in repo root) for the
 * complete architecture and rollout plan.
 */

// ---------------------------------------------------------------------------
// 1. The five canonical hooks (Phase 0 — current shape; Phase 1 collapses)
// ---------------------------------------------------------------------------
//
// Phase 1 target:
//   useFile           — metadata + URLs + capabilities (Asset envelope)
//   useFileSrc        — string URL for <img>/<video>/<audio> src
//   useFileBlob       — bytes (with 3-tier cache: memory LRU → IDB → network)
//   useFileUpload     — single upload primitive (auto buffered/presigned/TUS)
//   useFileMutation   — rename/move/delete/restore/share/permissions/metadata

// Today's closest matches, re-exported from the existing locations:
export { useFile } from "@/features/files/handler/hooks/useFile";
export { useFileAs } from "@/features/files/handler/hooks/useFileAs";
export { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
// useFileBlob — the RICH version (fileId-based, 3-tier-cached, loading
// state + progress + retry). The handler also has a minimal Blob-only
// shorthand that's internal-only.
export { useFileBlob } from "@/features/files/hooks/useFileBlob";
export { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";

// Mutation surface — stable, id-agnostic callbacks for rename / move /
// delete / metadata / visibility / signed-URL fetch. Use in tables and
// grids that iterate over many file/folder ids (where useFileActions
// would violate the rules of hooks).
export {
  useFileMutation,
  useFolderMutation,
  type FileMutations,
  type FolderMutations,
} from "@/features/files/hooks/useFileMutation";

// Existing data-layer hooks staying available through Phase 1. The Asset
// hook will fold into the canonical `useFile` once the BE always returns the
// envelope; the guarded upload will fold into `useFileUpload({ guard: true })`.
export {
  useFileAsset,
  type UseFileAssetOptions,
  type UseFileAssetResult,
} from "@/features/files/hooks/useFileAsset";

// Asset API — direct access for components that need fine-grained control
// (e.g. ImageAssetUploader library tab: pick from library → ensure preset variants).
// Import from here, never from @/features/files/api/* directly.
export { getAssetForFile, addAssetVariants } from "@/features/files/api/assets";
export { useFileDocument } from "@/features/files/hooks/useFileDocument";
export { useSharing } from "@/features/files/hooks/useSharing";

// Tree / picker-adjacent hooks (read-side; not part of the canonical 5).
export { useCloudTree } from "@/features/files/hooks/useCloudTree";
export { useFolderContents } from "@/features/files/hooks/useFolderContents";
export { useFileNode } from "@/features/files/hooks/useFileNode";
export { useFolderNode } from "@/features/files/hooks/useFolderNode";
export { useFileSelection } from "@/features/files/hooks/useFileSelection";
export { useFileSearch } from "@/features/files/hooks/useFileSearch";
export { useStorageQuota } from "@/features/files/hooks/useStorageQuota";
export { useInfiniteWindow } from "@/features/files/hooks/useInfiniteWindow";

// ---------------------------------------------------------------------------
// 2. Facade — for non-React callers (services, thunks, agent prep)
// ---------------------------------------------------------------------------
export { fileHandler } from "@/features/files/handler/handler";

// Synchronous lower-level primitives — exposed for the rare callsite that
// needs them inline (e.g. slice reducers like
// `features/agents/redux/execution-system/instance-resources/resource-source.ts`
// where `fileHandler.resolve` is async and a `MediaRef` must be derived
// during a synchronous redux action). Prefer `fileHandler.*` ops for
// everything else.
export { normalize } from "@/features/files/handler/input/normalize";
export { preferIdentityLocator } from "@/features/files/handler/utils/prefer-locator";
export { toMediaRef } from "@/features/files/handler/output/target";
export {
  mapLegacyBucket,
  composeLegacyFolderPath,
} from "@/features/files/handler/utils/legacy-bucket-map";

// ---------------------------------------------------------------------------
// 3. Components — the canonical render / upload / pick surface
// ---------------------------------------------------------------------------
//
// Phase 1 narrows this to <InlineMediaRef> + <FilePreview> + <FileUploadDropzone>.
// <InlineMediaRef> doesn't exist yet — components that today build their own
// <img src={file.publicUrl ?? signedUrl}> will migrate after it ships.

export {
  InlineMediaRef,
  type InlineMediaRefProps,
  type InlineMediaRefSize,
  type InlineMediaRefFit,
} from "@/features/files/components/inline/InlineMediaRef";
export { FilePreview } from "@/features/files/components/core/FilePreview/FilePreview";
export { FileUploadDropzone } from "@/features/files/components/core/FileUploadDropzone/FileUploadDropzone";
export { MediaThumbnail } from "@/features/files/components/core/MediaThumbnail/MediaThumbnail";

// Pickers — currently distinct components; Phase 1 may unify them.
export { FilePicker } from "@/features/files/components/pickers/FilePicker";
export { FolderPicker } from "@/features/files/components/pickers/FolderPicker";
export { SaveAsDialog } from "@/features/files/components/pickers/SaveAsDialog";
export {
  useFilePicker,
  type FilePickerProps,
  type UseFilePickerOpenOptions,
  type UseFilePickerResult,
} from "@/features/files/components/pickers/FilePicker";

// CloudFilesPickerHost — mounted once at the app root (Providers.tsx). Pairs
// with the imperative openers below so non-React code can pop pickers.
export { CloudFilesPickerHost } from "@/features/files/components/pickers/CloudFilesPickerHost";

// Imperative picker openers — for thunks, services, and event handlers that
// can't run a hook. Backed by CloudFilesPickerHost.
export {
  openFilePicker,
  openFolderPicker,
  openSaveAs,
  type FileOpener,
  type FolderOpener,
  type SaveAsOpener,
} from "@/features/files/components/pickers/cloudFilesPickerOpeners";

// Dialogs / context menus that consumers compose into their own surfaces.
export { RenameDialog } from "@/features/files/components/core/RenameDialog/RenameDialog";
export {
  ShareLinkDialog,
  ShareLinkDialogBody,
} from "@/features/files/components/core/ShareLinkDialog/ShareLinkDialog";
export { PermissionsDialog } from "@/features/files/components/core/PermissionsDialog/PermissionsDialog";
export { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
export { FolderContextMenu } from "@/features/files/components/core/FolderContextMenu/FolderContextMenu";

// File / folder action hook bundles — used by context menus, browser tables,
// and explorer rows.
export {
  useFileActions,
  type FileActionHandlers,
} from "@/features/files/components/core/FileActions/useFileActions";
export {
  useFolderActions,
  type FolderActionHandlers,
} from "@/features/files/components/core/FileActions/useFolderActions";

// Composition primitives — chips, preview panes, window shells, tree views.
// These are the legitimate "embed Files UI in another feature" surfaces.
export {
  FileResourceChip,
  type FileResourceChipProps,
} from "@/features/files/components/preview/FileResourceChip";
export {
  PreviewPane,
  type PreviewPaneProps,
} from "@/features/files/components/surfaces/PreviewPane";
// Imperative "open this file's preview from anywhere" — dispatches the
// filePreviewWindow overlay (non-blocking WindowPanel wrapping PreviewPane).
export { openFilePreview } from "@/features/files/components/preview/openFilePreview";
export {
  WindowPanelShell,
  type WindowPanelShellProps,
  type CloudFilesWindowTab,
} from "@/features/files/components/surfaces/WindowPanelShell";
export {
  FileTree,
  type FileTreeProps,
} from "@/features/files/components/core/FileTree/FileTree";

// PDF annotation layer + types + helpers — used by file-analysis to render
// region overlays on top of PdfPreview.
export {
  PdfAnnotationLayer,
  type PdfAnnotationLayerProps,
  type PdfBbox,
  type PdfRegion,
  type RegionKind,
  type PendingDraw,
  type AnnotationLayerMode,
  colorsFor,
} from "@/features/files/components/core/PdfAnnotationLayer";

// Bits used by chips/lists/tree views that legitimately compose outside the
// feature. These remain stable through the rebuild.
export { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
export { FileMeta } from "@/features/files/components/core/FileMeta/FileMeta";
export { FileRagBadge } from "@/features/files/components/core/FileBadges/FileRagBadge";
export {
  FileDuplicateOfBadge,
  type FileDuplicateOfBadgeProps,
} from "@/features/files/components/core/FileBadges/FileDuplicateOfBadge";
export { FileChip } from "@/features/files/components/core/FileChip/FileChip";
export { FileBreadcrumbs } from "@/features/files/components/core/FileBreadcrumbs/FileBreadcrumbs";

// ---------------------------------------------------------------------------
// 4. Realtime + upload guard providers — mounted ONCE in app/Providers.tsx
// ---------------------------------------------------------------------------
export { CloudFilesRealtimeProvider } from "@/features/files/providers/CloudFilesRealtimeProvider";
export { UploadGuardHost } from "@/features/files/upload/UploadGuardHost";

// Store wiring — the slice reducer and realtime middleware. These are the
// ONLY redux internals consumers may import, and only `lib/redux/{store,
// entity-store, rootReducer}.ts` should reach for them. Once exposed here,
// the redux/* ESLint ban can flip to error with no allowlist.
export { cloudFilesReducer } from "@/features/files/redux/slice";
export { cloudFilesRealtimeMiddleware } from "@/features/files/redux/realtime-middleware";
export { cloudFilesMutationToastMiddleware } from "@/features/files/redux/mutation-toast-middleware";

// Explorer-side state — driven by the cloud-files side panel in the code
// workspace and the `/files` selection model. These slice actions / selector
// are the narrow contract consumers need to wire their own selection UI; the
// rest of the slice stays internal.
export {
  setActiveFileId,
  setActiveFolderId,
} from "@/features/files/redux/slice";
export { selectTreeStatus } from "@/features/files/redux/selectors";

// Imperative upload entry — opens the dedup-guard dialog when needed and
// dispatches the upload thunk. Most callers should prefer `useFileUpload`;
// `requestUpload` exists for code paths that can't run a hook (event
// handlers in non-React imperative shells).
export { requestUpload } from "@/features/files/upload/uploadGuardOpeners";

// Narrow READ contract for non-React consumers — sync Redux selectors used
// from thunk handlers / context builders / plain services that can't run the
// `useFile` hook (e.g. an agent context assembled synchronously from the
// store, a delegated-tool handler resolving a file_id). Read-only; mutation
// still goes through the handler + hooks. Mirrors the explorer-state contract
// above: a small, deliberate slice of the redux surface, the rest stays
// internal.
export {
  selectFileById,
  selectRagStatusForFile,
} from "@/features/files/redux/selectors";
export type { RagStatus } from "@/features/files/types";
// Extraction / RAG status hydration + the file→processed_document resolver —
// the canonical reads behind the RAG badge, exposed for imperative callers
// (e.g. an agent that wants a file's extraction-presence + searchable state).
export { prefetchRagStatusesForFiles } from "@/features/files/redux/rag-thunks";
export {
  lookupFileDocument,
  type FileDocumentState,
} from "@/features/files/api/document-lookup";

// ---------------------------------------------------------------------------
// 5. MediaRef construction — the only sanctioned path
// ---------------------------------------------------------------------------
//
// ESLint will ban manual `{ file_id, url, file_uri }` literals outside
// `features/files/redux/converters.ts` in Phase 1. Use these builders.
export {
  cloudFileToMediaRef,
  fileIdToMediaRef,
  urlToMediaRef,
  fileUriToMediaRef,
} from "@/features/files/redux/converters";

// ---------------------------------------------------------------------------
// 6. Folder conventions + file-type / format / URL helpers
// ---------------------------------------------------------------------------
export {
  CloudFolders,
  CloudFolderDescriptions,
  folderForPodcast,
  folderForAgentApp,
  folderForAgentBlock,
  folderForConversation,
  folderForOrg,
  folderForTask,
  folderForWarRoomThread,
  isHiddenFolder,
  isConventionalFolder,
  resolveDefaultVisibility,
} from "@/features/files/utils/folder-conventions";

// MIME / file-type helpers — every callsite that asks "is this an image?"
// should funnel through here so we don't fork the heuristic.
export {
  isImageMime,
  isVideoMime,
  isAudioMime,
  isPdfMime,
  isTextMime,
  resolveMime,
  mimeFromFilename,
  getFileTypeDetails,
  getFolderTypeDetails,
  getAssumedTextDetails,
  isLikelyTextFilename,
  sniffTextBytes,
  listSupportedTypes,
  getFilePreviewProfile,
  MAX_INLINE_PREVIEW_BYTES,
  FILE_TYPES,
  type FileCategory,
  type FileTypeDetails,
  type FileTypeEntry,
  type FilePreviewProfile,
  type PreviewKind,
  type ThumbnailStrategy,
  type TextSniffResult,
  type SupportedTypeRow,
} from "@/features/files/utils/file-types";

// Format helpers — bytes / dates / filenames. The canonical formatters used
// by FileChip, FilePreview, the browser table, and any consumer that needs
// to display file metadata.
export {
  formatFileSize,
  formatRelativeTime,
  formatAbsoluteDate,
  truncateFilename,
} from "@/features/files/utils/format";

// Python backend URL builders — for callers that need to render a media src
// or a download/share link directly. Prefer `useFileSrc` / `useFile` for
// reactive paths; these exist for non-React code and the few places that
// legitimately need a raw URL (OG images, mailers, admin tools).
export {
  pythonBaseUrl,
  pythonShareUrl,
  pythonShareResolveUrl,
  pythonFileDownloadUrl,
  pythonFileInlineUrl,
  shareUrls,
  fileUrls,
  tokenFromShareUrl,
  imageViewUrl,
  type ShareUrls,
  type FileUrls,
} from "@/features/files/handler/utils/python-base";

// ---------------------------------------------------------------------------
// 7. Types — the canonical type surface for everything outside the feature
// ---------------------------------------------------------------------------

// Domain types (CloudFile, CloudFolder, MediaRef, Asset, etc.) — re-export
// everything from the existing single types module. Phase 1 splits this into
// domain.ts / api.ts / ui.ts and deletes the hand-authored Asset block once
// regenerated types stabilize.
export type * from "@/features/files/types";

// Handler-side types (NormalizedFile, FileSource, FileTarget, UploadOpts).
// Phase 1 merges these into features/files/types.ts after the directory
// merge — until then they live across both modules and external consumers
// should import them from here.
export type {
  FileSource,
  FileTarget,
  NormalizedFile,
  UploadOpts,
} from "@/features/files/handler/types";

// Typed errors — the canonical taxonomy currently lives in the handler
// directory. After the Phase 1 merge it relocates to features/files/errors.ts.
export * from "@/features/files/handler/errors";
