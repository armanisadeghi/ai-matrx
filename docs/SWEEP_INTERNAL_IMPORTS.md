# Sweep: external imports from features/files/ internals

> Goal: tighten the ESLint ring-fence so external callers (outside
> `features/files/**`) can ONLY import from `@/features/files` (the public
> surface index). This sweep enumerates every internal import made from
> outside the feature, grouped by internal subdir.
>
> Date: 2026-05-13. Source: `grep -rE "from ['\"]@/features/files/...` across
> `.ts`/`.tsx` excluding `features/files/**`, `node_modules`, `.next`,
> `.claude/worktrees`.

## Headline
- **External importer files:** 109
- **Total external import statements hitting internal subdirs:** 215
- **Subdirs with zero external footprint:** `cache/`, `virtual-sources/` (fully internal)
- **Already-banned subdir still bleeding:** `api/` — 16 external violations remain despite the Phase 0 ESLint rule in `eslint.config.mjs`. The rule fires but the codebase has not been swept yet.

### Per-subdir totals (external importers only)

| Subdir | External import statements |
| --- | ---: |
| `utils/` | 49 |
| `handler/` | 43 |
| `components/` | 39 |
| `types` (file) | 30 |
| `redux/` | 30 |
| `api/` | 16 |
| `hooks/` | 5 |
| `upload/` | 2 |
| `providers/` | 1 |
| `cache/` | 0 |
| `virtual-sources/` | 0 |

---

## By subdir

### `features/files/api/` (~16 importers — already banned in ESLint)

The Phase 0 ESLint pattern `@/features/files/api(/*)` is in place, but these violations exist in the tree right now. Each one needs migrating before the rule can be moved from `'error'` (currently allowing rough edges) to clean.

| Importing file | Imported names | Recommendation |
| --- | --- | --- |
| `app/api/agent-apps/generate-favicon/route.ts` | `* as Api` (namespace) | REPLACE — server route. Move to a server-safe public entrypoint or use `@/features/files/api/server-client` directly with a documented exception (server-only). |
| `features/resource-manager/resource-picker/UploadResourcePicker.tsx` | `compressPdfMultipart`, `materializeAssetResult` from `api/assets` | REPLACE with `useFileUpload` / `fileHandler` (compress flow must move into the handler). |
| `features/resource-manager/resource-picker/FilesResourcePicker.tsx` | `* as Api` | REPLACE with handler / public surface. |
| `features/transcripts/service/audioStorageService.ts` | `* as Files` from `api/files` | REPLACE with `fileHandler`. |
| `features/public-chat/components/resource-picker/PublicUploadResourcePicker.tsx` | `compressPdfMultipart`, `materializeAssetResult` from `api/assets` | REPLACE with handler. |
| `features/tasks/services/taskService.ts` | `* as FilesApi` | REPLACE with handler / public surface. |
| `features/whatsapp-clone/chat-view/MessageInputBar.tsx` | `uploadFileWithProgress` from `api/files` | REPLACE with `useFileUpload`. |
| `features/rag/hooks/useFileIngest.ts` | `clearFileDocumentCache` from `api/document-lookup` | MIGRATE — expose `clearFileDocumentCache` via the public index (low-cost). |
| `features/canvas/social/ShareCoverImagePicker.tsx` | `uploadAsset` from `api/assets` | REPLACE with `useFileUpload` (preset upload path). |
| `features/audio/services/audioFallbackUpload.ts` | `* as Api` | REPLACE with handler. |
| `features/pdf-extractor/studio/PdfStudioReader.tsx` | `uploadFile` from `api/files` | REPLACE with `useFileUpload`. |
| `features/pdf-extractor/components/ManipulationPanel.tsx` | `uploadFile` from `api/files` | REPLACE with `useFileUpload`. |
| `features/image-studio/components/EmbeddedImageStudio.tsx` | `getSignedUrl` from `api/files` | REPLACE with `useFileSrc({kind:'file_id'})`. |
| `features/image-studio/components/StudioVariantTile.tsx` | `getSignedUrl` from `api/files` | REPLACE with `useFileSrc`. |
| `components/mardown-display/blocks/images/ImageOutputBlock.tsx` | `* as Files` from `api/files` | REPLACE with handler / `useFileSrc`. |
| `hooks/usePdfOptimize.ts` | (multiple) from `api/assets` | REPLACE with handler — define a `fileHandler.optimizePdf({source})` flow. |

---

### `features/files/redux/` (~30 statements across ~21 files)

Slice/selectors/thunks/converters/realtime-middleware. Selectors and converters should ideally funnel through public hooks; converters (`fileIdToMediaRef` etc.) are already re-exported from `@/features/files`.

