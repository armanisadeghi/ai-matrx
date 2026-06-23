# Impact inventory — read path

Scope: every component, page, route, or hook that **renders or displays file bytes / URLs / thumbnails** in matrx-frontend, mapped onto the v2 consolidation plan in [`docs/FILE_HANDLING_CONSOLIDATION_PLAN.md`](./FILE_HANDLING_CONSOLIDATION_PLAN.md). Upload/mutate paths are explicitly out of scope (separate inventory).

Action vocabulary:
- **DELETE** — file ceases to exist after PR3 (legacy hook source, duplicate component, or call site whose surface goes away).
- **MODIFY** — file stays but imports/internals change (switch from `useSignedUrl`/`useFileSrc`/`useFileAsset`/`useFileBlob`/direct fetch to `useFile` / `useFileBlob` / `<InlineMediaRef>` / `<FilePreview>`).
- **KEEP** — file stays unchanged.

---

## Summary

| Action | Count |
|---|---|
| DELETE | 19 |
| MODIFY | 96 |
| KEEP | 19 |
| **Total** | **134** |

---

## By directory

- **`features/file-handler/`** — entire directory DELETED (folds into `features/files/`). 21 files.
- **`features/files/hooks/`** — 4 hooks DELETED (`useSignedUrl`, `useFileAsset`, `useFileDocument`, plus `blob-cache.ts` folds into `cache/`), 3 MODIFIED (`useFileBlob`, `useCloudTree`, `useFolderContents` unaffected, only blob hook listed).
- **`features/files/components/core/FilePreview/`** — orchestrator + 10 previewers all MODIFIED to consume `useFile`+`useFileBlob`; FilePreview registry refactor lands in same PR.
- **`features/files/components/core/MediaThumbnail/`** — single read-path component; MODIFIED to use `useFile(ref, { variantKey: "thumbnail_url" })`.
- **`features/files/components/surfaces/`** — preview pane + mobile stack + desktop grid/table cells + tabs (`DocumentTab`, `FileInfoTab`, `FileLineageChip`, `FileShareTab`) all MODIFIED.
- **`features/files/utils/`** — `resolveRenderableImageUrl.ts` + test DELETED (folded into resolver).
- **`features/files/virtual-sources/`** — adapters KEEP (path-only); CodeInlinePreview/NotesInlinePreview render text, not file bytes — KEEP.
- **`features/agents/`** — `useAiImageUrl.ts` DELETED; message-display components MODIFIED.
- **`features/cx-chat/`, `features/cx-conversation/`** — user/assistant message renderers MODIFIED to `<InlineMediaRef>`.
- **`features/podcasts/`** — admin tables + player pages MODIFIED to `<InlineMediaRef>` and `useFile`.
- **`features/organizations/`** — logo/avatar display surfaces MODIFIED.
- **`features/image-manager/`** — ProfilePhotoTab + PublicImagesSection + CloudFileMetadataSheet MODIFIED.
- **`features/rag/`** — DocumentViewer + panes (PdfPane, CleanedMarkdownPane, RawTextPane, ChunksPane) + Library viewers MODIFIED.
- **`features/transcripts/`** — TranscriptViewer MODIFIED.
- **`features/whatsapp-clone/`** — MediaTab + useWhatsAppMedia MODIFIED.
- **`features/pdf-extractor/`, `features/pdf-demo/`, `features/file-analysis/`** — PDF viewer surfaces MODIFIED.
- **`features/code/`** — BinaryFileViewer + BinaryFilePdfPreview + CloudFilePreviewer + EditorArea + useOpenFile MODIFIED.
- **`features/image-studio/`** — variant tile + embedded studio + annotate shell MODIFIED (display side only).
- **`features/html-pages/`** — SavePageTab + markdown-wordpress-utils MODIFIED.
- **`features/agent-apps/`** — Overview + Settings tabs MODIFIED (icon/cover display).
- **`features/artifacts/`** — CmsArtifactDetail MODIFIED.
- **`features/tasks/`** — TaskAssigneePicker + TaskAttachments MODIFIED (avatar display only).
- **`components/image/cloud/`** — `resolveCloudFileUrl.ts` DELETED; ImageStudioTab DELETED (image-manager replacement); browse table + grid + list MODIFIED; CloudUploadTab + CloudFilesTab + CloudImagesTab — uploads OUT of scope, display portions MODIFIED.
- **`components/image/shared/`** — ImageGrid, ImagePreviewRow, ImageManagerIcon, SingleImageSelect MODIFIED.
- **`components/mardown-display/blocks/`** — image/video/audio/artifact blocks MODIFIED to resolve `MediaRef` via `useFile`.
- **`components/official/`** — image-cropper + ImageAssetUploader (display preview tile) MODIFIED.
- **`components/admin/`** — AppletConfigViewer MODIFIED (preview only).
- **`features/window-panels/windows/cloud-files/`** — FilePreviewWindow MODIFIED.
- **`features/window-panels/windows/`** — FeedbackWindow display portion MODIFIED.
- **`app/(public)/share/[token]/`** — MODIFIED (use `useFile` with share-token ref).
- **`app/(dev)/demos/`** — debug + render-thumbnail demos MODIFIED.

---

## Files (full inventory)

### features/file-handler/  (entire directory DELETED — merged into features/files/)

| File | Lines | Current behavior | Action | What changes / where it goes |
|---|---|---|---|---|
| features/file-handler/handler.ts | 107 | `fileHandler.use(...).as(...)` builder facade | DELETE | replaced by `fileHandler` facade in `features/files/handler.ts` (no builder; `upload/resolve/mutate/refresh`) |
| features/file-handler/resolver.ts | 223 | hydrate + access decision + URL mint | DELETE | folded into `features/files/resolver/resolve.ts` |
| features/file-handler/upload.ts | 261 | upload path | DELETE | (out of read scope; replaced by `features/files/upload/upload.ts`) |
| features/file-handler/types.ts | 393 | FileSource/NormalizedFile/FileTarget/MediaBlock | DELETE | split into `features/files/types/{domain,api,ui}.ts` |
| features/file-handler/errors.ts | — | typed errors | DELETE | folded into `features/files/errors.ts` |
| features/file-handler/intelligence/refresh.ts | 49 | mint+refresh | DELETE | folded into `features/files/resolver/refresh.ts` |
| features/file-handler/intelligence/access.ts | 121 | owner/visibility/perm decision | DELETE | moves to `features/files/resolver/access.ts` |
| features/file-handler/intelligence/expiry-wheel.ts | 98 | global signed-URL refresh timer | DELETE | moves to `features/files/cache/expiry-wheel.ts` (kept as-is) |
| features/file-handler/intelligence/magic-bytes.ts | 103 | MIME sniff | DELETE | moves to `features/files/resolver/magic-bytes.ts` |
| features/file-handler/input/normalize.ts | 510 | FileSource → NormalizedFile (16 variants) | DELETE | folded into `features/files/resolver/normalize.ts` |
| features/file-handler/output/target.ts | 272 | NormalizedFile → FileTarget (11 variants) | DELETE | folded into `features/files/resolver/target.ts` |
| features/file-handler/utils/python-base.ts | 201 | BACKEND_URL helpers, /files/{id}/download, /share/{token} URL builders | DELETE | moves into `features/files/client/` |
| features/file-handler/utils/prefer-locator.ts | 60 | choose fileId vs URL | DELETE | moves to `features/files/resolver/prefer-locator.ts` |
| features/file-handler/utils/classify.ts | 35 | classify source kind | DELETE | folded into resolver |
| features/file-handler/hooks/useFile.ts | 121 | generic resolve hook | DELETE | replaced by the new Redux-first `features/files/hooks/useFile.ts` |
| features/file-handler/hooks/useFileSrc.ts | 18 | `<img src>` URL | DELETE | replaced by `features/files/hooks/useFileSrc.ts` (thin wrapper over `useFile`) |
| features/file-handler/hooks/useFileBlob.ts | 18 | bytes (delegates to features/files/useFileBlob) | DELETE | redundant after merge — `features/files/hooks/useFileBlob.ts` is the single one |
| features/file-handler/hooks/useFileMediaBlock.ts | 20 | AI message block | DELETE | no external consumers — fold into resolver target adapter |
| features/file-handler/hooks/useFileDownloadUrl.ts | 26 | `<a download>` URL | DELETE | folded into `useFile(ref, { target: "download" })` |
| features/file-handler/hooks/useFileAs.ts | 75 | generic FileTarget switch | DELETE | folded into `useFile` target option |
| features/file-handler/hooks/useFileUpload.ts | 77 | upload (out of read scope) | DELETE | (write path) |

