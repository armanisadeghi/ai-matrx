# Impact inventory — write path

Scope: every component, page, route, hook, service, or utility in `matrx-frontend` that **uploads, mutates, renames, moves, deletes, restores, shares, or sets permissions** on cloud files. Render-only sites are out of scope.

Source: read against the v2 consolidation plan ([docs/FILE_HANDLING_CONSOLIDATION_PLAN.md](./FILE_HANDLING_CONSOLIDATION_PLAN.md)) — the target architecture is a single `features/files/` directory with five hooks (`useFile`, `useFileSrc`, `useFileBlob`, `useFileUpload`, `useFileMutation`), one `fileHandler` facade, three components (`<InlineMediaRef>`, `<FilePreview>`, `<FileUploadDropzone>`), and the combined-op endpoints `POST /assets` / `PATCH /files/{id}` / `POST /files/bulk`.

---

## Summary

| Action | Count |
|---|---|
| DELETE | 23 |
| MODIFY | 78 |
| KEEP | 5 |
| **Total** | **106 files** |

(All counts cover write-path files only. Render-only sites — `<img src>` patterns, `<FilePreview>`-style sinks, `useFileSrc`/`useSignedUrl` readers — are inventoried separately by the read-path agent.)

---

## By feature

The write-path surface clusters into ten zones:

1. **`features/file-handler/`** — the legacy universal handler (entire directory deletes; folds into `features/files/`).
2. **`features/files/upload/`** — current upload primitive (`cloudUpload` + guard) — replaced by new `upload()` primitive in `features/files/upload/upload.ts`.
3. **`features/files/api/`** — handwritten REST clients (`files.ts`, `assets.ts`, `permissions.ts`, `share-links.ts`, `server-client.ts`) — replaced by generated client + thin typed wrappers; `server-client.ts` deletes entirely.
4. **`features/files/redux/`** — thunks split by domain; `thunks.ts` (1790 lines) and `virtual-thunks.ts` (456 lines) decomposed.
5. **`features/files/hooks/`** — `useGuardedFileUpload` collapses into `useFileUpload`; `useSharing` collapses into `useFileMutation`.
6. **`features/files/components/core/{*Dialog,*ContextMenu,FileActions,FileUploadDropzone,DuplicateUploadDialog}/`** — rewire to new hooks; combined-op for atomic share+upload, rename+move, etc.
7. **`components/ui/file-upload/`** — entire directory's write-path either deletes (`useFileUploadWithStorage`, `usePasteImageUpload`, `FileUploadWithStorage`) or rewires (`ImageUploadField`, `PasteImageHandler`, `useClipboardPaste`).
8. **`components/official/`** — `ImageAssetUploader`, `ImageCropper*` — unify dual upload paths.
9. **`features/agent-apps/`, `features/agents/`, `features/cx-chat/`, `features/cx-conversation/`, `features/public-chat/`, `features/prompts/`, `features/chat/`** — every smart-input / chat-input migrates from `useFileUpload` (handler) → `useFileUpload` (`features/files`); import path change only for most.
10. **Feature-specific write paths** — audio fallback, transcripts, tasks, RAG library / data-stores, image studio, podcasts admin, PDF extractor/demo, canvas social, code-files, whatsapp clone, feedback admin, resource-manager pickers, window panels (feedback window, code window).
11. **Next.js API write routes** — `app/api/images/studio/process` and `app/api/pdf/compress` delete; `hooks/usePdfOptimize.ts` and the two PDF callers rewire to Python `POST /assets/pdf-compress`.
12. **Admin / demo / test pages that initiate writes** — official-components demos, cloud-files-debug client, image-manager registry.

---

## Files (full inventory)