| Importing file | Imported names | Recommendation |
| --- | --- | --- |
| `features/image-manager/components/StudioLibraryTab.tsx` | `ensureFolderPath` (thunks) | MIGRATE — expose `ensureFolderPath` via public index, or wrap into a handler op. |
| `features/cx-chat/components/user-input/ConversationInput.tsx` | `fileIdToMediaRef` (converters) | MIGRATE to public index (already re-exported there — just change the import path). |
| `features/resource-manager/resource-picker/FilesResourcePicker.tsx` | (multiple selectors) | REPLACE with `useCloudTree`/`useFolderContents` from public index. |
| `features/tasks/services/taskService.ts` | thunks (×2) — `ensureFolderPath` and others | MIGRATE — handler-side facade for folder ensure / upload. |
| `features/whatsapp-clone/hooks/useWhatsAppMedia.ts` | selectors + `loadUserFileTree` | REPLACE with public hooks. |
| `features/code/hooks/useOpenCloudFile.ts` | `getFileFromState` (selectors) | REPLACE with `useFile({kind:'file_id'})`. |
| `features/code/views/explorer/CloudFilesExplorer.tsx` | slice actions + `selectTreeStatus` | MIGRATE — narrow public hooks for explorer state. |
| `features/code/views/explorer/ExplorerPanel.tsx` | `loadUserFileTree` (thunks) | MIGRATE — expose `loadUserFileTree` (or a hook wrapper) on the public index. |
| `features/agents/components/inputs/smart-input/AgentTextarea.tsx` | `fileIdToMediaRef` | MIGRATE — switch to public index. |
| `features/rag/components/search/RagSearchHits.tsx` | `selectAllFilesMap` | REPLACE — RAG hits shouldn't be reading the full files map. Use a per-id `useFile` lookup. |
| `features/rag/components/data-stores/CldFilePicker.tsx` | `selectAllFilesArray` | REPLACE with `useCloudTree` / `useFolderContents`. |
| `features/audio/services/audioFallbackUpload.ts` | thunks | REPLACE with handler. |
| `features/file-analysis/studio/StudioShell.tsx` | `selectFileById` | REPLACE with `useFile`. |
| `features/image-studio/components/useCropStudioController.ts` | `selectAllFoldersMap` | REPLACE with folder picker / public hook. |
| `features/image-studio/hooks/useImageStudio.ts` | `uploadFiles`, `ensureFolderPath` | REPLACE with `useFileUpload` + public folder helper. |
| `components/image/cloud/ImageStudioTab.tsx` | `selectFileById` | REPLACE with `useFile`. |
| `components/image/cloud/CloudFilesTab.tsx` | selectors + `loadUserFileTree` | REPLACE with public hooks. |
| `components/image/cloud/CloudFilesBrowserTable.tsx` | thunks | REPLACE with public hooks. |
| `components/image/cloud/CloudImagesTab.tsx` | selectors + thunks | REPLACE with public hooks. |
| `components/image/cloud/CloudUploadTab.tsx` | selectors + `ensureFolderPath` | REPLACE with `useFileUpload`. |
| `components/image/cloud/resolveCloudFileUrl.ts` | `selectFileById` | REPLACE with `useFile` / `useFileSrc`. |
| `lib/redux/store.ts` | `cloudFilesRealtimeMiddleware` | KEEP — store wiring legitimately needs the middleware. Document an explicit exception (the slice + middleware ARE the wiring contract). |
| `lib/redux/entity-store.ts` | `cloudFilesRealtimeMiddleware` | KEEP — same exception as above. |
| `lib/redux/rootReducer.ts` | `cloudFilesReducer` (slice) | KEEP — store wiring exception (a public re-export named `cloudFilesReducer` and `cloudFilesRealtimeMiddleware` would let us close even this hole). |

> Two viable strategies for `redux/`: either (a) expose the slice's reducer + middleware as named exports on the public index (one-line change) and close the door entirely, or (b) keep a 3-file allowlist for `lib/redux/{store,entity-store,rootReducer}.ts`. Option (a) is cleaner.

---

### `features/files/handler/` (~43 statements across ~32 files)

Mostly `handler/hooks/useFileUpload` (19 occurrences), then `handler/types` (9), `handler/handler` (6), `handler/hooks/useFileSrc` (3), `handler/utils/python-base` (2), `handler/hooks/useFileAs` (2), and a long single-import tail. All of these are already re-exported via the public index.