### features/files/hooks/  (4 DELETE, 3 MODIFY, 8 KEEP)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/hooks/useSignedUrl.ts | 106 | per-file signed-URL fetch + refresh | DELETE | replaced by `useFile(ref, { target: "render" }).url` |
| features/files/hooks/useFileAsset.ts | 154 | `/files/{id}/asset` fetch + variants | DELETE | folded into `useFile(ref, { variantKey })` — Redux-first via `assetsByMasterId` |
| features/files/hooks/useFileDocument.ts | 92 | text-document fetch (folds into useFileBlob) | DELETE | folded into `useFileBlob` |
| features/files/hooks/blob-cache.ts | 153 | in-memory blob LRU | DELETE-relocate | moves to `features/files/cache/blob-lru.ts`; semantics preserved |
| features/files/hooks/useFileBlob.ts | 185 | bytes with cache | MODIFY | new path: mem LRU → IndexedDB → SW → network; signature stable |
| features/files/hooks/useFileNode.ts | — | folder/file metadata | KEEP | tree-only, no byte rendering |
| features/files/hooks/useFolderContents.ts | — | list a folder | KEEP | |
| features/files/hooks/useCloudTree.ts | — | tree state | KEEP | |
| features/files/hooks/useFileSelection.ts | — | selection state | KEEP | |
| features/files/hooks/useFileSearch.ts | — | search | KEEP | |
| features/files/hooks/useInfiniteWindow.ts | — | virtualization | KEEP | |
| features/files/hooks/useSharing.ts | — | share-link mutation | KEEP | (write path, OOS for read inventory) |
| features/files/hooks/useStorageQuota.ts | — | quota | KEEP | |
| features/files/hooks/useGuardedFileUpload.ts | — | guarded upload | KEEP | (write path) |

NEW hooks in `features/files/hooks/` introduced by PR3: `useFile.ts`, `useFileSrc.ts`, `useFileMutation.ts` (plus existing `useFileBlob.ts` and `useFileUpload.ts`).

### features/files/components/core/FilePreview/  (orchestrator + 10 previewers — all MODIFY)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/components/core/FilePreview/FilePreview.tsx | 404 | registry-by-mime; uses `useSignedUrl` + `useFileAsset` to choose url; 404-line switch | MODIFY | switch to `useFile(ref, { variantKey })`; FilePreview registry refactor (per plan §6.3 internal-split) lands in same PR |
| features/files/components/core/FilePreview/previewers/PdfPreview.tsx | 87 | wraps PdfDocumentRenderer; receives `url` prop from FilePreview | MODIFY | accept `ref` instead of `url`; resolve via `useFile`; pass to PdfDocumentRenderer's `{ kind: "remote", url, httpHeaders }` |
| features/files/components/core/FilePreview/previewers/PdfDocumentRenderer.tsx | 616 | react-pdf renderer | MODIFY | accept `httpHeaders` + `rangeChunkSize: 65536`; local pdfjs worker copy from `/public/pdfjs-worker.min.mjs` |
| features/files/components/core/FilePreview/previewers/ImagePreview.tsx | 68 | `<img src={url}>` | MODIFY | use `useFile(ref, { variantKey: "hero_url" \|\| "primary" })`; emit `<InlineMediaRef ref={ref} />` |
| features/files/components/core/FilePreview/previewers/VideoPreview.tsx | 47 | `<video src={url}>` | MODIFY | swap to ref-based resolve via `useFile` |
| features/files/components/core/FilePreview/previewers/AudioPreview.tsx | 442 | `<audio src={url}>` + waveform UI | MODIFY | ref-based via `useFile`; bytes via `useFileBlob` for waveform |
| features/files/components/core/FilePreview/previewers/SvgPreview.tsx | 234 | fetches blob; renders SVG inline | MODIFY | use new `useFileBlob` (cache-aware); drop direct fetch |
| features/files/components/core/FilePreview/previewers/CodePreview.tsx | 278 | fetches bytes; syntax-highlight | MODIFY | new `useFileBlob`; remove direct fetch |
| features/files/components/core/FilePreview/previewers/DataPreview.tsx | 531 | XLSX/CSV via blob | MODIFY | new `useFileBlob` |
| features/files/components/core/FilePreview/previewers/MarkdownPreview.tsx | 160 | text blob | MODIFY | new `useFileBlob` |
| features/files/components/core/FilePreview/previewers/TextPreview.tsx | 150 | text blob | MODIFY | new `useFileBlob` |
| features/files/components/core/FilePreview/previewers/GenericPreview.tsx | 176 | fallback "download me" view | MODIFY | use `useFile(ref, { target: "download" }).url` |
| features/files/components/core/FilePreview/PreviewerActionBar/PreviewerActionBar.tsx | 127 | wraps preview actions | KEEP | action bar is write/nav-side; no read-path change needed |
| features/files/components/core/FilePreview/FileFetchProgress.tsx | 101 | progress overlay during fetch | MODIFY | wire to new `useFileBlob` progress contract |
| features/files/components/core/FilePreview/preview-actions.ts | — | builds action handlers | KEEP | |

### features/files/components/core/MediaThumbnail/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/components/core/MediaThumbnail/MediaThumbnail.tsx | 261 | composes `useSignedUrl` + `useFileAsset` + direct `file.publicUrl`; image/video/backend-thumb/icon strategies | MODIFY | becomes a thin wrapper over `<InlineMediaRef ref size="thumb" />` (which resolves via `useFile` Redux-first w/ `variantKey: "thumbnail_url"`); keeps the strategy registry for video-poster + backend-thumb |