### `features/file-handler/` (DELETE entire directory — merges into `features/files/`)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/file-handler/handler.ts | 107 | `fileHandler.upload / use / refresh` facade | DELETE | replaced by `features/files/handler.ts` (same name, new location, no `.use(...).as(...)` builder) |
| features/file-handler/upload.ts | 261 | internal `uploadInternal()` — coerces source → File, posts `/files/upload`, stamps scope metadata | DELETE | logic folds into `features/files/upload/upload.ts` (single primitive with transport auto-selection) |
| features/file-handler/resolver.ts | n/a | hydration + access decision + URL mint | DELETE | moves to `features/files/resolver/resolve.ts` |
| features/file-handler/types.ts | n/a | `FileSource`, `NormalizedFile`, `FileTarget`, `UploadOpts`, `MediaBlock` | DELETE | merged into `features/files/types/domain.ts` + `ui.ts` |
| features/file-handler/errors.ts | n/a | typed error taxonomy | DELETE | moves to `features/files/errors.ts` |
| features/file-handler/hooks/useFileUpload.ts | 77 | hook around handler.upload | DELETE | replaced by `features/files/hooks/useFileUpload.ts` (new transport selection) |
| features/file-handler/hooks/useFile.ts | n/a | generic resolve | DELETE | moves; reads `assetsByMasterId` first |
| features/file-handler/hooks/useFileAs.ts | n/a | target-coercion wrapper | DELETE | removed; targets now declarative on `useFile` |
| features/file-handler/hooks/useFileBlob.ts | n/a | bytes hook | DELETE | replaced by `features/files/hooks/useFileBlob.ts` (consults IDB before network) |
| features/file-handler/hooks/useFileDownloadUrl.ts | n/a | download URL hook | DELETE | folded into `useFile({ target: "download" })` |
| features/file-handler/hooks/useFileMediaBlock.ts | n/a | AI media block hook | DELETE | callers migrate to direct `fileHandler.toMediaBlock` / context-part adapters |
| features/file-handler/hooks/useFileSrc.ts | n/a | URL string hook | DELETE | replaced by `features/files/hooks/useFileSrc.ts` |
| features/file-handler/input/* | n/a | 16 input adapters (FileSource→NormalizedFile) | DELETE | move to `features/files/resolver/normalize.ts` |
| features/file-handler/output/* | n/a | 11 output adapters (NormalizedFile→FileTarget) | DELETE | move to `features/files/resolver/target.ts` |
| features/file-handler/intelligence/expiry-wheel.ts | n/a | single global expiry wheel | DELETE (location) | relocates verbatim to `features/files/cache/expiry-wheel.ts` |
| features/file-handler/intelligence/access.ts | n/a | owner/visibility/permission decision | DELETE | moves to `features/files/resolver/access.ts` |
| features/file-handler/intelligence/refresh.ts | n/a | signed-URL re-mint | DELETE | moves to `features/files/resolver/refresh.ts` |
| features/file-handler/intelligence/magic-bytes.ts | n/a | MIME sniffing | DELETE | moves to `features/files/resolver/magic-bytes.ts` |
| features/file-handler/utils/python-base.ts | n/a | backend URL helper | DELETE | replaced by `features/files/client/client.ts` |
| features/file-handler/FEATURE.md | 196 | feature doc | DELETE | merged into `features/files/FEATURE.md` |

Note: the legacy `fileHandler.use(source).as(target)` builder is **deleted**; no shim, no alias. Every caller is rewritten to direct hook + component imports per plan §6.1.

---

### `features/files/upload/` (single upload primitive replaces `cloudUpload`)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/upload/cloudUpload.ts | 541 | `cloudUpload` + `cloudUploadMany` — single-file/multi-file POST to `/files/upload` with optional share+permissions in same call; integrates with Redux optimistic state, request-ledger dedup | DELETE | replaced by new `features/files/upload/upload.ts` — auto-selects buffered (<5MB) / presigned (5-100MB) / TUS (≥100MB). Combined `options.share` / `options.permissions` / `options.variants` body keeps existing intent but goes to `POST /assets`. |
| features/files/upload/UploadGuardHost.tsx | 36 | dynamic-import wrapper | MODIFY | rename module path; impl stays |
| features/files/upload/UploadGuardHostImpl.tsx | 232 | pre-flight duplicate-detect dialog (cld_uploads_inflight lookup → DuplicateUploadDialog) | MODIFY | wire to new `upload()` primitive; A.4 idempotency-key now covers entire combined op (set X-Idempotency-Key automatically) |
| features/files/upload/uploadGuardOpeners.ts | 109 | imperative opener for the host | MODIFY | re-export from new location; signature retained |
| features/files/upload/index.ts | 23 | barrel exports | DELETE | per "no barrels" rule; callers import direct paths |
| features/files/utils/upload-duplicate-detect.ts | n/a | cld_uploads_inflight pre-flight check | MODIFY | wire onto new `upload()` |

New file added in same directory: `features/files/upload/upload.ts` (the single primitive).

---

### `features/files/api/` (HTTP write surface)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/api/files.ts | 442 | typed wrappers: `uploadFile`, `uploadFileWithProgress`, `patchFile`, `patchFileReplaceMetadata`, `deleteFile`, `bulkDeleteFiles`, `bulkMoveFiles`, `renameFile`, `copyFile`, `restoreFile`, `migrateGuestToUser`, `getStorageUsage`, `listTrash`, `searchFiles`, etc. | MODIFY | Regenerate from BE OpenAPI (`pnpm gen:types`). Replace `bulkDeleteFiles` + `bulkMoveFiles` with single `bulkOperate({ ids, op })` (A.3 discriminator). `patchFile` accepts union body (A.2). `uploadFile` accepts bundled `options.share` / `options.permissions` / `options.variants` (A.1). Surface `errors[]` from response (A.1/A.2 partial-success contract). |
| features/files/api/assets.ts | 248 | `uploadAsset`, `uploadAssetWithProgress`, `getAsset`, `patchAsset`, `addAssetVariants`, `listAssetPresets`; POST /assets multipart pipeline | MODIFY | regenerate. Merge with `files.ts` write semantics — `uploadAsset` IS `POST /assets` with `options` body now; eliminates dual upload path. |
| features/files/api/permissions.ts | 94 | `listFilePermissions`, `grantFilePermission`, `revokeFilePermission`, `listFolderPermissions`, `grantFolderPermission`, `revokeFolderPermission` | MODIFY | regenerate. Grant/revoke now also reachable through combined `PATCH /files/{id}` body. Keep standalone for granular UI. |
| features/files/api/share-links.ts | 107 | `listFileShareLinks`, `createFileShareLink`, `listFolderShareLinks`, `createFolderShareLink`, `deactivateShareLink`, `resolveShareLink`, `downloadSharedFile` | MODIFY | regenerate. `createFileShareLink` now also a sub-op on `POST /assets` / `PATCH /files/{id}`. |
| features/files/api/server-client.ts | 320 | SSR-only mirror: `uploadFile`, `patchFile`, `deleteFile`, `getSignedUrl`, `createFileShareLink`, `downloadFile`, `uploadAndShare` | DELETE | no callers after Sharp deletion; SSR paths use the same regenerated client through OIDC auth |
| features/files/api/client.ts | 703 | auth header injection, X-Request-Id, X-Idempotency-Key, error mapping, `postJson`, `postMultipart` primitives | MODIFY | re-targeted as `features/files/client/client.ts`; bake idempotency-key auto-derivation for combined ops |
| features/files/api/index.ts | 16 | barrel | DELETE | no barrels |

---

### `features/files/redux/`

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/redux/thunks.ts | 1790 | every write thunk: `uploadFiles`, `renameFile`, `moveFile`, `updateFileMetadata`, `deleteFile`, `restoreVersion`, `grantPermission`, `revokePermission`, `createShareLink`, `deactivateShareLink`, `getSignedUrl`, `bulkDeleteFiles`, `bulkMoveFiles`, `bulkMoveFolders`, `migrateGuestToUser`, `createFolder`, `updateFolder`, `deleteFolder`, `ensureFolderPath`, etc. | MODIFY | split by domain into `state/thunks/{files,folders,permissions,share-links,bulk,upload}.ts`. Each write thunk migrates to call the new combined-op endpoint (A.1/A.2/A.3) where the original call site composed multiple writes. Partial-success `errors[]` propagates to thunk meta. Optimistic rollback split per sub-op rather than all-or-nothing (plan §5 implications). |
| features/files/redux/virtual-thunks.ts | 456 | `attachVirtualRoots`, `loadVirtualChildren`, `renameAny`, `moveAny`, `deleteAny`, `writeAny`, `readAny` — virtual-source dispatch (code-files, etc.) | MODIFY | split between `state/thunks/files.ts` and a thin virtual-adapter dispatcher; `writeAny` reuses unified upload primitive |
| features/files/redux/slice.ts | 1153 | `cloudFiles` slice — files+folders+uploads+permissions+shareLinks+versions+errors+selection+dirty-tracking | MODIFY | add `assetsByMasterId: Record<string, Asset>` cache, `selectAssetByMasterId`, `selectVariantUrl`. Optimistic update path must accept partial-success rollback per sub-op. |
| features/files/redux/realtime-middleware.ts | 509 | dedup ledger; UPDATE→optimistic-replace via `metadata.request_id` | MODIFY | extend: variant-row UPDATE on `cloud_files` patches `assetsByMasterId[parent].variants[variant_key]`. `cld_share_links` + `cld_file_permissions` + `processed_documents` realtime events drop signed-URL cache + invalidate SW cache. |
| features/files/redux/converters.ts | n/a | MediaRef builders (`cloudFileToMediaRef`, `fileIdToMediaRef`, `urlToMediaRef`, `fileUriToMediaRef`) | KEEP | the only sanctioned MediaRef construction path; ESLint-fenced from external use |
| features/files/redux/rag-thunks.ts | 162 | RAG-specific ingest thunks | DELETE | moves to `features/rag/redux/thunks.ts` per plan §6.3 |

---

### `features/files/hooks/`

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/hooks/useGuardedFileUpload.ts | 60 | `useGuardedFileUpload` — calls UploadGuardHost pre-flight, then dispatches `uploadFiles` thunk; used by `ImageAssetUploader` | DELETE | folds into new `useFileUpload` (guard option flag). All 1 caller (`ImageAssetUploader`) migrates. |
| features/files/hooks/useSharing.ts | 154 | `useSharing` — `createShareLink`, `deactivateShareLink`, etc. wrapper around redux thunks (specific to file-system sharing — distinct from `utils/permissions.useSharing`) | DELETE | callers move to `useFileMutation(fileId).share(...)` etc. |
| features/files/hooks/useFileBlob.ts | n/a | byte hook (current) | MODIFY | extend to consult Dexie `matrx-blob-cache` IDB before network |
| features/files/hooks/useFileAsset.ts | n/a | asset envelope hook | DELETE | replaced by `useFile(ref).asset` |
| features/files/hooks/useSignedUrl.ts | n/a | per-component setTimeout signed-URL refresh | DELETE | replaced by `useFile(ref, { target: "render" }).url` — uses global expiry wheel |
| features/files/hooks/useUploadAndGet.ts | n/a | upload then return envelope | DELETE | callers use `useFileUpload` directly (returns envelope already) |
| features/files/hooks/useUploadAndShare.ts | n/a | upload then create share link | DELETE | replaced by `useFileUpload` with `options.share` (A.1 combined op) |
| features/files/hooks/useFileDocument.ts | n/a | doc-typed read | DELETE | folds into `useFileBlob` |
| features/files/hooks/useStorageQuota.ts | n/a | reads `/files/quota` | KEEP | unchanged; no write |
| features/files/hooks/useFolderContents.ts | n/a | reads folder | KEEP | unchanged; no write |

---

### `features/files/components/core/` (write-path dialogs and menus)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/components/core/FileContextMenu/FileContextMenu.tsx | 675 | tree-row right-click — calls `uploadFiles` thunk for replace, `renameFile`, `moveFile`, `deleteFile`, share, copy, etc. | MODIFY | switch upload dispatch to `useFileUpload`. Combine `rename + move` into one `useFileMutation.patch({ name, folder })` call (A.2). |
| features/files/components/core/FileContextMenu/FileRightClickMenu.tsx | 167 | shell for the menu | MODIFY | import path updates |
| features/files/components/core/FileContextMenu/useFileMenuActions.ts | 113 | menu-action handler factory | MODIFY | rewire to `useFileMutation` per action; share-link grant integrated as sub-op |
| features/files/components/core/RowContextMenu/RowContextMenu.tsx | 598 | grid/table row right-click, replaces FileUploadDropzone flow on replace | MODIFY | as above |
| features/files/components/core/FolderContextMenu/FolderContextMenu.tsx | 381 | folder right-click — `createFolder`, `updateFolder`, `deleteFolder`, share | MODIFY | switch folder writes to new thunks; folder share goes through `PATCH /folders/{id}` analog (A.2 extends to folders) |
| features/files/components/core/RenameDialog/RenameDialog.tsx | 414 | rename — calls `renameFile` thunk via Redux | MODIFY | dispatch `useFileMutation.patch({ name })` |
| features/files/components/core/RenameDialog/RenameHost.tsx | 66 | imperative opener | MODIFY | import path updates |
| features/files/components/core/ShareLinkDialog/ShareLinkDialog.tsx | 403 | share-link create + deactivate | MODIFY | dispatch `useFileMutation.patch({ share })` and `useFileMutation.patch({ share_revoke })` (A.2). When opening dialog for a file that's not yet uploaded (rare race), surface partial-success `errors[]` from `POST /assets` |
| features/files/components/core/PermissionsDialog/PermissionsDialog.tsx | 271 | per-user/org permission grant + revoke | MODIFY | dispatch `useFileMutation.patch({ permissions: [...] })` (A.2 union body). UX for partial-success: per-row error indicator. |
| features/files/components/core/DuplicateUploadDialog/DuplicateUploadDialog.tsx | 336 | pre-flight duplicate-detection — keep both / replace / skip | MODIFY | wire to new `upload()` primitive (signature compatible) |
| features/files/components/core/FileActions/useFileActions.ts | 320 | per-file action handlers (rename/move/delete/copy/restore/share/download) | MODIFY | replace direct thunk dispatches with `useFileMutation` calls |
| features/files/components/core/FileActions/useFolderActions.ts | 192 | per-folder action handlers | MODIFY | rewire |
| features/files/components/core/FileUploadDropzone/FileUploadDropzone.tsx | 212 | drag/drop/click → `useFileUpload(file-handler)` | MODIFY | switch to new `useFileUpload` from `features/files/hooks`; same component API |
| features/files/components/core/FileUploadDropzone/UploadProgressList.tsx | 112 | renders pending uploads from `selectActiveUploads` | MODIFY | selector now includes per-sub-op error rows; render `errors[]` partial-success |
| features/files/components/core/FileEditor/CloudFileEditor.tsx | n/a | edit + save flow — re-uploads via `uploadFiles` to same parent+filename | MODIFY | switch to `useFileUpload`; passes new file as new version of existing master via `MediaRef { file_id }` path or upsert preserving filename |
| features/files/components/core/FileEditor/CloudFileInlineEditor.tsx | n/a | inline editor variant | MODIFY | same |
| features/files/components/core/FilePreview/preview-actions.ts | n/a | imperative open / download / share / delete from preview pane | MODIFY | rewire to `useFileMutation` |

---

### `features/files/components/surfaces/` (write surfaces)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/components/surfaces/MobileStack.tsx | 645 | mobile shell — direct calls to dropzone + sharing buttons | MODIFY | rewire to new hooks |
| features/files/components/surfaces/desktop/NewMenu.tsx | 215 | "New folder / Upload file" toolbar menu | MODIFY | dispatch `useFileUpload` instead of `uploadFiles` thunk |
| features/files/components/surfaces/desktop/BulkActionsBar.tsx | 524 | multi-select bulk move/delete/restore/share | MODIFY | call `useFileMutation.bulk({ ids, op, ...args })` (A.3). Surface per-row errors from response. |
| features/files/components/surfaces/desktop/ContentHeader.tsx | n/a | toolbar with "upload here" entry | MODIFY | rewire dropzone |
| features/files/components/surfaces/desktop/FileTable.tsx | n/a (851) | TanStack table — drag-drop reorder/move | MODIFY | re-route drag-move to `useFileMutation.patch({ folder })`. Already noted in plan §6.5 for TanStack rewrite. |
| features/files/components/surfaces/desktop/FileTableRow.tsx | n/a | row drag-drop target | MODIFY | rewire |
| features/files/components/surfaces/desktop/FileGrid.tsx | n/a | grid drag-drop reorder/move | MODIFY | rewire |
| features/files/components/surfaces/desktop/FileGridCell.tsx | n/a | cell drag target | MODIFY | rewire |
| features/files/components/surfaces/PageShell.tsx | n/a (920) | top-level shell — orchestrates uploads + selection + DnD | MODIFY | rewire to new hooks; also subject to plan's "per-section split" |
| features/files/components/surfaces/PreviewPane.tsx | n/a | side-pane with edit/rename/delete/share controls | MODIFY | rewire |
| features/files/components/surfaces/EmbeddedShell.tsx | n/a | embedded shell (image-manager) — kind filter + dropzone | MODIFY | rewire |
| features/files/components/surfaces/FileShareTab.tsx | n/a | share tab in file-details panel | MODIFY | rewire to `useFileMutation` |
| features/files/components/surfaces/FileInfoTab.tsx | n/a | info tab — read-only metadata + rename action | MODIFY | rewire rename |
| features/files/components/surfaces/useFileShortcuts.ts | 564 | Cmd-V paste-to-upload, Cmd-D delete, etc. | MODIFY | replace `uploadFilesThunk` dispatches with new `upload()`; bulk-delete now `useFileMutation.bulk({ op: "delete" })` |
| features/files/components/surfaces/OnboardingEmptyState.tsx | n/a | first-upload CTA dropzone | MODIFY | rewire |

---

### `features/files/components/core/` (other touched)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/files/components/core/FileTree/FileTreeRow.tsx | n/a | tree row drag-drop move | MODIFY | rewire move dispatch |
| features/files/components/core/FileList/FileListRow.tsx | n/a | list row context menu | MODIFY | rewire |
| features/files/components/core/FileList/FileListGridCell.tsx | n/a | grid cell context menu | MODIFY | rewire |
| features/files/components/core/FileList/FileList.tsx | n/a | drag-drop folder move target | MODIFY | rewire |
| features/files/components/core/FileChip/FileChip.tsx | n/a | inline chip with delete/replace action | MODIFY | rewire |
| features/files/components/core/FileInfo/FileInfoDialog.tsx | n/a | info dialog with rename | MODIFY | rewire |
| features/files/virtual-sources/adapters/code-files.ts | n/a | virtual-source write adapter for code-files | MODIFY | wire onto unified `upload()` |
| features/files/virtual-sources/adapters/CodeInlinePreview.tsx | n/a | inline code-file edit (write) | MODIFY | rewire |

---

### `components/ui/file-upload/` (legacy generic upload UI)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| components/ui/file-upload/useFileUploadWithStorage.ts | 275 | LEGACY COMPAT SHIM over `fileHandler.upload`; 16 callers depend on it | DELETE | all 16 callers migrate explicitly to `useFileUpload` from `features/files`. No alias. |
| components/ui/file-upload/FileUploadWithStorage.tsx | 184 | drop-zone component over the shim | DELETE | callers migrate to `<FileUploadDropzone>` from `features/files` |
| components/ui/file-upload/usePasteImageUpload.ts | 246 | paste handler that uploads to cloud-files via `fileHandler.upload` | DELETE | callers migrate to `useFileUpload().upload({ kind: 'file', ... })` in their own paste handlers, or to a thin `<PasteImageHandler>` rewritten on top of the new hook |
| components/ui/file-upload/PasteImageHandler.tsx | 63 | hidden host that calls `usePasteImageUpload` | MODIFY | rewrite on top of new `useFileUpload`; signature stays the same to avoid touching the 5+ chat-input callers |
| components/ui/file-upload/useClipboardPaste.ts | 69 | clipboard listener; calls user-supplied onPasteImages | MODIFY | rewire to new upload primitive; 3 prompt-input callers |
| components/ui/file-upload/ImageUploadField.tsx | 142 | drag-drop field — uses `useFileUpload` from `features/file-handler` | MODIFY | import path update only |
| components/ui/file-upload/file-upload.tsx | 758 | entity-form generic file-upload component | MODIFY | rewire to `useFileUpload` from `features/files`; preserve component API |

---

### `components/official/` (canonical reusable uploaders)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| components/official/ImageAssetUploader.tsx | 803 | DUAL upload path: `useGuardedFileUpload` (cloud-files) + `uploadAsset` (`/assets` for presets/variants); auto-routes by `pipeline` prop | MODIFY | unify into single `useFileUpload({ preset, variants, share, permissions })` — pipeline prop deletes (`/assets` is now the only path). Surfaces `errors[]` partial-success for variant render failures (toast + retry). |
| components/official/image-cropper/ImageCropper.tsx | 292 | crop + upload via `useFileUploadWithStorage` shim OR `uploadAsset` (asset mode) | MODIFY | unify on `useFileUpload({ preset })`; cropped blob → File wrapped as upload source |
| components/official/image-cropper/ImageCropperWithSelect.tsx | 81 | variant of cropper | MODIFY | as above |
| components/official/image-cropper/EasyImageCropper.tsx | 102 | simplified cropper | MODIFY | as above |
| components/official/__tests__/ImageAssetUploader.test.ts | n/a | test for uploader | MODIFY | retire tests for deleted dual-path branches |

---

### `components/image/` (image-manager surface)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| components/image/ImageManager.tsx | 334 | aggregator over upload/cloud/studio tabs | MODIFY | callers via `useFileUploadWithStorage` reference (comment + path) — verify no live usage; otherwise import-path-only update |
| components/image/cloud/CloudUploadTab.tsx | 278 | wraps `<ImageAssetUploader>` for image-manager — has `ensureFolderPath` call | MODIFY | rewire to new `useFileUpload`; folder-ensure now part of upload options (A.1) |
| components/image/cloud/CloudFilesBrowserTable.tsx | 1006 | browser — uses `useFileActions` for rename/move/delete/share + has drag-drop move | MODIFY | rewire to `useFileMutation` |
| components/image/cloud/CloudImagesTab.tsx | 731 | image-only filter view, identical action surface | MODIFY | rewire to `useFileMutation` |

Note: plan §6.3 explicitly says "3 of 4 `features/image-manager/components/*Tab.tsx` (use `<EmbeddedShell>` + kind filter)" are deleted. The corresponding `components/image/cloud/*Tab.tsx` files are the equivalents.

---

### `features/image-manager/` (registry hub)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/image-manager/components/BrandedUploadTab.tsx | 285 | wraps `<ImageAssetUploader preset="web">` for branded org uploads | MODIFY | rewire ImageAssetUploader API surface (consolidation pulls preset/variants into hook options) |
| features/image-manager/components/ProfilePhotoTab.tsx | 130 | wraps `<ImageAssetUploader preset="avatar">` | MODIFY | as above |
| features/image-manager/components/ToolsTab.tsx | 547 | aggregator | MODIFY | rewire any direct write deps |
| features/image-manager/components/FullImageStudioTab.tsx | 67 | embeds image studio | MODIFY | wire to new save-edited-image path |

---

### `features/image-studio/` (Sharp deletion, save flow rewire)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/image-studio/hooks/useImageStudio.ts | 1008 | calls `/api/images/studio/process` (Sharp) for variants; dispatches `uploadFiles` thunk on save | MODIFY | replace `/api/images/studio/process` POST with `POST /assets/preview` (E.16); replace save with new `useFileUpload` |
| features/image-studio/components/useCropStudioController.ts | 713 | uses `cloudUploadMany` from `features/files/upload/cloudUpload` | MODIFY | switch to new `upload()` primitive (multi-file overload) |
| features/image-studio/modes/shared/save-edited-image.ts | 41 | `fileHandler.upload(...)` for edited blob | MODIFY | rewire to new `fileHandler.upload` (same name, new location); pass `share` / `permissions` / `variants` as combined options if needed |
| features/image-studio/api/python.ts | 225 | uses `postJson` from `features/files/api/client.ts` | MODIFY | import-path-only update; uses regenerated client |
| features/image-studio/hooks/useBase64Decoder.ts | 312 | decodes pasted base64 → File → save via image-studio | MODIFY | rewire upload step |
| features/image-studio/modes/avatar/AvatarModeShell.tsx | n/a | avatar-mode shell — saves through `uploadAsset({ preset: "avatar" })` | MODIFY | unify on `useFileUpload` |
| features/image-studio/components/ImageStudioShell.tsx | n/a | shell for studio | MODIFY | rewire save action |
| features/image-studio/modes/shared/types.ts | n/a | shared types | MODIFY | reflect new upload signature |
| features/image-studio/components/EmbeddedImageStudio.tsx | n/a | embedded variant — `/api/images/proxy` referenced (already deleted) | MODIFY | clean up dead path |
| features/image-studio/components/StudioVariantTile.tsx | n/a | renders variant tiles | MODIFY | uses new Asset envelope variant shape |
| features/image-studio/types.ts | n/a | `pipeline` etc. | MODIFY | drop dual-path types |

---

### `features/podcasts/` (podcast upload paths)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/podcasts/components/admin/AssetUploader.tsx | 276 | DUAL: `<ImageAssetUploader preset="podcast">` for image + DIRECT `api.upload(ENDPOINTS.media.uploadPodcastVideo, formData)` POST for video | MODIFY | image: rewire via new `useFileUpload({ preset: "podcast" })`. Video: stays direct-to-Python (`/media/podcast/upload-video` — Python-owned endpoint), BUT response handling switches to canonical Asset envelope (already returns `data.asset`) |

---

### `features/audio/`, `features/transcripts/` (recording finalization)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/audio/services/audioFallbackUpload.ts | 206 | dispatches `uploadFiles` thunk for fallback audio capture | MODIFY | switch to new `upload()` primitive (`folder: "Audio/Fallback"`, `visibility: "private"`) |
| features/transcripts/service/audioStorageService.ts | 162 | uses `fileHandler.upload` directly with 5-retry loop | MODIFY | new `fileHandler.upload` location; retry semantics preserved |
| features/transcripts/service/transcriptsService.ts | 505 | imports `deleteAudioFromStorage` lazily | MODIFY | callsite updates (delete still through `Files.deleteFile`) |
| features/transcripts/components/CreateTranscriptModal.tsx | 766 | uses `<FileUploadWithStorage>` shim for audio uploads | MODIFY | switch to `<FileUploadDropzone>` from `features/files`; finalization through new upload primitive |

---

### `features/tasks/` (task attachments)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/tasks/services/taskService.ts | 866 | dispatches `uploadFiles` thunk (aliased `cloudUploadFiles`); legacy `attachments` bucket already removed per file-handler FEATURE.md | MODIFY | switch to new upload primitive; drop the alias |
| features/tasks/components/TaskAttachments.tsx | 177 | dropzone wrapper | MODIFY | rewire |
| features/tasks/components/TaskAttachmentsPanel.tsx | 411 | full attachments panel — drag-drop, delete, share | MODIFY | rewire to `useFileUpload` + `useFileMutation` |
| features/tasks/components/TaskDetails.tsx | n/a | uses `<FileUploadWithStorage>` shim | MODIFY | switch to `<FileUploadDropzone>` |
| features/tasks/components/TaskDetailPage.tsx | n/a | also references `useSharing` (resource-type sharing — not file sharing) | KEEP | no file-write change needed |
| features/tasks/components/TaskDetailsPanel.tsx | n/a | same | KEEP | as above |

---

### `features/rag/` (library and data-stores direct uploads)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/rag/components/library/LibraryPage.tsx | 862 | imports `uploadFile` from `features/files/api/files` and calls it directly + uses `postJson` for ingest | MODIFY | switch to `useFileUpload({ folder: "RAG/Library", ... })`; ingest stays via Python ingest endpoint |
| features/rag/components/data-stores/DataStoresPage.tsx | 953 | same pattern — direct `uploadFile` call | MODIFY | switch to `useFileUpload({ folder: "RAG/DataStores", ... })` |
| features/rag/components/library/LibraryPreviewPage.tsx | n/a | preview only | KEEP | no write |
| features/rag/components/library/IngestProgressDialog.tsx | n/a | read-only progress | KEEP | no write |

---

### `features/code-files/`, code editor (cloud-file save flow)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/code-files/service/s3Service.ts | 77 | wraps `fileHandler.upload` + `Files.deleteFile` for code-files write/delete | MODIFY | new fileHandler import path; same semantics |
| features/code-files/redux/thunks.ts | 194 | code-files thunks — save via service | MODIFY | call-site updates only |
| features/code-files/redux/slice.ts | 216 | code-files slice | MODIFY | adjust types if envelope shape changes |
| features/window-panels/windows/code/CodeFileManagerWindow.tsx | 775 | code-file manager window — context menu actions | MODIFY | rewire to new mutation hook |
| features/window-panels/windows/code/useCodeFileManager.ts | 409 | manager state machine | MODIFY | rewire write dispatches |

---

### `features/canvas/`, `features/whatsapp-clone/` (direct write paths)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/canvas/social/ShareCoverImagePicker.tsx | 292 | DIRECT `uploadAsset({ preset: "social", ... })` call from `features/files/api/assets` | MODIFY | switch to `useFileUpload({ preset: "social", ... })` |
| features/whatsapp-clone/chat-view/MessageInputBar.tsx | 333 | DIRECT `uploadFileWithProgress` from `features/files/api/files` — for chat attachments | MODIFY | switch to `useFileUpload`; pass per-message progress through |

---

### `features/pdf-extractor/`, `features/pdf-demo/`, PDF compress (Next.js route deletion)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/pdf-demo/components/PdfSourcePicker.tsx | 221 | uses `useFileUpload` from `features/file-handler` | MODIFY | import-path update; pre-flight + share-link grant via combined op |
| features/pdf-extractor/components/ManipulationPanel.tsx | 1127 | direct `uploadFile` from `features/files/api/files` after PDF manipulation | MODIFY | switch to `useFileUpload({ preset: "raw" })` |
| features/pdf-extractor/studio/PdfStudioReader.tsx | 1803 | direct `uploadFile` calls — saves derived PDFs | MODIFY | switch to `useFileUpload` |
| features/pdf-extractor/studio/PdfStudioUpload.tsx | 362 | source picker for PDF studio | MODIFY | rewire |
| features/pdf-extractor/components/PdfExtractorWorkspace.tsx | 1344 | `fetch ${backendUrl}/pdf/batchExtract` — Python direct, no `cld_files` write | KEEP | not a cld_files write; Python batch endpoint; preserve direct-to-Python |
| features/pdf-extractor/hooks/usePdfExtractor.ts | 923 | same Python batch — `FormData → fetch` | KEEP | direct-to-Python, no cloud-files write |
| hooks/usePdfOptimize.ts | n/a | `fetch('/api/pdf/compress', { method: 'POST', body: formData })` | MODIFY | replace with `POST /assets/pdf-compress` (E.17); delete `/api/pdf/compress` route |

---

### `features/public-chat/`, `features/resource-manager/` (resource pickers)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/public-chat/components/ChatInputWithControls.tsx | 698 | uses `useFileUpload` from `features/file-handler` for anonymous-user uploads | MODIFY | import-path update; preserves anonymous lane (same anon Supabase UUID) |
| features/public-chat/components/resource-picker/PublicUploadResourcePicker.tsx | 404 | `useFileUpload` + DIRECT `fetch('/api/pdf/compress')` for PDF compression | MODIFY | import-path update; PDF compress → `POST /assets/pdf-compress` |
| features/resource-manager/resource-picker/UploadResourcePicker.tsx | 429 | `useFileUpload` + DIRECT `fetch('/api/pdf/compress')` | MODIFY | same as above |
| features/resource-manager/resource-picker/FilesResourcePicker.tsx | 384 | uses `supabase.storage` DIRECTLY (last live caller, banned per plan §6.4) | MODIFY | rewire to `useFile`/`useFileMutation` read+write through cloud-files |

---

### `features/agents/`, `features/agent-apps/`, `features/cx-chat/`, `features/cx-conversation/` (chat-input uploaders)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/agents/components/inputs/smart-input/AgentTextarea.tsx | 278 | `useFileUpload` from `features/file-handler` | MODIFY | import-path update |
| features/agents/components/inputs/input-components/MediaVariableInput.tsx | 326 | `useFileUpload` from `features/file-handler` | MODIFY | import-path update |
| features/agent-apps/components/inputs/AgentAppImageField.tsx | 161 | `useFileUpload` from `features/file-handler` | MODIFY | import-path update |
| features/cx-chat/components/user-input/ConversationInput.tsx | 758 | `useFileUpload` from `features/file-handler` | MODIFY | import-path update |
| features/cx-conversation/ConversationInput.tsx | 879 | `useFileUpload` from `features/file-handler` | MODIFY | import-path update |
| features/agents/redux/execution-system/instance-resources/resource-source.ts | 114 | dispatches to `fileHandler` primitives | MODIFY | import-path update |

---

### `features/prompts/`, `features/chat/` (LEGACY but still in tree)

These are part of the active Prompts→Agents migration (see CLAUDE.md §Active Migration). Touching them here for the file consolidation is **unavoidable** — the migration plan instructs not to delete them until phases 16-19, so we rewire imports rather than delete.

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/prompts/components/PromptInput.tsx | 633 | `useFileUpload` from `features/file-handler` + `useClipboardPaste` | MODIFY | import-path update |
| features/prompts/components/smart/SmartPromptInput.tsx | 805 | `fileHandler.upload` direct + `useClipboardPaste` | MODIFY | import-path update |
| features/prompts/components/smart/CompactPromptInput.tsx | 395 | `fileHandler.upload` direct + `useClipboardPaste` | MODIFY | import-path update |
| features/chat/components/input/PromptInputContainer.tsx | n/a | `<FileUploadWithStorage>` shim | MODIFY | switch to new dropzone |
| features/chat/components/input/AudioPlanToggleButton.tsx | n/a | `<FileUploadWithStorage>` shim | MODIFY | as above |
| features/chat/components/input/mobile/MobileAudioPlan.tsx | n/a | `<FileUploadWithStorage>` shim | MODIFY | as above |
| features/chat/components/input/TextInput.tsx | n/a | `<PasteImageHandler>` | MODIFY | uses rewritten handler |
| hooks/ai/chat/useFileManagement.ts | n/a | management hook coordinating `<FileUploadWithStorage>` notifications | MODIFY | rewrite around new `useFileUpload` status |

---

### `features/window-panels/` (feedback + code windows)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/window-panels/windows/FeedbackWindow.tsx | 897 | `useFileUpload` from `features/file-handler` for feedback screenshot uploads | MODIFY | import-path update; surface `errors[]` for combined upload-and-share grants |
| features/window-panels/windows/ShareModalWindow.tsx | n/a | wraps `<ShareModal>` (resource-type sharing, not file) | KEEP | no file-write change |
| app/(authenticated)/(admin-auth)/administration/feedback/components/FeedbackDetailDialog.tsx | n/a | `useFileUpload` from `features/file-handler` for admin feedback image uploads | MODIFY | import-path update |

---

### `features/applet/` (applet builder file fields)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/applet/builder/modules/field-builder/FieldRenderer.tsx | n/a | `<FileUploadWithStorage>` shim | MODIFY | switch to new dropzone |
| features/applet/runner/fields/FileUploadField.tsx | n/a | `<FileUploadWithStorage>` shim | MODIFY | as above |
| components/matrx/toggles/FileUploadDialogToggleButton.tsx | n/a | `<FileUploadWithStorage>` shim | MODIFY | as above |
| components/socket-io/form-builder/field-components/SocketTaskMultiFileUpload.tsx | n/a | uses redux thunk uploadFile/deleteFile (legacy file-system slice — already dead) | KEEP | dead code; legacy reducer was deleted — no longer reachable. If touched, delete in same PR. |

---

### Next.js API write routes (DELETIONS)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| app/api/images/studio/process/route.ts | 434 | Sharp-based variant render route | DELETE | replaced by `POST /assets/preview` (E.16). `sharp` removed from `package.json`. |
| app/api/pdf/compress/route.ts | 88 | Node PDF compressor proxy | DELETE | replaced by `POST /assets/pdf-compress` (E.17). 3 callers (`hooks/usePdfOptimize.ts`, `PublicUploadResourcePicker`, `UploadResourcePicker`) migrate. |

Already-deleted routes referenced by the plan (`/api/images/upload`, `/api/images/proxy`, `/api/files/download`, `/api/admin/feedback/images`, `/api/share/[token]/file`, `/api/code-files/upload`, `/api/code-files/download`, `/api/prompt-apps/generate-favicon`) are confirmed gone — no impact.

Routes that stay direct-to-Python and are NOT cloud-files writes (keep as-is):

| File | Why it's fine |
|---|---|
| app/api/audio/transcribe-url/route.ts | server-side proxy to Python /audio/transcribe-url; no cloud-files write |
| app/api/audio/transcribe/route.ts | same |
| app/api/audio/log-error/route.ts | log-only, no write |
| features/research/hooks/useResearchApi.ts | uploads to research-specific Python endpoint, not cloud-files |
| features/file-analysis/api/file-analysis.ts | Python file-analysis endpoint, no cloud-files write |

---

### Admin / demo / test pages that initiate writes

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| app/(dev)/demos/cloud-files-debug/CloudFilesDebugClient.tsx | 1027 | manual `fetch('/files/upload')` + `/files/{id}` PATCH/DELETE etc. for debug | MODIFY | rewire to new combined-op contract; useful as a sanity surface for partial-success `errors[]` |
| app/(authenticated)/(admin-auth)/administration/official-components/component-displays/image-asset-uploader.tsx | n/a | demo for `<ImageAssetUploader>` | MODIFY | reflects unified API |
| app/(authenticated)/(admin-auth)/administration/official-components/component-displays/image-cropper.tsx | n/a | demo for `<ImageCropper>` | MODIFY | reflects unified API |
| app/(authenticated)/(admin-auth)/administration/official-components/component-displays/file-upload-with-storage.tsx | n/a | demo for the deprecated shim | DELETE | shim is deleted |
| app/(authenticated)/(admin-auth)/administration/official-components/component-displays/paste-image-handler.tsx | n/a | demo for paste handler | MODIFY | rewrite on top of new hook |
| app/(authenticated)/(admin-auth)/administration/official-components/component-displays/image-manager.tsx | n/a | demo for image-manager | MODIFY | reflects new internal hooks |
| app/(authenticated)/(admin-auth)/administration/official-components/component-displays/image-manager-row.tsx | n/a | row demo | MODIFY | as above |
| app/(authenticated)/(admin-auth)/administration/official-components/component-displays/image-manager-icon.tsx | n/a | icon demo | MODIFY | as above |
| app/(authenticated)/(admin-auth)/administration/official-components/parts/component-list.tsx | n/a | demo registry | MODIFY | remove deleted entries |

Test pages confirmed read-only or out-of-scope:

| File | Why out of scope |
|---|---|
| app/(public)/free/zip-code-heatmap/components/FileUpload.tsx | local CSV parse only, no cloud-files write |
| components/user-generated-table-data/ImportTableModal.tsx | local CSV/XLSX parse only, no cloud-files write |
| app/(public)/demos/api-tests/pdf-extract/PdfExtractClient.tsx | direct PDF extract via Python, no cld_files write |
| app/(authenticated)/tests/qr-labels/* | local QR generation only |
| app/(dev)/demos/pdf-processing/compress/page.tsx | wraps `usePdfOptimize` — covered by the hook migration above |

---

### `features/notes/` (note share dialog)

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| features/notes/components/ShareNoteDialog.tsx | 260 | uses `utils/permissions` (resource-type sharing), not file sharing | KEEP | not in this scope |
| features/notes/components/NoteContentEditor.tsx | n/a | note text editing; refs to `utils/permissions` only | KEEP | not in this scope |
| features/notes/components/NoteTabItem.tsx | n/a | uses `useSharing` from `utils/permissions` | KEEP | not in this scope |

---

### `lib/api/endpoints.ts`, `types/python-generated/`

| File | Lines | Current behavior | Action | What changes |
|---|---|---|---|---|
| lib/api/endpoints.ts | n/a | endpoint registry — has `media.upload`, `media.detail`, `media.patch`, `media.addVariants`, `media.presets`, `media.uploadPodcastVideo` | MODIFY | regenerate; combined-op endpoints get added |
| types/python-generated/api-types.ts | n/a | OpenAPI-generated types | MODIFY | regenerated on every BE release |
| scripts/migrate-public-assets-to-cdn.ts | n/a | one-off CDN migration script (still references `/files/upload` and supabase.storage) | KEEP | a one-off script; will be retired separately. Not on the runtime write path. |

---

### KEEP files (write-path-adjacent but unchanged)

| File | Why kept |
|---|---|
| features/files/redux/converters.ts | THE sanctioned MediaRef-builder location — ESLint-fenced |
| features/files/utils/folder-conventions.ts | path conventions; no write |
| features/files/components/pickers/FilePicker.tsx + cloudFilesPickerOpeners.ts | read-only selection |
| features/files/virtual-sources/registry.ts and source declarations | data-only |
| features/files/hooks/useFolderContents.ts, useStorageQuota.ts | read-only |

---

## Cross-cutting patterns being eliminated

- **All 16 callers of `useFileUploadWithStorage` (and `<FileUploadWithStorage>`) migrate to `useFileUpload` from `features/files` — the legacy shim deletes.**
- **All callers of `useFileUpload` from `features/file-handler/hooks/useFileUpload`** (12+ files including every chat-input) move to `useFileUpload` from `features/files/hooks/useFileUpload` — pure import-path update for most. Cross-feature ESLint rule banning imports from `features/file-handler/*` enforces.
- **All direct `uploadAsset` / `uploadFile` / `uploadFileWithProgress` calls** (canvas social, RAG library/data-stores, whatsapp clone, pdf-extractor, image-studio) collapse into `useFileUpload` — calling components no longer reach into `features/files/api/*` directly. ESLint rule banning imports from `features/files/api/*` outside `features/files/` enforces.
- **`<PasteImageHandler>` + `useClipboardPaste`** consolidate onto the new `useFileUpload` primitive internally; component/hook signatures preserved to avoid touching 8+ chat-input call sites a second time.
- **Dual upload paths in `ImageAssetUploader` and `ImageCropper`** (asset vs file) collapse to one — the `pipeline` prop deletes.
- **`/files/bulk-delete` + `/files/bulk-move` thunks** (`bulkDeleteFiles`, `bulkMoveFiles`, `bulkMoveFolders`) collapse to a single `useFileMutation.bulk({ ids, op })` (A.3).
- **`rename + move` and `share + permissions + variants` bundles** that today take 2-4 round-trips collapse to one combined `PATCH /files/{id}` or one `POST /assets` (A.1/A.2). Every menu/dialog that composes these moves to a single mutation call.
- **Last live `supabase.storage` site** (`FilesResourcePicker.tsx`) eliminates — ESLint ban applies globally outside `features/files/`/`features/file-handler/`.
- **Sharp deletion + `/api/images/studio/process` and `/api/pdf/compress` route deletions** mean Image Studio and PDF compression go fully direct-to-Python.

---

## Migration dependencies

1. **Phase 0 ESLint chokepoint must land first.** It locks the boundary — no new bypass can land. None of the write-path migration depends on backend v1.1.0, so this can ship immediately and start fencing.

2. **`useFileUpload` return shape MUST include `errors[]` partial-success array from day one.** This is a small contract change but baking it in early means we don't retrofit later. The new shape: `{ upload, uploading, progress, error, errors }` where `errors` is the per-sub-op failure array on the response (A.1/A.2 best-effort atomicity).

3. **`useFileMutation` return shape MUST also include `errors[]`** for combined-op responses (`patch`, `bulk`).

4. **OpenAPI type regeneration (`pnpm gen:types`) must precede client/thunks rewiring** — handwritten Asset types delete first to avoid drift.

5. **`features/file-handler/` cannot delete until every caller has rewired.** The plan's PR3 sequence (steps 3 → 8 → 25) enforces this — merge file-handler into files first, then sweep callers, then delete the directory in step 25.

6. **`cloudUpload` cannot delete until `upload()` primitive is in place AND `<ImageAssetUploader>`, `<ImageCropper>`, useCropStudioController are rewired.**

7. **`/api/pdf/compress` and `/api/images/studio/process` routes cannot delete until BE v1.1.0 ships `POST /assets/preview` and `POST /assets/pdf-compress` (E.16, E.17).** Other write-path migration items have no BE dependency.

8. **`<FileUploadWithStorage>` cannot delete until all 16 callers migrate** — the longest single migration. Recommended order: applet runner/builder → chat input → tasks/transcripts → feedback → image-manager → official-components demo.

9. **Bulk-op consolidation (A.3) requires BE v1.1.0** — `bulkDeleteFiles`/`bulkMoveFiles` thunks stay through the transition; flip them to `bulkOperate({ op })` after the BE PR lands.

---

## Handling A.1/A.2 partial-success (`errors[]` array)

The backend confirmed combined-op endpoints are **best-effort atomic, not full rollback** (plan §5). The bytes upload always lands; sub-op failures (share-link grant, permission grant, variant render) come back in a top-level `errors[]` array. FE must surface those.

### Call sites that need partial-success UX

| Call site | What can fail in addition to upload | UX pattern |
|---|---|---|
| `features/files/components/core/FileUploadDropzone/FileUploadDropzone.tsx` (+ UploadProgressList) | bundled share / permissions / variants on upload | per-entry status row: green check for upload, yellow warning chip for failed sub-op with "Retry share" / "Retry permissions" inline button |
| `components/official/ImageAssetUploader.tsx` | failed variant render (any of `og_image_url`, `social_card`, `thumbnail_url`, etc.) | toast: "Image uploaded; some variants failed to render. [Retry]". Card-level error chip with affected variant list. |
| `features/files/components/core/ShareLinkDialog/ShareLinkDialog.tsx` (when used post-upload) | share-link creation failure | inline error banner in dialog with retry button (dialog stays open) |
| `features/files/components/core/PermissionsDialog/PermissionsDialog.tsx` | per-row permission grant failure | per-row red error icon + retry button per row |
| `features/files/components/surfaces/desktop/BulkActionsBar.tsx` (A.3 bulk ops) | per-item failure on bulk move/delete/restore | toast: "N of M items processed; M-N failed. [View details]" → modal listing failures with retry-all |
| `features/window-panels/windows/FeedbackWindow.tsx` | screenshot upload + bundled share grant for admin visibility | toast: "Screenshot uploaded; couldn't grant admin access — retry?" |
| `features/canvas/social/ShareCoverImagePicker.tsx` | bundled share-with-org on upload | toast: "Cover uploaded; share failed — retry?" |
| `features/podcasts/components/admin/AssetUploader.tsx` | video upload variant extraction failure | per-variant chip showing missing variants with "Re-render" button |
| `features/files/redux/thunks.ts` (`uploadFiles`, `renameFile`, `moveFile`, etc.) | any combined op | thunk emits `meta.errors[]`; selectors expose per-file/per-op error state; UI consumes selector |
| `features/files/components/core/FileContextMenu/useFileMenuActions.ts` (rename+move combined as A.2 patch) | one of {rename, move} succeeded, other failed | toast describing exact failure: "Renamed to X but couldn't move to /Y — retry?" |
| `features/rag/components/library/LibraryPage.tsx`, `features/rag/components/data-stores/DataStoresPage.tsx` | upload succeeded but RAG-ingest sub-op failed (if bundled later) | inline error in upload row with retry-ingest button |
| `features/image-studio/modes/shared/save-edited-image.ts` | bundled `createShareLink: true` failure | toast: "Image saved; share-link failed — open Share dialog to retry" |
| `features/tasks/components/TaskAttachmentsPanel.tsx` | bundled task-link grant failure | inline retry chip per attachment |

### Standard pattern for hook return

```ts
const { upload, uploading, progress, error, errors } = useFileUpload();
// error: Error | null — fatal upload failure
// errors: { op: 'share' | 'permissions' | 'variants' | ...; subop?: string; message: string }[] — partial sub-op failures
```

Combined-mutation:

```ts
const { patch, busy, error, errors } = useFileMutation(fileId);
await patch({ name: "x", folder: "/Y", share: {...}, permissions: [...] });
// errors[] surfaces per sub-op failure of A.2 union body
```

### `errors[]` propagation through Redux

- `uploadFiles` thunk emits `errors[]` on `fulfilled` action's `meta.arg`.
- Slice tracks `state.uploads[id].errors` and `state.files[id].lastMutationErrors`.
- Selectors: `selectUploadErrors(uploadId)`, `selectFileMutationErrors(fileId)`.
- Realtime middleware does NOT clear `errors[]` on echo — only on explicit retry or dismiss.

---

## Open questions for the user

1. **Where do we surface `errors[]` aggregate for the whole session?** A "files needing attention" pill in the file-tree header, or notifications-center entries, or only inline at the original call site? Current proposal: inline + toast for first occurrence, no aggregate panel.

2. **Bulk-op (A.3) UX for >50 items.** Should we surface per-row errors directly, or batch into a summary modal? Current proposal: counter toast → modal on click. Need a maximum size we're willing to render row-by-row.

3. **`<PasteImageHandler>` / `useClipboardPaste` rewrite — do we preserve the current component/hook signatures verbatim,** or take this opportunity to converge on one API? 5+ chat-input components depend on each. Recommendation: preserve signature on `<PasteImageHandler>`, delete `useClipboardPaste` in favor of inline `useFileUpload` calls in the 3 prompt-input callers (they already differ).

4. **Image Studio dual-mode pricing.** Image Studio routes uploads either through `useFileUpload` (raw save) or through `/api/images/studio/process` (Sharp preview without persist). The new `POST /assets/preview` (E.16) replaces the preview path. Confirm: does the user want preview results to also be cacheable in the SW IDB cache, or are they always ephemeral?

5. **`features/research/hooks/useResearchApi.ts uploadFile`** uploads to a research-specific Python endpoint (`endpoints(topicId).sources.upload`), not cloud-files. Confirm this stays out of scope and continues to use its own endpoint, OR migrates to write through `useFileUpload({ folder: "Research/${topicId}/Sources" })` and the research backend reads from cloud-files instead.

6. **`scripts/migrate-public-assets-to-cdn.ts`** is a one-off CDN migration script that references `/files/upload` and `supabase.storage`. Keep as-is (KEEP), or retire/move out of `scripts/` to avoid confusing ESLint? Recommendation: keep, mark with an `// eslint-disable` block, retire after next CDN milestone.

7. **`features/whatsapp-clone/`** still uses `uploadFileWithProgress` directly. It's not part of the migration matrix in `features/file-handler/FEATURE.md` migration plan — confirm it's intended as a production feature (rather than a sample/demo). If demo: move under `/demos/` and skip migration; if production: required MODIFY.

8. **`<FileUploadWithStorage>` migration order.** 16 callers across applet/chat/tasks/transcripts/feedback/image-manager. Single sweeping PR or feature-by-feature? Recommendation: single sweep within PR3 to keep the delete atomic — but flag if some feature should land first for risk reasons.

9. **A.3 bulk discriminator scope.** Plan calls out `op: "move" | "delete" | "restore" | "visibility" | "share"`. Do we also need `op: "permissions"` (bulk grant/revoke to N users) and `op: "trash"`? Today there's no bulk-permissions UX; if not needed in v1.1.0 we wait.

10. **`features/files/redux/rag-thunks.ts`** moves to `features/rag/redux/thunks.ts` per plan §6.3, but `features/rag/` doesn't have a `redux/` subdir yet (it's in `features/rag/api/`). Confirm target location.