| Importing file | Imported names | Recommendation |
| --- | --- | --- |
| `app/(authenticated)/(admin-auth)/administration/feedback/components/FeedbackDetailDialog.tsx` | `useFileUpload`, `imageViewUrl` from `handler/utils/python-base` | MIGRATE `useFileUpload` to public index. `imageViewUrl` needs to be re-exported (or replaced with `useFileSrc`). |
| `features/pdf-demo/components/PdfSourcePicker.tsx` | `useFileUpload` | MIGRATE to public index. |
| `features/cx-chat/components/user-input/ConversationInput.tsx` | `useFileUpload` | MIGRATE. |
| `features/agent-apps/components/inputs/AgentAppImageField.tsx` | `useFileUpload` | MIGRATE. |
| `features/cx-conversation/ConversationInput.tsx` | `useFileUpload` | MIGRATE. |
| `features/resource-manager/resource-picker/UploadResourcePicker.tsx` | `useFileUpload` | MIGRATE. |
| `features/transcripts/components/TranscriptViewer.tsx` | `useFileSrc`, `FileSource` (type) | MIGRATE — both re-exported via public index. |
| `features/transcripts/service/audioStorageService.ts` | `fileHandler` | MIGRATE — `fileHandler` is the canonical re-export. |
| `features/public-chat/components/ChatInputWithControls.tsx` | `useFileUpload`, `NormalizedFile` (type) | MIGRATE. |
| `features/public-chat/components/resource-picker/PublicUploadResourcePicker.tsx` | `useFileUpload`, `NormalizedFile` | MIGRATE. |
| `features/whatsapp-clone/modals/media/MediaTab.tsx` | `useFileSrc` | MIGRATE. |
| `features/agents/components/notifications/ImageArrivalPeek.tsx` | `useFileAs`, `FileSource` | MIGRATE — both re-exported. |
| `features/agents/components/inputs/input-components/MediaVariableInput.tsx` | `useFileUpload`, `useFileSrc` | MIGRATE. |
| `features/agents/components/inputs/smart-input/AgentTextarea.tsx` | `useFileUpload` | MIGRATE. |
| `features/agents/redux/execution-system/instance-resources/resource-source.ts` | `preferIdentityLocator` (from `handler/utils/prefer-locator`), `FileSource`, `NormalizedFile`, `normalize` (from `handler/input/normalize`) | MIGRATE — `FileSource`/`NormalizedFile` via public index. `preferIdentityLocator` and `normalize` are internal utilities; either expose narrow `fileHandler.normalize()` / `fileHandler.preferIdentityLocator()` on the facade, or REPLACE the call sites with the higher-level `fileHandler` ops. |
| `features/code-files/service/s3Service.ts` | `fileHandler` | MIGRATE. |
| `features/window-panels/windows/FeedbackWindow.tsx` | `useFileUpload` | MIGRATE. |
| `features/prompts/components/PromptInput.tsx` | `useFileUpload` | MIGRATE. |
| `features/prompts/components/smart/CompactPromptInput.tsx` | `fileHandler`, `NormalizedFile` | MIGRATE. |
| `features/prompts/components/smart/SmartPromptInput.tsx` | `fileHandler`, `NormalizedFile` | MIGRATE. |
| `features/image-studio/modes/shared/save-edited-image.ts` | `fileHandler`, `pythonShareUrl` from `handler/utils/python-base` | MIGRATE `fileHandler`. `pythonShareUrl` needs either a public re-export or to be wrapped behind `fileHandler.shareUrl()`. |
| `features/image-studio/components/useCropStudioController.ts` | `useFileUpload` | MIGRATE. |
| `features/image-studio/hooks/useBase64Decoder.ts` | `useFileUpload` | MIGRATE. |
| `components/ui/file-upload/ImageUploadField.tsx` | `useFileUpload` | MIGRATE. |
| `components/ui/file-upload/PasteImageHandler.tsx` | `useFileUpload` | MIGRATE. |
| `components/ui/file-upload/FileUploadWithStorage.tsx` | `useFileUpload`, `NormalizedFile` | MIGRATE. |
| `components/mardown-display/blocks/images/ImageOutputBlock.tsx` | `useFileAs`, `FileSource` | MIGRATE. |
| `components/image/cloud/resolveCloudFileUrl.ts` | `fileHandler` | MIGRATE. |
| `components/official/ImageAssetUploader.tsx` | `useFileUpload` | MIGRATE. |
| `components/official/image-cropper/ImageCropper.tsx` | `useFileUpload` | MIGRATE. |

> The handler subdir is the largest migration but also the *cheapest*: most are pure path swaps because the symbols are already re-exported from `@/features/files`. A codemod (`s|@/features/files/handler/hooks/useFileUpload|@/features/files|g`, etc.) would close the bulk in a single PR. The only non-mechanical work is:
> - `imageViewUrl`, `pythonShareUrl` (`handler/utils/python-base`) — need a public-surface decision.
> - `preferIdentityLocator`, `normalize` (`handler/utils/prefer-locator`, `handler/input/normalize`) — need a facade decision.

---

### `features/files/components/` (~39 statements across ~30 files)