### features/files/components/surfaces/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/components/surfaces/PreviewPane.tsx | 784 | hosts FilePreview; uses `useFileAsset` for action-bar URLs | MODIFY | switch internal asset reads to `useFile`; uses Redux-first asset slice |
| features/files/components/surfaces/MobileStack.tsx | 645 | mobile drawer; wraps FilePreview | MODIFY | propagate ref instead of fileId where applicable |
| features/files/components/surfaces/PreviewErrorBoundary.tsx | 157 | error boundary; references `useSignedUrl` retry | MODIFY | retry path goes through `useFile.refresh()` |
| features/files/components/surfaces/PageShell.tsx | — | full-page shell | KEEP | per plan: internal split happens but read-path unchanged |
| features/files/components/surfaces/EmbeddedShell.tsx | — | embedded shell | KEEP | |
| features/files/components/surfaces/WindowPanelShell.tsx | — | window-panel shell | KEEP | |
| features/files/components/surfaces/PickerShell.tsx | — | picker shell | KEEP | |
| features/files/components/surfaces/DocumentTab.tsx | 339 | tab; uses `useFileBlob` to render extracted text | MODIFY | cache-aware `useFileBlob`; same signature |
| features/files/components/surfaces/FileInfoTab.tsx | 433 | tab; pulls Asset metadata via `useFileAsset` | MODIFY | use `useFile` Redux-first |
| features/files/components/surfaces/FileLineageChip.tsx | 93 | chip; resolves parent file via `useFileAsset` | MODIFY | use `useFile` |
| features/files/components/surfaces/FileShareTab.tsx | 414 | tab; renders avatars and signed share URLs (image refs to file) | MODIFY | avatars via `<InlineMediaRef>` |
| features/files/components/surfaces/FilesUrlSync.tsx | — | URL state | KEEP | |
| features/files/components/surfaces/OnboardingEmptyState.tsx | — | empty state UI | KEEP | |
| features/files/components/surfaces/useFileShortcuts.ts | — | uses `useFileSrc` for copy-URL action | MODIFY | swap to `useFile(...).url` |
| features/files/components/surfaces/desktop/FileGridCell.tsx | 391 | grid cell; renders MediaThumbnail | MODIFY | MediaThumbnail's downstream API change ripples here; pass `ref` not `file` |
| features/files/components/surfaces/desktop/FileTableRow.tsx | 729 | table row; renders MediaThumbnail | MODIFY | same as above |
| features/files/components/surfaces/desktop/FileGrid.tsx | 298 | grid host | KEEP | |
| features/files/components/surfaces/desktop/FileTable.tsx | — | host | KEEP | per plan: refactor to TanStack lands same PR but is structural, not read-path |
| features/files/components/surfaces/desktop/* (BulkActionsBar, ColumnHeader, ColumnSettings, ContentHeader, EmptyState, FileTypeBadge, FilterChips, FolderIconWithMembers, IconRail, KindFilter, NavSidebar*, NewMenu, OwnerCell, OwnerFilterPicker, RagFilterPicker, RagStatusCell, SharedAvatarStack, SidebarModeToggle, StorageQuotaChip, TopBar, TypeFilterPicker, ViewModeToggle, AccessBadge, ActiveColumnFilters) | — | desktop chrome — no file bytes/URLs displayed | KEEP | (22 files) |

### features/files/components/core/  (chip / badges / editor / tree / context-menus / dialogs)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/components/core/FileChip/FileChip.tsx | 188 | chip shows icon + name; no bytes rendered | KEEP | (icon-only) |
| features/files/components/core/FileBadges/FileRagBadge.tsx | 95 | RAG state badge; uses `useFileBlob`? | MODIFY | grep shows `useFileBlob` import — verify; otherwise KEEP |
| features/files/components/core/FileEditor/CloudFileEditor.tsx | 330 | edits text body; uses `useFileBlob` for initial read | MODIFY | cache-aware `useFileBlob` |
| features/files/components/core/FileEditor/CloudFileInlineEditor.tsx | 296 | inline editor variant; `useFileBlob` | MODIFY | cache-aware `useFileBlob` |
| features/files/components/core/FileVersions/FileVersionsList.tsx | 321 | version list; uses signed URLs for "view this version" | MODIFY | `useFile(ref, { version })` |
| features/files/components/core/FileTree/FileTreeRow.tsx | — | tree row; icon only | KEEP | |
| features/files/components/core/FileContextMenu/FileContextMenu.tsx | — | context-menu actions; references URL helpers | MODIFY | swap to `useFile` for any preview/copy-URL actions |
| features/files/components/core/RowContextMenu/RowContextMenu.tsx | — | same | MODIFY | |
| features/files/components/core/FileMeta/FileMeta.tsx | — | meta display | KEEP | |
| features/files/components/core/FileIcon/FileIcon.tsx | — | icon | KEEP | |
| features/files/components/core/FileActions/useFileActions.ts | — | builds actions incl. preview/download URLs | MODIFY | use `useFile` |
| features/files/components/core/FileInfo/* | — | info popovers | KEEP | |
| features/files/components/core/FileBreadcrumbs/* | — | breadcrumbs | KEEP | |
| features/files/components/core/FileList/* | — | list shell | KEEP | |
| features/files/components/core/FileUploadDropzone/* | — | upload | KEEP | (write path) |
| features/files/components/core/DuplicateUploadDialog/* | — | dialog | KEEP | (write path) |
| features/files/components/core/PermissionsDialog/* | — | write path | KEEP | |
| features/files/components/core/RenameDialog/* | — | write path | KEEP | |
| features/files/components/core/ShareLinkDialog/ShareLinkDialog.tsx | — | renders share URL; uses fileHandler facade | MODIFY | use new facade |
| features/files/components/core/Tooltip/* | — | tooltip | KEEP | |
| features/files/components/core/PdfAnnotationLayer/* | — | annotation layer for PDF | MODIFY | follows PdfDocumentRenderer's ref change |

### features/files/components/preview/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/components/preview/FileResourceChip.tsx | 234 | chip; renders MediaThumbnail | MODIFY | follows MediaThumbnail's API change |
| features/files/components/preview/openFilePreview.ts | 49 | imperative opener | KEEP | path-only, no read-path bytes |

### features/files/utils/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/utils/resolveRenderableImageUrl.ts | 287 | URL chooser: `publicUrl ?? metadata.cdn_url ?? signedUrl ?? ...` | DELETE | folded into `features/files/resolver/resolve.ts` (handler owns the URL choice) |
| features/files/utils/resolveRenderableImageUrl.test.ts | — | tests | DELETE | (with the impl) |
| features/files/utils/file-types.ts | — | preview profile registry | KEEP | (referenced by MediaThumbnail strategy table) |
| features/files/utils/preview-capabilities.ts | — | mime→capability map | KEEP | |
| features/files/utils/* (format, mime, path, icon-map, url-state) | — | helpers | KEEP | |

### features/files/api/ + features/files/redux/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/api/assets.ts | — | `/files/{id}/asset` fetch | MODIFY-or-DELETE | replaced by generated client from `types/python-generated/api-types.ts`; legacy file removed |
| features/files/api/files.ts | — | get/list/download URL helpers | MODIFY | regenerated from OpenAPI |
| features/files/api/server-client.ts | — | SSR helpers | DELETE | (per plan §6.3) — no callers post-Sharp deletion |
| features/files/api/client.ts | — | shared fetch | MODIFY | regenerated |
| features/files/redux/converters.ts | — | MediaRef builders (4 fns) | KEEP | ESLint-fenced — the only sanctioned MediaRef construction path |
| features/files/redux/thunks.ts | — | `getSignedUrl`, `getFileAsset` thunks | MODIFY | split by domain (per plan); read-side thunks fold into `assetsByMasterId` cache |
| features/files/redux/virtual-thunks.ts | — | virtual-source signed-URL fetch | MODIFY | virtual sources keep their adapters; URL flow goes through resolver |
| features/files/redux/slice.ts | — | adds `assetsByMasterId` | MODIFY | |
| features/files/types.ts | — | monolithic types (1300 lines) | MODIFY | split into `types/{domain,api,ui}.ts`; hand-authored Asset types DELETED (regenerated from OpenAPI) |

### features/files/virtual-sources/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/virtual-sources/types.ts | 341 | references `publicUrl` shape | MODIFY | follow `Asset` envelope; small touch |
| features/files/virtual-sources/errors.ts | 47 | URL-bearing errors | MODIFY | |
| features/files/virtual-sources/adapters/CodeInlinePreview.tsx | 246 | inline text preview for code virtual source — renders code text, not file bytes | KEEP | |
| features/files/virtual-sources/adapters/NotesInlinePreview.tsx | 220 | inline text preview for notes — text, not bytes | KEEP | |
| features/files/virtual-sources/adapters/aga-apps.ts | 176 | path-only | KEEP | |
| features/files/virtual-sources/adapters/code-files.ts | 387 | path-only | KEEP | |
| features/files/virtual-sources/adapters/notes.ts | 343 | path-only | KEEP | |
| features/files/virtual-sources/adapters/prompt-apps.ts | 164 | path-only | KEEP | |
| features/files/virtual-sources/adapters/tool-ui-components.ts | 242 | path-only | KEEP | |
| features/files/virtual-sources/adapt-library-source.ts | 109 | adapt RAG library row | KEEP | |
| features/files/virtual-sources/path.ts | 98 | path utils | KEEP | |
| features/files/virtual-sources/registry.ts | 37 | registry | KEEP | |
| features/files/virtual-sources/registerBuiltinVirtualSources.ts | 21 | bootstrap | KEEP | |

### features/agents/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/agents/hooks/useAiImageUrl.ts | 252 | bespoke hook: builds image URL from AI image record | DELETE | replaced by `useFile(mediaRef)` — record exposes a MediaRef directly |
| features/agents/components/notifications/ImageArrivalPeek.tsx | 194 | consumes `useAiImageUrl` to peek a new image | MODIFY | swap to `<InlineMediaRef ref={mediaRef} />` |
| features/agents/components/notifications/useImageArrivalPeeks.ts | — | hook coordinator | KEEP | |
| features/agents/components/messages-display/user/AgentUserMessage.tsx | 654 | renders user message: attached images via `<img src={publicUrl ?? signedUrl}>` | MODIFY | `<InlineMediaRef ref={mediaRef} />` |
| features/agents/components/inputs/input-components/MediaVariableInput.tsx | 326 | display side of media variable (chip + thumb); uses `useFileSrc` + `useFileBlob` | MODIFY | `useFile` + `<InlineMediaRef>` |
| features/agents/components/inputs/smart-input/AgentTextarea.tsx | — | textarea; image paste display | MODIFY | display side switches to `<InlineMediaRef>` (upload path OOS) |
| features/agents/components/builder/message-builders/AddBlockButton.tsx | 744 | builder UI; shows file refs | MODIFY | display via `<InlineMediaRef>` |
| features/agents/components/tools-management/AgentToolsManager.tsx | 3757 | many file references in UI | MODIFY | display via `<InlineMediaRef>` |
| features/agents/redux/execution-system/instance-resources/resource-source.ts | 114 | resource-coercion (mostly write-side); imports from file-handler | MODIFY | retarget import to `@/features/files` after merge |

### features/cx-chat/ + features/cx-conversation/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/cx-chat/components/messages/AssistantMessage.tsx | 297 | renders assistant message; `<img src>` for inline images | MODIFY | `<InlineMediaRef>` |
| features/cx-chat/components/messages/UserMessage.tsx | 373 | renders user message; `<img src>` for attached images | MODIFY | `<InlineMediaRef>` |
| features/cx-chat/components/sidebar/SidebarUserFooter.tsx | 68 | avatar `<img src>` | MODIFY | `<InlineMediaRef>` or `<Avatar>` wrapper |
| features/cx-conversation/AssistantMessage.tsx | 297 | parallel assistant message renderer (legacy?) | MODIFY | `<InlineMediaRef>` |

### features/podcasts/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/podcasts/components/admin/PodcastsTable.tsx | 332 | admin table; `<img src={image_url}>` for show covers | MODIFY | `<InlineMediaRef ref={coverMediaRef} variantKey="cover_url" />` |
| features/podcasts/components/admin/ShowDetailClient.tsx | 388 | admin detail; cover image | MODIFY | `<InlineMediaRef>` |
| features/podcasts/components/admin/ShowsClient.tsx | 315 | admin grid; covers | MODIFY | `<InlineMediaRef>` |
| features/podcasts/components/player/PodcastShowPage.tsx | 189 | public show cover | MODIFY | `<InlineMediaRef>` |
| features/podcasts/components/player/PodcastEpisodePage.tsx | 209 | episode cover + `<audio>` element | MODIFY | `<InlineMediaRef>` for cover, `useFile(audioRef)` for audio src |
| features/podcasts/components/player/PodcastAudioPlayer.tsx | 488 | the audio player; reads `audio_url` | MODIFY | resolve via `useFile(audioRef).url`; consume from `assetsByMasterId` |
| features/podcasts/components/admin/PodcastDetailPanel.tsx | 160 | panel; cover | MODIFY | `<InlineMediaRef>` |
| features/podcasts/components/admin/EpisodeDetailClient.tsx | 119 | episode detail | MODIFY | `<InlineMediaRef>` |
| features/podcasts/components/admin/PodcastForm.tsx | 719 | form; cover preview | MODIFY | preview tile via `<InlineMediaRef>` |
| features/podcasts/components/admin/AssetUploader.tsx | 276 | upload + preview | MODIFY | preview tile via `<InlineMediaRef>` (upload path OOS) |
| features/podcasts/components/admin/PodcastsContainer.tsx | 176 | container | KEEP | |

### features/organizations/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/organizations/components/GeneralSettings.tsx | 379 | org logo `<img src={publicUrl ?? signed}>` | MODIFY | `<InlineMediaRef ref={logoRef} variantKey="logo_md" />` |
| features/organizations/components/OrgEmailTab.tsx | 242 | preview emails with `<img src>` for logo | MODIFY | `<InlineMediaRef>` |
| features/organizations/components/OrgSidebar.tsx | 184 | sidebar logo | MODIFY | `<InlineMediaRef>` |
| features/organizations/components/OrganizationCard.tsx | 271 | card with logo + cover | MODIFY | `<InlineMediaRef>` |

### features/image-manager/  (read-side surfaces only)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/image-manager/components/ProfilePhotoTab.tsx | 130 | renders avatar `<img src>` | MODIFY | `<InlineMediaRef ref variantKey="avatar_lg" />` |
| features/image-manager/components/PublicImagesSection.tsx | 235 | grid of public images | MODIFY | `<InlineMediaRef>` |
| features/image-manager/components/CloudFileMetadataSheet.tsx | 183 | display sheet | MODIFY | `<InlineMediaRef>` + `useFile` for variant urls |
| features/image-manager/components/StudioLibraryTab.tsx | 109 | library tab | MODIFY | `<InlineMediaRef>` |
| features/image-manager/components/BrandedUploadTab.tsx | 285 | upload + display | MODIFY | display side only |
| features/image-manager/components/AIGenerateHero.tsx | 60 | hero generator | KEEP | |
| features/image-manager/components/FullImageStudioTab.tsx | 67 | embeds image studio | KEEP | |
| features/image-manager/components/ToolsTab.tsx | 547 | tools UI | KEEP | (no file display) |
| features/image-manager/browse/BrowseImageProvider.tsx | 121 | provider | KEEP | |
| features/image-manager/registry/* | — | | KEEP | |

### features/rag/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/rag/components/library/LibraryPage.tsx | 862 | library grid; thumbnails via signed URLs (and direct upload helpers) | MODIFY | display: `<InlineMediaRef>` / `MediaThumbnail` (upload sweep handled elsewhere) |
| features/rag/components/library/LibraryPreviewPage.tsx | 701 | preview page; embeds FilePreview | MODIFY | ref-based via `useFile` |
| features/rag/components/library/LibraryDocDetailSheet.tsx | 1109 | detail sheet; embeds previewers + PDF | MODIFY | ref-based |
| features/rag/components/documents/DocumentViewer.tsx | 257 | document viewer; renders panes | MODIFY | passes refs not URLs |
| features/rag/components/documents/panes/PdfPane.tsx | 89 | PDF rendering with react-pdf; `useSignedUrl` | MODIFY | `useFile(ref, { target: "render" }).url`; PdfDocumentRenderer's new contract |
| features/rag/components/documents/panes/CleanedMarkdownPane.tsx | 70 | fetches markdown blob | MODIFY | `useFileBlob` (cache-aware) |
| features/rag/components/documents/panes/RawTextPane.tsx | 59 | fetches text blob | MODIFY | `useFileBlob` |
| features/rag/components/documents/panes/ChunksPane.tsx | 126 | renders chunks | KEEP | (chunks are RAG records, not file bytes) |
| features/rag/components/documents/LineageBreadcrumbs.tsx | — | breadcrumbs | KEEP | |
| features/rag/components/data-stores/DataStoresPage.tsx | 953 | data-store mgmt; some display of file refs | MODIFY | display via `<InlineMediaRef>` (upload sweep elsewhere) |
| features/rag/components/data-stores/CldFilePicker.tsx | 221 | picker; renders thumbs | MODIFY | `MediaThumbnail` w/ new contract |
| features/rag/components/data-stores/DataStoreBindPanel.tsx | — | panel | KEEP | |
| features/rag/components/data-stores/RichMemberTable.tsx | — | table | KEEP | |
| features/rag/components/RepositoriesPage.tsx | 294 | repos | KEEP | (no file bytes) |
| features/rag/components/RagHomePage.tsx | — | home | KEEP | |
| features/rag/hooks/useFileIngest.ts | 168 | references `useFileSrc` or signed-url helpers? grep confirms hit | MODIFY | swap to handler facade |
| features/rag/hooks/useDocument.ts | — | document state | KEEP | |
| features/rag/hooks/useLibrary.ts | — | library state | KEEP | |
| features/rag/api/document.ts | — | API | KEEP | |
| features/rag/api/ingest.ts | — | ingest write API | KEEP | (write path) |

### features/transcripts/ + features/transcript-studio/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/transcripts/components/TranscriptViewer.tsx | 394 | playback audio: `useFileSrc` + `<audio src>` | MODIFY | `useFile(audioRef).url` (or `<InlineMediaRef ref={audioRef} />` once it supports audio) |
| features/transcript-studio/components/columns/AudioImportDialog.tsx | 481 | import dialog; references signed URLs | MODIFY | resolve via `useFile` |

### features/whatsapp-clone/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/whatsapp-clone/modals/media/MediaTab.tsx | 215 | media gallery `<img/video/audio src>` | MODIFY | `<InlineMediaRef>` |
| features/whatsapp-clone/hooks/useWhatsAppMedia.ts | 125 | constructs signed URLs for media | MODIFY | `useFile(ref)` |
| features/whatsapp-clone/modals/media/MediaModal.tsx | — | wraps MediaTab | KEEP | |
| features/whatsapp-clone/windows/WhatsAppMediaWindow.tsx | — | window wrapper | KEEP | |
| features/whatsapp-clone/types.ts | — | types | KEEP | |

### features/pdf-extractor/ + features/pdf-demo/ + features/file-analysis/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/pdf-extractor/studio/PdfStudioReader.tsx | 1803 | renders PDFs with `useFileSrc` / direct URL | MODIFY | `useFile(ref, { target: "render" })`; PdfDocumentRenderer's `{ kind: "remote" }` contract |
| features/pdf-extractor/studio/PdfStudioUrlViewer.tsx | 169 | URL-based PDF viewer | MODIFY | resolve via `useFile` (URL ref) |
| features/pdf-extractor/components/PdfExtractorWorkspace.tsx | 1344 | workspace | MODIFY | propagate refs through preview chain |
| features/pdf-demo/components/PdfWorkbench.tsx | 250 | demo workbench | MODIFY | follows PdfDocumentRenderer change |
| features/pdf-demo/components/PdfSourcePicker.tsx | 221 | source picker; uses handler facade | MODIFY | retarget import to `@/features/files` |
| features/file-analysis/components/AnnotatablePdfCanvas.tsx | 295 | annotation canvas for PDF | MODIFY | accepts ref or URL; consumes new PdfDocumentRenderer |
| features/file-analysis/tab/AnalysisTab.tsx | 515 | tab; uses `useFileBlob` to read bytes | MODIFY | new cache-aware `useFileBlob` |

### features/code/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/code/editor/BinaryFileViewer.tsx | 478 | renders binary file previews; uses `useFileBlob` + `useSignedUrl` | MODIFY | `useFile` + cache-aware `useFileBlob` |
| features/code/editor/BinaryFilePdfPreview.tsx | 72 | PDF preview | MODIFY | new PdfDocumentRenderer contract |
| features/code/editor/CloudFilePreviewer.tsx | 52 | wraps FilePreview | MODIFY | pass ref |
| features/code/editor/EditorArea.tsx | 379 | hosts editor; falls back to preview for binaries | MODIFY | |
| features/code/hooks/useOpenFile.ts | 89 | opens file; references URL helpers | MODIFY | use `fileHandler.resolve(ref)` |
| features/code/views/explorer/CloudFilesExplorer.tsx | 163 | tree explorer; renders thumbs | MODIFY | MediaThumbnail's new contract |
| features/code/terminal/SimpleTerminal.tsx | — | terminal — display-side touched? unlikely | KEEP | |
| features/code/adapters/SandboxFilesystemAdapter.ts | — | adapter | KEEP | |

### features/image-studio/  (read/display side of editor only)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/image-studio/components/EmbeddedImageStudio.tsx | 1323 | embedded studio; uses `publicUrl`/`signedUrl` to render the working image | MODIFY | resolve via `useFile`; display via `<InlineMediaRef>` for preview tiles |
| features/image-studio/components/StudioVariantTile.tsx | 386 | variant tile preview | MODIFY | `<InlineMediaRef>` for each variant |
| features/image-studio/modes/annotate/AnnotateModeShell.tsx | 259 | annotation shell `<img>` | MODIFY | `useFile(ref).url` |
| features/image-studio/hooks/useImageStudio.ts | 1008 | state; references URL fields | MODIFY | source from `Asset` envelope (`assetsByMasterId`) |
| features/image-studio/hooks/useBase64Decoder.ts | 312 | decode; imports from file-handler | MODIFY | retarget import |
| features/image-studio/api/python.ts | 225 | python API; imports from file-handler | MODIFY | retarget; also part of Sharp/Studio rewrite (`POST /assets/preview`) |
| features/image-studio/modes/shared/save-edited-image.ts | 41 | save (write path) | KEEP | (write path) |
| features/image-studio/types.ts | — | types | KEEP | |

### features/html-pages/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/html-pages/components/tabs/SavePageTab.tsx | 456 | references `publicUrl`/`signedUrl` for assets | MODIFY | `useFile(ref)` |
| features/html-pages/utils/markdown-wordpress-utils.ts | 473 | builds `<img src>` strings from publicUrl | MODIFY | use `fileHandler.resolve(ref)` to mint stable URLs |

### features/agent-apps/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/agent-apps/route/AgentAppOverviewContent.tsx | 657 | icon + cover via `publicUrl`/`signedUrl` | MODIFY | `<InlineMediaRef>` |
| features/agent-apps/route/AgentAppSettingsContent.tsx | 542 | settings preview tiles | MODIFY | `<InlineMediaRef>` |
| features/agent-apps/components/inputs/AgentAppImageField.tsx | 161 | image field display | MODIFY | display side `<InlineMediaRef>` |

### features/artifacts/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/artifacts/components/CmsArtifactDetail.tsx | 394 | renders artifact images via `<img src>` | MODIFY | `<InlineMediaRef>` |

### features/tasks/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/tasks/components/TaskAssigneePicker.tsx | 214 | avatar `<img src>` | MODIFY | `<InlineMediaRef>` (avatar variant) |
| features/tasks/components/TaskAttachments.tsx | 177 | attachment list — display side | MODIFY | `<FileChip>` is icon-only; preview opens via `openFilePreview` — small touch |

### components/image/cloud/  (12 files; mix of DELETE and MODIFY)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| components/image/cloud/resolveCloudFileUrl.ts | 92 | duplicate URL chooser | DELETE | folded into `features/files/resolver/resolve.ts` |
| components/image/cloud/cloudFilesBrowsePayload.ts | 47 | uses resolveCloudFileUrl | MODIFY | call resolver/`useFile` |
| components/image/cloud/CloudFilesTab.tsx | 369 | tab; consumes resolveCloudFileUrl + display | MODIFY | use `useFile` + `<InlineMediaRef>` |
| components/image/cloud/CloudImagesTab.tsx | 731 | tab; same | MODIFY | same |
| components/image/cloud/CloudUploadTab.tsx | 278 | upload + display | MODIFY | display side only |
| components/image/cloud/ImageStudioTab.tsx | 163 | duplicates image-manager equivalent | DELETE | (plan §6.3: 3 of 4 image-manager Tabs deleted; this is one of them) |
| components/image/cloud/CloudImageGrid.tsx | 144 | grid; uses publicUrl | MODIFY | `<InlineMediaRef>` |
| components/image/cloud/CloudImageList.tsx | 144 | list; uses publicUrl | MODIFY | `<InlineMediaRef>` |
| components/image/cloud/CloudFilesBrowserTable.tsx | 1006 | browser table | MODIFY | `<InlineMediaRef>` + MediaThumbnail |
| components/image/cloud/CloudImageGrid.test.tsx | — | tests | MODIFY | reflect new API |
| components/image/cloud/CloudImagesTab.test.tsx | — | tests | MODIFY | |
| components/image/cloud/__tests__/cloudFilesBrowserUtils.test.ts | — | utils tests | MODIFY | |

### components/image/shared/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| components/image/shared/ImageGrid.tsx | 128 | renders thumbnails | MODIFY | `<InlineMediaRef>` |
| components/image/shared/ImagePreviewRow.tsx | 272 | preview row | MODIFY | `<InlineMediaRef>` |
| components/image/shared/ImageManagerIcon.tsx | 185 | icon `<img>` | MODIFY | `<InlineMediaRef>` |
| components/image/shared/SingleImageSelect.tsx | 269 | single select w/ preview | MODIFY | `<InlineMediaRef>` |

### components/mardown-display/  (markdown blocks rendering files inline)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| components/mardown-display/blocks/images/ImageOutputBlock.tsx | 506 | renders image from `MediaRef`/url; consumes `useAiImageUrl` | MODIFY | resolve via `useFile(ref)`; render `<InlineMediaRef>` |
| components/mardown-display/blocks/videos/VideoBlock.tsx | 273 | `<video src>` from URL | MODIFY | resolve via `useFile(ref)` |
| components/mardown-display/blocks/videos/VideoOutputBlock.tsx | 78 | wrapper | MODIFY | |
| components/mardown-display/blocks/audio/AudioComponent.tsx | 567 | `<audio src>` + waveform | MODIFY | resolve via `useFile(ref)` |
| components/mardown-display/blocks/audio/AudioOutputBlock.tsx | 713 | wrapper | MODIFY | |
| components/mardown-display/blocks/artifact/ArtifactBlock.tsx | 404 | renders artifacts; some `<img>` | MODIFY | `<InlineMediaRef>` |
| components/mardown-display/chat-markdown/ConfigurableMarkdownContent.tsx | 996 | markdown renderer; image inline | MODIFY | swap inline `<img>` for `<InlineMediaRef>` when src is a `MediaRef` URI |
| components/mardown-display/chat-markdown/analyzer/analyzer-options/viewer-utilities.tsx | — | utility | KEEP | |
| components/mardown-display/markdown-classification/custom-views/common/DefaultLoadingComponent.tsx | — | loader | KEEP | |
| components/mardown-display/markdown-classification/custom-views/view-components/AppSuggestionsView.tsx | — | view | KEEP | |
| components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry.tsx | — | registry | KEEP | |
| components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx | — | renderer | KEEP | |

### components/official/ + components/admin/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| components/official/ImageAssetUploader.tsx | 803 | upload + preview tile; consumes `publicUrl` for display | MODIFY | preview side via `<InlineMediaRef>`; upload side handled in upload-inventory |
| components/official/image-cropper/ImageCropper.tsx | — | crops; imports from file-handler | MODIFY | retarget import; cropping source via `useFile` |
| components/admin/applet-admin/AppletConfigViewer.tsx | 491 | renders preview thumbs | MODIFY | `<InlineMediaRef>` |

### components/ui/file-upload/  (mostly upload — only display side called out)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| components/ui/file-upload/ImageUploadField.tsx | — | upload + preview; renders `<img>` of current value | MODIFY | preview tile via `<InlineMediaRef>` (upload OOS) |
| components/ui/file-upload/usePasteImageUpload.ts | — | paste; references `<img>` for preview | MODIFY | preview side only |
| components/ui/file-upload/useFileUploadWithStorage.ts | — | (DELETE in upload inventory — legacy shim) | KEEP | listed for awareness only |

### features/window-panels/

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/window-panels/windows/cloud-files/FilePreviewWindow.tsx | 81 | hosts FilePreview | MODIFY | pass ref |
| features/window-panels/windows/cloud-files/CloudFilesWindow.tsx | — | hosts files page | KEEP | |
| features/window-panels/windows/FeedbackWindow.tsx | — | feedback window; renders attached image | MODIFY | `<InlineMediaRef>` |

### app/  (admin / demo / public)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| app/(public)/share/[token]/page.tsx | 205 | share-link viewer; embeds FilePreview | MODIFY | pass `{ kind: "share_link", token }` ref; otherwise unchanged |
| app/(authenticated)/(admin-auth)/administration/feedback/components/FeedbackDetailDialog.tsx | — | renders feedback images; imports from file-handler | MODIFY | retarget import + `<InlineMediaRef>` |
| app/(authenticated)/(admin-auth)/administration/official-components/component-displays/image-upload-field.tsx | 103 | demo of upload field | MODIFY | follows ImageUploadField change |
| app/(dev)/demos/cloud-files-debug/CloudFilesDebugClient.tsx | 1027 | debug page; references `publicUrl`/`signedUrl`/raw fetches | MODIFY | switch displays to `<InlineMediaRef>` + show `assetsByMasterId` cache state |
| app/(dev)/demos/pdf-processing/render-thumbnail/page.tsx | 103 | render-thumb demo | MODIFY | use new previewer pipeline |
| app/Providers.tsx | — | mounts `<CloudFilesRealtimeProvider>` once | MODIFY | structural mount move (plan §6.6) |

### features/audio/ (display-side only)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/audio/services/audioFallbackUpload.ts | — | legacy upload + signed-URL fetch | DELETE | already deprecated; full removal in upload inventory; read-side helpers fold away |
| features/audio/components/AudioRecoveryModal.tsx | — | `<audio src>` for recovered recordings | MODIFY | resolve via `useFile` |

### Legacy / KEEP (no file bytes/URLs rendered)

The following files matched a tag scan but are not in scope (they render unrelated `<img>` / `<video>` / `<audio>` — e.g. UI scaffolding, flash-card images, oauth-icons, prompt-app legacy UI, error pages, applet builder/home variants, official-component demos, error overlays, etc.). All KEEP:

- `app/(authenticated)/(admin-auth)/administration/official-components/parts/component-list.tsx`
- `app/(authenticated)/(admin-auth)/administration/official-components/component-displays/paste-image-handler.tsx`
- `app/(authenticated)/(admin-auth)/administration/official-components/to-be-added/toggle-menu-demo/toggle-with-categories/constants.tsx`
- `app/(authenticated)/ai/prompts/experimental/chatbot-customizer/page.tsx`
- `app/(authenticated)/flash-cards/fast-fire/{FastFireContainer,FastFirePractice,page}.tsx`
- `app/(authenticated)/tests/applet-tests/applet-builder-3/components/steps/IntelligenceStep.tsx`
- `app/(authenticated)/tests/audio-recorder-test/initial/page.tsx`
- `app/(authenticated)/tests/oauth/components/SlackManager.tsx`
- `app/(legacy)/legacy/demo/component-demo/ai-prog/sample-data.ts`
- `app/entities/fields/field-components/custom-fields/EntitySpecialMultiSwitch.tsx`
- `app/error/page.tsx`
- `components/ai-help/AIHelpDialog.tsx`
- `components/layout/MatrixLogo.tsx`
- `components/matrx/AnimatedForm/separated/components/MatrxTextarea.tsx`
- `components/matrx/ClientTopMenu.tsx`
- `components/matrx/Entity/prewired-components/entity-management/parts/EntitySelectVariants.tsx`
- `components/playground/components/dynamic-two/MessageToolbar.tsx`
- `components/playground/messages/MessageToolbar.tsx`
- `components/playground/messages/dynamic/MessageToolbar.tsx`
- `components/playground/settings/dev/PromptSettings.tsx`
- `components/ui/GlassContainer.tsx`
- `components/ui/context-menu/with-avatar.tsx`
- `features/applet/builder/modules/smart-parts/apps/SmartAppList.tsx`
- `features/applet/home/app-display/{Default,Minimal,Modern,ModernGlass,QuarterThreeQuarters,SavedDefault,SideBySide}.tsx` + `features/applet/home/main-layout/Grid.tsx`
- `features/chat/components/input/{ActionButtons,constants}.tsx`
- `features/prompt-apps/components/PromptAppEditor.tsx` (legacy; see active-migration prompts→agents)
- `features/prompts/components/builder/PromptAssistantMessage.tsx`
- `features/prompts/components/resource-display/ResourcePreviewSheet.tsx`
- `features/public-chat/components/AgentSelector.tsx`
- `features/research/components/overview/live-pipeline/ui/Favicon.tsx`
- `features/tool-call-visualization/admin/tool-ui-generator-prompt.ts`
- `features/workflows/results/registered-components/{BraveSearchDisplay,SerpResultsPage}.tsx`

(These render images, but the source is either a static path, an entity avatar wrapped in `<Avatar>`, a legacy applet config string, or an LLM-emitted external URL — not a cloud-file ref. The boy-scout sweep can convert opportunistically, but they don't gate PR3.)

---

## Cross-cutting patterns being eliminated

1. **Bespoke URL-chooser ladders.** `file.publicUrl ?? signedUrl ?? metadata.cdn_url ?? fileUri ?? ...` patterns exist in `features/files/utils/resolveRenderableImageUrl.ts`, `components/image/cloud/resolveCloudFileUrl.ts`, and inline in ~12 components (org logos, agent-apps tiles, podcasts, image-manager, html-pages, image-studio, etc.). All collapse to `useFile(ref).url` or `<InlineMediaRef ref={ref} />`.

2. **`useSignedUrl` direct consumers (~18 files).** All in `features/files/components/**` + a handful in `features/transcripts`, `features/file-handler/hooks`. Migrate to `useFile(ref, { target: "render" }).url`.

3. **`useFileAsset` direct consumers (5 files).** Folded into `useFile(ref, { variantKey })` reading `assetsByMasterId`.

4. **`useFileBlob` consumers (~17 files).** Hook signature stable; internals change to mem→IDB→SW→network. Each callsite gets the cache for free.

5. **`useAiImageUrl` (1 hook + 2 consumers).** Deleted; AI image records expose a `MediaRef` directly, consumed via `useFile`.

6. **Direct `<img src={...publicUrl}>` patterns across ~40 components.** All become `<InlineMediaRef ref={mediaRef} size="..." />`.

7. **Bespoke `<audio src>` / `<video src>` constructions** in podcasts, transcripts, whatsapp-clone, markdown-display blocks. Resolve src via `useFile(ref).url`.

8. **Imports from `@/features/file-handler/*`** in ~12 non-file-handler files (image-studio, image-cropper, resource-source, transcripts, code-files, prompts, public-chat, resource-manager, audio, ConversationInput, FeedbackDetailDialog, FeedbackWindow, audio-transcribe-url route). All retarget to `@/features/files` after the directory merge.

9. **Hand-authored `Asset` / `AssetVariant` types** in `features/files/types.ts`. Replaced by generated `types/python-generated/api-types.ts`; OpenAPI CI gate.

10. **PdfDocumentRenderer URL-prop contract.** Every PDF surface (FilePreview/PdfPreview, RAG PdfPane, pdf-extractor studio, pdf-demo, file-analysis, code BinaryFilePdfPreview, app/(public)/share/[token]) currently passes a `string` URL; all switch to `{ kind: "remote", url, httpHeaders, rangeChunkSize }` so Range requests + Service Worker caching activate transparently.

---

## Migration dependencies

1. **Resolver merge (file-handler → files) must land FIRST** (plan PR3 step 3). Every other migration depends on the unified `useFile` hook existing.
2. **`assetsByMasterId` Redux slice (step 4)** must precede `useFile` (step 5), which precedes all callsite migrations (steps 8–10).
3. **`MediaThumbnail` API change (ref-based) must land BEFORE** `FileGridCell`, `FileTableRow`, `CldFilePicker`, `CloudImageGrid/List/BrowserTable`, `ImageGrid`, `ImagePreviewRow`, `SingleImageSelect`, `FileResourceChip`, `CloudFilesExplorer`, `ImageManagerIcon`, `CloudFileMetadataSheet`, `DataStoresPage` (≥14 surfaces).
4. **`FilePreview` registry refactor (plan PR3 step 22) and ref-based contract change** must land BEFORE all its consumers can update: `PreviewPane`, `MobileStack`, `WindowPanelShell`, `FilePreviewWindow`, `app/(public)/share/[token]`, `EditorArea`, `CloudFilePreviewer`, `BinaryFileViewer`, `BinaryFilePdfPreview`, `LibraryDocDetailSheet`, `LibraryPreviewPage`, `DocumentViewer`, `PdfExtractorWorkspace`, `PdfStudioReader`, `PdfStudioUrlViewer`, `PdfWorkbench`, `AnnotatablePdfCanvas`, `AnalysisTab`, `PdfPane`, `ResourcePreviewSheet`, `ProcessingProgressDialog`.
5. **`PdfDocumentRenderer` `{ kind: "remote" }` contract + local worker copy** must land before all PDF callers can switch (10 surfaces).
6. **`<InlineMediaRef>` component build (step 7)** must precede the agent/chat/podcast/org-logo/image-manager/markdown-block sweep (~40 callsites).
7. **`<CloudFilesRealtimeProvider>` global mount move (step 20)** can land at any point but must coexist with the existing per-route mounts during transition; final cutover is one commit.
8. **OpenAPI type regen (step 2)** must precede hand-authored `Asset` type deletion.
9. **`useAiImageUrl` deletion** requires `ImageArrivalPeek` + `ImageOutputBlock` to migrate first (otherwise build breaks).
10. **`resolveCloudFileUrl` + `resolveRenderableImageUrl` deletion** requires `CloudFilesTab`, `CloudImagesTab`, `CloudUploadTab`, `cloudFilesBrowsePayload.ts`, and `useSignedUrl` (which currently imports `resolveRenderableImageUrl`) to be migrated first.

---

## Open questions for the user

1. **`features/files/virtual-sources/adapters/CodeInlinePreview.tsx` (246) and `NotesInlinePreview.tsx` (220)** — these render text content fetched via virtual-source adapters, not cloud-file bytes. Confirm KEEP — they're rendering already-resolved virtual content, no `useFile` migration applies.
2. **`features/files/redux/virtual-thunks.ts`** — fetches signed URLs for virtual sources (code-files, notes, prompt-apps, tool-ui-components, aga-apps). Should virtual-source URL minting also funnel through the new `useFile` resolver, or stay separate? The plan doesn't explicitly call it out.
3. **`features/cx-conversation/AssistantMessage.tsx` (297)** vs **`features/cx-chat/components/messages/AssistantMessage.tsx` (297)** — same line count, very similar names. Confirm both are active (one may be dead code from an earlier rename).
4. **`features/prompts/components/builder/PromptAssistantMessage.tsx`** and the prompt-app legacy editor — these match the active prompts→agents migration. Should the read-path sweep skip them entirely (because they're scheduled for deletion in phases 16–19), or do they still need to work during the transition window?
5. **`components/admin/applet-admin/AppletConfigViewer.tsx`** — admin debug viewer. Worth migrating, or freeze and let it be replaced once applets→agent-apps lands?
6. **`features/agent-apps/components/inputs/AgentAppImageField.tsx` (161)** — confirm this is a display field (read), not the upload field (write). The grep hit included it under both — may need a closer look.
7. **`PdfAnnotationLayer/`** files in `features/files/components/core/` — couldn't enumerate contents from one grep; confirm these stay as MODIFY (ref-based) or KEEP (annotation overlay on top of an already-resolved PDF).
8. **`features/audio/components/AudioRecoveryModal.tsx`** — references the `audioSafetyStore` (IndexedDB crash-recovery), not `cld_files`. Should it still render via the new handler once recovered, or stay on its dedicated path (per file-handler FEATURE.md's "deliberately does NOT own" list)?
9. **`features/files/components/core/FilePreview/preview-actions.ts`** — currently builds copy-URL / open-in / download handlers; depends on `useFileSrc`-style helpers. Confirm migrate alongside `useFileActions.ts` (also a hit).
10. **The `app/(authenticated)/(admin-auth)/administration/blob-cache/page.tsx`** doesn't exist yet (per plan §4A). Confirm this is created in PR3 step 23 and not part of this read-path inventory (it's new code, not a migration).
