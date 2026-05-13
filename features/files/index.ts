/* eslint-disable no-barrel-files/no-barrel-files -- This file IS the public-
 * surface barrel for the file-handling system. The no-barrel-files rule is
 * a sane default; this is the documented exception per the consolidation
 * plan (docs/FILE_HANDLING_CONSOLIDATION_PLAN.md §6.1). */
/**
 * features/files/index.ts
 *
 * THE public surface of the file-handling system.
 *
 * Every consumer outside `features/files/**` and `features/file-handler/**`
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
export { useFile } from "@/features/file-handler/hooks/useFile";
export { useFileAs } from "@/features/file-handler/hooks/useFileAs";
export { useFileSrc } from "@/features/file-handler/hooks/useFileSrc";
export { useFileBlob } from "@/features/file-handler/hooks/useFileBlob";
export { useFileUpload } from "@/features/file-handler/hooks/useFileUpload";

// Existing data-layer hooks staying available through Phase 1. The Asset
// hook will fold into the canonical `useFile` once the BE always returns the
// envelope; the guarded upload will fold into `useFileUpload({ guard: true })`.
export {
  useFileAsset,
  type UseFileAssetOptions,
  type UseFileAssetResult,
} from "@/features/files/hooks/useFileAsset";
export { useFileDocument } from "@/features/files/hooks/useFileDocument";
export { useSharing } from "@/features/files/hooks/useSharing";

// Tree / picker-adjacent hooks (read-side; not part of the canonical 5).
export { useCloudTree } from "@/features/files/hooks/useCloudTree";
export { useFolderContents } from "@/features/files/hooks/useFolderContents";
export { useFileNode } from "@/features/files/hooks/useFileNode";
export { useFileSelection } from "@/features/files/hooks/useFileSelection";
export { useFileSearch } from "@/features/files/hooks/useFileSearch";
export { useStorageQuota } from "@/features/files/hooks/useStorageQuota";

// ---------------------------------------------------------------------------
// 2. Facade — for non-React callers (services, thunks, agent prep)
// ---------------------------------------------------------------------------
export { fileHandler } from "@/features/file-handler/handler";

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

// Dialogs / context menus that consumers compose into their own surfaces.
export { RenameDialog } from "@/features/files/components/core/RenameDialog/RenameDialog";
export { ShareLinkDialog } from "@/features/files/components/core/ShareLinkDialog/ShareLinkDialog";
export { PermissionsDialog } from "@/features/files/components/core/PermissionsDialog/PermissionsDialog";
export { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
export { FolderContextMenu } from "@/features/files/components/core/FolderContextMenu/FolderContextMenu";

// Bits used by chips/lists/tree views that legitimately compose outside the
// feature. These remain stable through the rebuild.
export { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
export { FileMeta } from "@/features/files/components/core/FileMeta/FileMeta";
export { FileRagBadge } from "@/features/files/components/core/FileBadges/FileRagBadge";
export { FileChip } from "@/features/files/components/core/FileChip/FileChip";
export { FileBreadcrumbs } from "@/features/files/components/core/FileBreadcrumbs/FileBreadcrumbs";

// ---------------------------------------------------------------------------
// 4. Realtime provider — mounted ONCE in app/Providers.tsx after Phase 0
// ---------------------------------------------------------------------------
export { CloudFilesRealtimeProvider } from "@/features/files/providers/CloudFilesRealtimeProvider";

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
// 6. Folder conventions
// ---------------------------------------------------------------------------
export {
  CloudFolders,
  folderForPodcast,
  folderForAgentApp,
  folderForTask,
  resolveDefaultVisibility,
} from "@/features/files/utils/folder-conventions";

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
} from "@/features/file-handler/types";

// Typed errors — the canonical taxonomy currently lives in the handler
// directory. After the Phase 1 merge it relocates to features/files/errors.ts.
export * from "@/features/file-handler/errors";