Two big buckets: (1) `components/surfaces/PageShell` — used by every `app/(a)/files/**` route (10 importers) — and (2) `components/core/PdfAnnotationLayer` — used by `features/file-analysis/**` (5 importers). Most of the rest are pickers, dialogs, and chip primitives that are already re-exported via the public index.

| Importing file | Imported names | Recommendation |
| --- | --- | --- |
| `app/EntityProviders.tsx` | `CloudFilesPickerHost` | MIGRATE — host should land on public index alongside `CloudFilesRealtimeProvider`. |
| `app/Providers.tsx` | `CloudFilesPickerHost` | MIGRATE — same as above. |
| `app/(a)/files/[[...path]]/page.tsx` | `PageShell` | KEEP or expose. The `/files` routes ARE the Files feature's user-facing surface; either (a) accept them as legitimate co-located route shells and add an allowlist for `app/(a)/files/**`, or (b) re-export `PageShell` on the public index. (a) is cleaner since `PageShell` is feature-specific. |
| `app/(a)/files/activity/page.tsx` | `PageShell` | KEEP (allowlisted) — see above. |
| `app/(a)/files/trash/page.tsx` | `PageShell` | KEEP (allowlisted). |
| `app/(a)/files/shared/page.tsx` | `PageShell` | KEEP (allowlisted). |
| `app/(a)/files/f/[fileId]/page.tsx` | `PageShell` | KEEP (allowlisted). |
| `app/(a)/files/requests/page.tsx` | `PageShell` | KEEP (allowlisted). |
| `app/(a)/files/starred/page.tsx` | `PageShell` | KEEP (allowlisted). |
| `app/(a)/files/recents/page.tsx` | `PageShell` | KEEP (allowlisted). |
| `app/(a)/files/folders/page.tsx` | `PageShell` | KEEP (allowlisted). |
| `app/(a)/files/photos/page.tsx` | `PageShell` | KEEP (allowlisted). |
| `features/image-manager/components/CloudFileMetadataSheet.tsx` | `MediaThumbnail` | MIGRATE — already on public index. |
| `features/pdf-demo/components/PdfSourcePicker.tsx` | `useFilePicker` (hook from `components/pickers/FilePicker`) | MIGRATE — promote `useFilePicker` to public index (or use `FilePicker`). |
| `features/tasks/components/TaskAttachmentsPanel.tsx` | `openFilePicker` (from `CloudFilesPickerHost`) | MIGRATE — `openFilePicker` opener should be on the public index. |
| `features/code/views/explorer/CloudFilesExplorer.tsx` | `FileTree` | MIGRATE — promote `FileTree` to the public index (it's clearly a public composition primitive). |
| `features/code/editor/CloudFilePreviewer.tsx` | `FilePreview` | MIGRATE — already on public index. |
| `features/agents/components/messages-display/user/AgentUserMessage.tsx` | `FileResourceChip` | MIGRATE — needs to be added to public index. |
| `features/agents/components/inputs/resources/SmartAgentResourceChips.tsx` | `FileResourceChip` | MIGRATE — same. |
| `features/window-panels/windows/cloud-files/FilePreviewWindow.tsx` | `PreviewPane` | MIGRATE — promote `PreviewPane` to public index. |
| `features/window-panels/windows/cloud-files/CloudFilesWindow.tsx` | `WindowPanelShell` (multiple) | MIGRATE — promote `WindowPanelShell` to public index (it composes the files window). |
| `features/file-analysis/studio/StudioShell.tsx` | `PdfRegion`, `AnnotationLayerMode` (types) | MIGRATE — promote `PdfAnnotationLayer` types to public index. |
| `features/file-analysis/studio/panels/AnnotationsPanel.tsx` | `colorsFor` | MIGRATE — promote helper. |
| `features/file-analysis/components/AnnotatablePdfCanvas.tsx` | `PdfAnnotationLayer` + types | MIGRATE — promote component + types. |
| `features/image-studio/components/EmbeddedImageStudio.tsx` | `useFilePicker` | MIGRATE. |
| `features/image-studio/components/useCropStudioController.ts` | `openFolderPicker` (from `cloudFilesPickerOpeners`) | MIGRATE — opener helpers belong on the public index. |
| `components/image/cloud/CloudImageList.tsx` | `MediaThumbnail` | MIGRATE — already re-exported. |
| `components/image/cloud/CloudFilesBrowserTable.tsx` | `openFolderPicker`, `FileIcon`, `MediaThumbnail`, `ShareLinkDialog`, `useFileActions`, `useFolderActions` | MIGRATE most. Note: `useFileActions` / `useFolderActions` are not currently on the public index — promote them. |
| `components/image/cloud/CloudImageGrid.tsx` | `MediaThumbnail` | MIGRATE. |
| `components/image/cloud/CloudImagesTab.tsx` | `openFolderPicker` | MIGRATE. |
| `components/image/cloud/CloudUploadTab.tsx` | `openFolderPicker`, `FileUploadDropzone` | MIGRATE — `FileUploadDropzone` is already re-exported. |

> Action items implied:
> 1. Add to the public index: `useFilePicker`, `openFilePicker`, `openFolderPicker` (`CloudFilesPickerHost` + opener helpers), `FileResourceChip`, `PreviewPane`, `WindowPanelShell`, `FileTree`, `PdfAnnotationLayer` (+ types), `useFileActions`, `useFolderActions`.
> 2. Either re-export `PageShell` on the public index OR allowlist `app/(a)/files/**` to import from `features/files/components/surfaces/**`.

---

### `features/files/types` (~30 statements across ~28 files)

Direct imports of the single types file. Every symbol consumed (`AssetPreset`, `Visibility`, `CloudFileRecord`, `MediaRef`, `Asset`, `AssetVariant`, `ShareLinkResolveResponse`) is already re-exported from `@/features/files` via `export type * from "@/features/files/types"`. **Pure path-swap migration** — this is the easiest win after the api ban.

| Importing file | Imported names | Recommendation |
| --- | --- | --- |
| `app/(authenticated)/(admin-auth)/administration/official-components/component-displays/image-asset-uploader.tsx` | `AssetPreset`, `Visibility` | MIGRATE — path swap. |
| `app/(public)/share/[token]/page.tsx` | `ShareLinkResolveResponse` | MIGRATE — path swap. |
| `features/image-manager/components/BrandedUploadTab.tsx` | `AssetPreset` | MIGRATE. |
| `features/image-manager/registry/types.ts` | `Visibility` | MIGRATE. |
| `features/image-manager/components/CloudFileMetadataSheet.tsx` | `CloudFileRecord` | MIGRATE. |
| `features/resource-manager/resource-picker/FilesResourcePicker.tsx` | (multiple) | MIGRATE. |
| `features/whatsapp-clone/hooks/useWhatsAppMedia.ts` | `CloudFileRecord` | MIGRATE. |
| `features/agents/components/settings-management/AgentSettingMediaPicker.tsx` | `MediaRef` | MIGRATE. |
| `features/agents/redux/execution-system/instance-resources/instance-resources.selectors.ts` | `MediaRef` | MIGRATE. |
| `features/agents/redux/execution-system/instance-resources/resource-source.ts` | `MediaRef` | MIGRATE. |
| `features/rag/components/data-stores/CldFilePicker.tsx` | `CloudFileRecord` | MIGRATE. |
| `features/window-panels/windows/image/ImageUploaderWindow.tsx` | `AssetPreset` | MIGRATE. |
| `features/window-panels/windows/image/callbacks.ts` | `AssetPreset` | MIGRATE. |
| `features/window-panels/windows/image/useOpenImageUploaderWindow.ts` | `AssetPreset` | MIGRATE. |
| `features/image-studio/hooks/useImageStudio.ts` | `Visibility` | MIGRATE. |
| `components/ui/file-upload/PasteImageHandler.tsx` | `Visibility` | MIGRATE. |
| `components/ui/file-upload/FileUploadWithStorage.tsx` | `Visibility` | MIGRATE. |
| `components/image/cloud/CloudImageList.tsx` | `CloudFileRecord` | MIGRATE. |
| `components/image/ImageManager.tsx` | `Visibility` | MIGRATE. |
| `components/image/cloud/CloudFilesTab.tsx` | (multiple) | MIGRATE. |
| `components/image/cloud/CloudFilesBrowserTable.tsx` | (multiple) | MIGRATE. |
| `components/image/cloud/cloudFilesBrowserUtils.ts` | (multiple) | MIGRATE. |
| `components/image/cloud/CloudImageGrid.tsx` | `CloudFileRecord` | MIGRATE. |
| `components/image/cloud/CloudImageGrid.test.tsx` | `CloudFileRecord` | KEEP — test file. Either MIGRATE for consistency or allowlist test files. |
| `components/image/cloud/CloudImagesTab.tsx` | `CloudFileRecord`, `Visibility` | MIGRATE. |
| `components/image/cloud/CloudUploadTab.tsx` | `Visibility` | MIGRATE. |
| `components/image/cloud/__tests__/cloudFilesBrowserUtils.test.ts` | (multiple) | KEEP (test) — see above. |
| `components/image/cloud/resolveCloudFileUrl.ts` | `CloudFileRecord` | MIGRATE. |
| `components/official/ImageAssetUploader.tsx` | `Asset`, `AssetPreset`, `AssetVariant`, `Visibility` | MIGRATE. |
| `components/official/ImageAssetUploader.tsx` (export-re-export) | `AssetPreset` | MIGRATE. |

---

### `features/files/utils/` (~49 statements across ~40 files)

Two big sub-buckets:
- **`utils/folder-conventions`** (22 importers) — `CloudFolders`, `folderForOrg`, `folderForTask`, `folderForPodcast`, `folderForAgentApp` — already re-exported from public index.
- **`utils/server-cookies` (10)** + **`utils/server-search-params` (9)** — only consumed by `app/(a)/files/**` server routes. Co-located with the Files feature; either KEEP via allowlist or re-export.
- **`utils/file-types`** (6), **`utils/format`** (2) — formatting / mime helpers, not currently on public index.

| Importing file | Imported names | Recommendation |
| --- | --- | --- |
| `app/api/agent-apps/generate-favicon/route.ts` | `folderForAgentApp` | MIGRATE — public index. |
| `app/(a)/images/library/page.tsx` | `CloudFolders` | MIGRATE — public index. |
| `app/(a)/images/edit/EditShellClient.tsx` | `CloudFolders` | MIGRATE. |
| `app/(a)/files/[[...path]]/page.tsx` | `readSidebarModeCookie`, server-search-params | KEEP — allowlist `app/(a)/files/**`. |
| `app/(a)/files/activity/page.tsx` | server-cookies + server-search-params | KEEP (allowlisted). |
| `app/(a)/files/trash/page.tsx` | server-cookies + server-search-params | KEEP (allowlisted). |
| `app/(a)/files/shared/page.tsx` | server-cookies + server-search-params | KEEP (allowlisted). |
| `app/(a)/files/f/[fileId]/page.tsx` | server-cookies | KEEP (allowlisted). |
| `app/(a)/files/requests/page.tsx` | server-cookies + server-search-params | KEEP (allowlisted). |
| `app/(a)/files/starred/page.tsx` | server-cookies + server-search-params | KEEP (allowlisted). |
| `app/(a)/files/recents/page.tsx` | server-cookies + server-search-params | KEEP (allowlisted). |
| `app/(a)/files/folders/page.tsx` | server-cookies + server-search-params | KEEP (allowlisted). |
| `app/(a)/files/photos/page.tsx` | server-cookies + server-search-params | KEEP (allowlisted). |
| `features/image-manager/components/StudioLibraryTab.tsx` | `CloudFolders` | MIGRATE. |
| `features/image-manager/components/ProfilePhotoTab.tsx` | `CloudFolders` | MIGRATE. |
| `features/image-manager/components/CloudFileMetadataSheet.tsx` | from `utils/format` | MIGRATE — promote `formatFileSize` / `formatRelativeTime` to public index. |
| `features/organizations/components/CreateOrgModal.tsx` | `CloudFolders` | MIGRATE. |
| `features/organizations/components/GeneralSettings.tsx` | `folderForOrg` | MIGRATE — and confirm `folderForOrg` is re-exported (currently only the four listed in index.ts are). |
| `features/resource-manager/resource-picker/ImageUrlResourcePicker.tsx` | `CloudFolders` | MIGRATE. |
| `features/tasks/components/TaskAttachmentsPanel.tsx` | `folderForTask` | MIGRATE. |
| `features/tasks/services/taskService.ts` | `folderForTask` | MIGRATE. |
| `features/prompt-apps/components/PromptAppEditor.tsx` | `CloudFolders` | MIGRATE. |
| `features/code/hooks/useOpenFile.ts` | `getFilePreviewProfile` from `utils/file-types` | MIGRATE — promote to public index. |
| `features/code/editor/BinaryFileViewer.tsx` | from `utils/file-types` | MIGRATE — promote. |
| `features/agents/components/builder/message-builders/AddBlockButton.tsx` | `CloudFolders` | MIGRATE. |
| `features/code-files/service/s3Service.ts` | `CloudFolders` | MIGRATE. |
| `features/applet/builder/modules/applet-builder/CreateAppletTab.tsx` | `CloudFolders` | MIGRATE. |
| `features/podcasts/components/admin/AssetUploader.tsx` | `folderForPodcast` | MIGRATE. |
| `features/canvas/social/ShareCoverImagePicker.tsx` | `CloudFolders` | MIGRATE. |
| `features/audio/services/audioFallbackUpload.ts` | `CloudFolders` | MIGRATE. |
| `features/html-pages/components/HtmlPreviewModal.tsx` | `CloudFolders` | MIGRATE. |
| `features/image-studio/hooks/useImageStudio.ts` | `CloudFolders` | MIGRATE. |
| `features/image-studio/hooks/useBase64Decoder.ts` | `CloudFolders` | MIGRATE. |
| `components/ui/file-upload/PasteImageHandler.tsx` | `CloudFolders` | MIGRATE. |
| `components/ui/file-upload/FileUploadWithStorage.tsx` | `CloudFolders` | MIGRATE. |
| `components/image/cloud/CloudFilesTab.tsx` | from `utils/file-types` | MIGRATE — promote. |
| `components/image/cloud/CloudFilesBrowserTable.tsx` | `formatFileSize`, `formatRelativeTime`, `isImageMime`, `isVideoMime`, `resolveMime` | MIGRATE — promote. |
| `components/image/cloud/cloudFilesBrowserUtils.ts` | from `utils/file-types` | MIGRATE. |
| `components/image/cloud/CloudImagesTab.tsx` | `isImageMime`, `resolveMime` | MIGRATE. |

> Action items:
> 1. Add `folderForOrg` to the explicit re-export list in `features/files/index.ts` (the only one missing from the four currently listed).
> 2. Promote `utils/file-types` helpers (`isImageMime`, `isVideoMime`, `resolveMime`, `getFilePreviewProfile`) and `utils/format` (`formatFileSize`, `formatRelativeTime`) to the public index.
> 3. Allowlist `app/(a)/files/**` for `utils/server-cookies` and `utils/server-search-params` (these are co-located route helpers).

---

### `features/files/hooks/` (5 importers)

The legacy hooks layer. Most are already re-exported from `@/features/files`. Pure path swap.

| Importing file | Imported names | Recommendation |
| --- | --- | --- |
| `features/pdf-demo/components/PdfWorkbench.tsx` | `useCloudTree` | MIGRATE — already on public index. |
| `features/resource-manager/resource-picker/FilesResourcePicker.tsx` | `useCloudTree` | MIGRATE. |
| `features/whatsapp-clone/modals/media/MediaTab.tsx` | `useInfiniteWindow` | MIGRATE — needs to be added to the public index (not currently re-exported). |
| `features/pdf-extractor/studio/PdfStudioReader.tsx` | `useFileBlob` (legacy) | MIGRATE — but verify which `useFileBlob` is intended. There are TWO: `hooks/useFileBlob` (legacy) and `handler/hooks/useFileBlob` (canonical, exported via index). Likely needs REPLACE with the handler one. |
| `components/image/cloud/CloudFilesTab.tsx` | `useFolderContents` | MIGRATE — already on public index. |

---

### `features/files/upload/` (2 importers)

| Importing file | Imported names | Recommendation |
| --- | --- | --- |
| `app/Providers.tsx` | `UploadGuardHost` | MIGRATE — re-export `UploadGuardHost` on the public index (it's already mounted in `Providers.tsx` and `CloudFilesRealtimeProvider` is already exported from `providers/`). |
| `features/tasks/components/TaskAttachmentsPanel.tsx` | `requestUpload` (from `uploadGuardOpeners`) | MIGRATE — promote `requestUpload` opener to public index (or wrap in `useFileUpload({guard:true})`). |

(Note: `upload/cloudUpload` is already explicitly banned in `eslint.config.mjs` via `deletedFileHooksRestriction.paths`.)

---

### `features/files/providers/` (1 importer)

| Importing file | Imported names | Recommendation |
| --- | --- | --- |
| `app/Providers.tsx` | `CloudFilesRealtimeProvider` | MIGRATE — already re-exported from public index. Trivial path swap. |

---

### `features/files/cache/`, `features/files/virtual-sources/` (0 external importers)

Already internal. Add the deny patterns now — zero migration work needed.

---

## Quick wins (≤5 external importers per subdir)

These are the easiest first targets — flip the ESLint rule on these and the codebase already complies (or is one path swap away).

1. **`cache/`** — 0 external importers. **Ban now.**
2. **`virtual-sources/`** — 0 external importers. **Ban now.**
3. **`providers/`** — 1 importer (`app/Providers.tsx`), path-swap-only. **Migrate then ban.**
4. **`upload/`** — 2 importers, 1 needs a public re-export of `UploadGuardHost`, 1 needs `requestUpload` promoted (or a guard option on `useFileUpload`). **Migrate then ban.**
5. **`hooks/`** — 5 importers, 4 are path swaps. The one with ambiguity is `PdfStudioReader.tsx` (legacy vs. handler `useFileBlob`). **Migrate then ban.**

## Big migrations needed

These need a coordinated sweep before the ESLint rule can land cleanly.

1. **`utils/` (49 importers)** — most is `CloudFolders` (path swap, ~22 sites) but the `app/(a)/files/**` server-side cookies/search-params need an allowlist or public re-export, and `utils/file-types` + `utils/format` helpers need to be promoted to the public index.
2. **`handler/` (43)** — mostly mechanical (codemod-able). The only judgment calls are `python-base` (`imageViewUrl`, `pythonShareUrl`) and `prefer-locator`/`input/normalize` (internal handler utilities currently leaking).
3. **`components/` (39)** — non-trivial because a handful of legitimate composition primitives are not yet on the public index: `useFilePicker`, `openFilePicker`, `openFolderPicker` (opener helpers), `FileResourceChip`, `PreviewPane`, `WindowPanelShell`, `FileTree`, `PdfAnnotationLayer` (+ types), `useFileActions`, `useFolderActions`, `CloudFilesPickerHost`. Plus the `PageShell` decision (re-export vs. allowlist `app/(a)/files/**`).
4. **`types` (30)** — pure path swap; can be a single codemod PR.
5. **`redux/` (30)** — needs design choice. Either expose `cloudFilesReducer` + `cloudFilesRealtimeMiddleware` as named public exports (closes the store-wiring hole), or keep an explicit 3-file allowlist for `lib/redux/{store,entity-store,rootReducer}.ts`. The other 27 redux/selectors/thunks importers should be REPLACED with public hooks (most already exist).
6. **`api/` (16)** — already banned in ESLint, but the violations still exist. Needs the largest *behavioral* change: most need to be replaced with `useFileUpload` / `fileHandler` rather than path-swapped.

---

## Suggested ESLint patterns to add

Each pattern below matches the shape of the existing `windowPanelsImportRestriction.patterns` entries in `eslint.config.mjs` and can be appended to that array. Ranked easiest → hardest to enable in production.

### Tier 1 — flip immediately, no codebase changes needed

```js
{
    group: ['@/features/files/cache', '@/features/files/cache/*'],
    message:
        'Do not import from features/files/cache — it is internal. The IDB cache layer is wired into useFileBlob; use useFileBlob from @/features/files.',
},
{
    group: ['@/features/files/virtual-sources', '@/features/files/virtual-sources/*'],
    message:
        'Do not import from features/files/virtual-sources — internal RAG / agent shortcuts source adapters. They are registered automatically; consume them via fileHandler.',
},
```

### Tier 2 — small sweep then enable

```js
{
    group: ['@/features/files/providers', '@/features/files/providers/*'],
    message:
        'Do not import from features/files/providers — use CloudFilesRealtimeProvider from @/features/files. The provider is wired in app/Providers.tsx.',
},
{
    group: ['@/features/files/upload', '@/features/files/upload/*'],
    message:
        'Do not import from features/files/upload — use useFileUpload from @/features/files. UploadGuardHost is mounted in app/Providers.tsx via the public surface.',
},
{
    group: ['@/features/files/hooks', '@/features/files/hooks/*'],
    message:
        'Do not import legacy data-layer hooks directly — use the equivalents re-exported from @/features/files (useCloudTree, useFolderContents, useFileAsset, useFileDocument, useFileSearch, useFileSelection, useStorageQuota, etc.).',
},
```

### Tier 3 — medium sweep then enable

```js
{
    group: ['@/features/files/types'],
    message:
        'Import types from @/features/files (the public surface re-exports the entire type module via `export type *`).',
},
{
    group: ['@/features/files/utils', '@/features/files/utils/*'],
    message:
        'Do not import from features/files/utils — use the equivalent re-exports from @/features/files (CloudFolders, folderFor*, formatFileSize, isImageMime, etc.). Server-only helpers may need an allowlist for app/(a)/files/**.',
},
```

> Pair the `utils/` ban with an allowlist override block for `app/(a)/files/**`:
>
> ```js
> {
>     files: ['app/(a)/files/**/*'],
>     rules: {
>         // Files routes legitimately co-locate with the Files feature
>         // and import server-only helpers (server-cookies, server-search-params).
>         'no-restricted-imports': 'off',
>     },
> },
> ```

### Tier 4 — large sweep + design decisions

```js
{
    group: ['@/features/files/handler', '@/features/files/handler/*'],
    message:
        'Do not import handler internals — use the public surface (@/features/files) which re-exports fileHandler, useFile, useFileAs, useFileSrc, useFileBlob, useFileUpload, and all handler types.',
},
{
    group: ['@/features/files/components', '@/features/files/components/*'],
    message:
        'Do not import component internals — use the public surface (@/features/files) which re-exports the canonical render / picker / dialog set. If your component is missing from the index, promote it instead of importing internally.',
},
{
    group: ['@/features/files/redux', '@/features/files/redux/*'],
    message:
        'Do not import slice/selectors/thunks directly — use public hooks (useFile, useCloudTree, useFolderContents) and converters re-exported from @/features/files. Store wiring (cloudFilesReducer / cloudFilesRealtimeMiddleware) goes through named public exports.',
},
```

> The handler/components/redux bans together close the door once the migration items listed in "Big migrations needed" land.
