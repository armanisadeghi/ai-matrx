# Impact inventory — bypasses & cross-cutting unification opportunities

**Date:** 2026-05-13
**Scope:** Sister inventory to `docs/FILE_HANDLING_CONSOLIDATION_PLAN.md` v2 — focuses on **L0 bypasses** (every callsite that reaches around the canonical file API) and **cross-cutting patterns** that should collapse to one component when the rebuild lands. Other agents are mapping read/write/state/cache/routes by directory; this doc is bypass-and-unification only.

## Summary

- **L0 bypass call sites today (post-2026-05-07 obliteration round):** ~30 total — mostly clustered in `components/image/cloud/**`, `features/rag/components/**`, `features/pdf-extractor/**`, `features/transcripts/service/audioStorageService.ts`, `features/agents/hooks/useAiImageUrl.ts`, `components/official/ImageAssetUploader.tsx`, `components/mardown-display/blocks/images/ImageOutputBlock.tsx`. **Zero remaining `supabase.storage.*` and zero remaining `getPublicUrl`/`createSignedUrl` callsites** in source (only doc comments and worktrees survive — and worktrees are out of scope).
- **Migrate-to targets after consolidation:** 5 hooks (`useFile`, `useFileSrc`, `useFileBlob`, `useFileUpload`, `useFileMutation`) + 1 facade (`fileHandler`) + 3 components (`<InlineMediaRef>`, `<FilePreview>`, `<FileUploadDropzone>`).
- **Cross-cutting patterns identified for collapse:** 11 (see Part 2). The biggest collapses are **avatar rendering** (≥14 ad-hoc `<AvatarImage src=…>` callsites across 13 files), **applet/app/podcast cover images** (≥15 callsites in `features/applet/**` + `features/podcasts/**`), **org logo rendering** (5 callsites in `features/organizations/**`), and **paste-image handlers** (3 parallel implementations).

---

## Part 1 — Every L0 bypass (the migration target list)

### supabase.storage.* call sites

**Zero in source.** The obliteration round on 2026-05-07 (Change Log) deleted every direct call.

| File | Lines | What it does | Migration target |
|---|---|---|---|
| (none in source) | — | — | — |

Remaining mentions are documentation comments only:
- `features/resource-manager/resource-picker/FilesResourcePicker.tsx:8` — comment
- `features/file-handler/handler.ts:7` — comment
- `features/audio/services/audioFallbackUpload.ts:9` — comment

Worktree copies at `.claude/worktrees/**` still contain calls — out of scope for this PR.

### Direct fetch() to file URLs (Next.js API routes that the plan deletes)

| File | Lines | URL pattern | Migration target |
|---|---|---|---|
| `features/resource-manager/resource-picker/UploadResourcePicker.tsx` | 110 | `fetch("/api/pdf/compress", ...)` | `POST /assets/pdf-compress` via `fileHandler.upload(..., { preset: "pdf-compress" })` after PR1 ships matrx-utils v1.1.0 (E.17). Plan §6.3 deletes the Next route. |
| `features/public-chat/components/resource-picker/PublicUploadResourcePicker.tsx` | 80 | `fetch("/api/pdf/compress", ...)` | Same as above. |
| `hooks/usePdfOptimize.ts` | 57 | `fetch('/api/pdf/compress', ...)` | Same as above. Hook becomes a thin wrapper over `useFileUpload`. |
| `features/image-studio/hooks/useImageStudio.ts` | 366 | `fetch("/api/images/studio/process", ...)` | `POST /assets/preview` via `useFileMutation(...).addVariants({ preset })` after PR1 (E.16). Plan §6.3 deletes the Next route + drops `sharp` from `package.json`. |
| `app/(public)/share/[token]/page.tsx` | 61–64 | `fetch("${baseUrl}/share/${token}", ...)` (server-side, direct to Python) | Already direct-to-Python — keep, but route through `features/files/client/client.ts:getJson` for consistent auth/idempotency-key/request-id stamping. Currently raw `fetch`. |
| `app/api/pdf/compress/route.ts` | 39 | The legacy Next route itself — `fetch` to OpenAI for compression | Delete the entire file after PR1 lands E.17. |

### Direct `Files.*` / `uploadAsset` / `patchAsset` call sites OUTSIDE the api/state/client layers

These are the calls that the plan §6.3 enumerates by name. Each must move to the new typed hooks. Today they exist in component and service files (illegal post-consolidation per Plan §6.4 ESLint rules: "no `Files.*` imports outside `features/files/api/*`").

| File | Function called | Migration target |
|---|---|---|
| `components/mardown-display/blocks/images/ImageOutputBlock.tsx:164` | `Files.getSignedUrl(fileId, ...)` | `useFile(ref, { signedUrlTtl: 8 * 3600 }).url` |
| `components/image/cloud/resolveCloudFileUrl.ts:48` | `Files.getSignedUrl(id, params)` | Replace `resolveCloudFileUrl` entirely with `useFileSrc(ref)` — see §6.3 deletions. |
| `features/resource-manager/resource-picker/FilesResourcePicker.tsx:267` | `Api.Files.getSignedUrl(file.id, ...)` | `useFile(ref).url` (component is one of the 4 `*Tab.tsx` slated for deletion per plan §6.3). |
| `features/transcripts/service/audioStorageService.ts:139` | `Files.deleteFile(fileId, { hardDelete: true })` | `useFileMutation(fileId).delete({ hard: true })` (or `fileHandler.mutate(fileId).delete({ hard: true })` for non-React) |
| `features/transcripts/service/audioStorageService.ts:103` | `Api.Files.getSignedUrl(fileId, ...)` | `fileHandler.use({ kind: "file_id", fileId }).as({ kind: "html_src" })` (already partially refactored). Verify single path. |
| `features/agents/hooks/useAiImageUrl.ts:132` | `Files.getSignedUrl(fileId, ...)` | DELETE the entire hook (Plan §6.3) — callers migrate to `useFile`. |
| `features/agents/hooks/useAiImageUrl.ts:128` | error path constructing UUID lookup | Same — delete with hook. |
| `features/tasks/services/taskService.ts:286` | `FilesApi.Files.getSignedUrl(fileId, ...)` | `fileHandler.use({ kind: "file_id", fileId }).as({ kind: "html_src" })` — service, not React. |
| `features/code-files/service/s3Service.ts:73` | `Files.deleteFile(args.s3_key, { hardDelete: true })` | `fileHandler.mutate(fileId).delete({ hard: true })`. |
| `features/audio/services/audioFallbackUpload.ts:103` | `Api.Files.getSignedUrl(fileId, ...)` | `fileHandler.use({ kind: "file_id", fileId }).as({ kind: "html_src" })`. |
| `features/file-handler/intelligence/refresh.ts:35` | `Files.getSignedUrl(fileId, ...)` | KEEP — this is internal to the resolver layer (allowed). After merge, moves to `features/files/resolver/refresh.ts`. |
| `features/files/hooks/useSignedUrl.ts:61` | `Files.getSignedUrl(id, params)` | DELETE the hook (Plan §6.3). |
| `features/whatsapp-clone/chat-view/MessageInputBar.tsx:18` | `uploadFileWithProgress` from `@/features/files/api/files` | `useFileUpload().upload(file, { folder: ..., visibility: "shared" })` |
| `features/rag/components/library/LibraryPage.tsx:56,144` | `uploadFile` from `@/features/files/api/files` | `useFileUpload().upload(...)` — explicitly called out for deletion in Plan §6.3. |
| `features/rag/components/data-stores/DataStoresPage.tsx:59,413` | `uploadFile` | Same as above — Plan §6.3. |
| `features/pdf-extractor/components/ManipulationPanel.tsx:48,107` | `uploadFile` | `useFileUpload().upload(...)`. |
| `features/pdf-extractor/studio/PdfStudioReader.tsx:61,437,488` | `uploadFile` | `useFileUpload().upload(...)`. |
| `components/official/ImageAssetUploader.tsx:44,409` | `uploadAsset` from `@/features/files/api/assets` | `useFileUpload().upload(file, { preset, ..., kind: "asset" })` — Plan §6.3 calls out this "dual upload path" specifically. |
| `features/canvas/social/ShareCoverImagePicker.tsx:28,69` | `uploadAsset` | Same as above. |
| `features/image-studio/components/useCropStudioController.ts:40` | imports from `@/features/files/upload/cloudUpload` (the file slated for deletion) | `useFileUpload().upload(...)`. |
| `features/file-handler/upload.ts:21` | `cloudUpload` | After merge this is internal — moves into `features/files/upload/upload.ts` as the single primitive. |

### `Api.Server.uploadFile` callers

| File | Lines | Migration target |
|---|---|---|
| `features/files/api/server-client.ts:166,188,261,303` | server-side mirror of `cloudUpload` | DELETE — `features/files/api/server-client.ts` (320 lines, plan §6.3 explicit). After Sharp deletion no server-side upload path is needed. |

### `uploadFiles` thunk dispatchers

| File | Lines | Migration target |
|---|---|---|
| `features/audio/services/audioFallbackUpload.ts:28,82` | dispatches `uploadFiles` thunk | `fileHandler.upload(source, opts)` (non-React facade) |
| `features/image-studio/hooks/useImageStudio.ts:38,538,748` | dispatches `uploadFiles` thunk twice | `useFileUpload()` in the hook |
| `features/files/components/core/FileEditor/CloudFileInlineEditor.tsx:27` | dispatches `uploadFiles` thunk | Stays inside `features/files/**` — internal use is OK; becomes one of the inputs to the unified `upload()` primitive. |
| `features/files/components/core/FileEditor/CloudFileEditor.tsx:46` | Same | Same |
| `features/files/upload/UploadGuardHostImpl.tsx:30` | Same | Same |

### Imports of soon-to-be-deleted hooks (Plan §6.3)

For each of the 13 deletions, every external importer + replacement.

#### `features/files/hooks/useSignedUrl.ts`
- `features/whatsapp-clone/modals/media/MediaTab.tsx:5,173` → `useFileSrc(ref)` (or `useFile(ref).url`)
- `features/files/components/core/FilePreview/FilePreview.tsx:29,170` → `useFile(ref, { target: "render" }).url`
- `features/files/components/core/MediaThumbnail/MediaThumbnail.tsx:29,123` → `useFile(ref, { variantKey: "thumbnail_url" }).url`

#### `features/files/hooks/useFileAsset.ts`
- `features/files/components/core/FilePreview/FilePreview.tsx:30,166` → `useFile(ref).asset`
- `features/files/components/core/MediaThumbnail/MediaThumbnail.tsx:30,114` → `useFile(ref).asset`

#### `features/agents/hooks/useAiImageUrl.ts` (252-line hook, plan §6.3 explicit delete)
- `components/mardown-display/blocks/images/ImageOutputBlock.tsx:42–43,110` → `useFile(ref, { signedUrlTtl: 8 * 3600 }).url` + use the same expiry-wheel for auto-refresh.
- `features/agents/components/notifications/ImageArrivalPeek.tsx:23,50` → `useFile(ref).url`

#### `features/file-handler/hooks/useFileSrc.ts` (kept by name, but signature changes from `FileSource` to `MediaRef`)
After the merge it lives at `features/files/hooks/useFileSrc.ts`. Callers migrate `useFileSrc({ kind: "file_id", fileId })` → `useFileSrc(fileIdToMediaRef(fileId))` (use the converter, not a manual literal).
- `features/transcripts/components/TranscriptViewer.tsx:13,48`
- `features/agents/components/inputs/input-components/MediaVariableInput.tsx:37,137`

#### `features/files/hooks/useFileDocument.ts`
Plan §6.3: "folded into `useFileBlob`". After the merge, callers use the asset envelope (`useFile(ref).asset.metadata.document_state`) for the state and `useFileBlob(ref)` for the bytes.
- `features/files/components/core/FileBadges/FileRagBadge.tsx:32,48`
- `features/files/components/surfaces/DocumentTab.tsx:51,81`
- `features/files/components/surfaces/FileLineageChip.tsx:29,40`
- `features/files/components/surfaces/FileInfoTab.tsx:40,58`

#### `features/files/hooks/useGuardedFileUpload.ts`
- `components/official/ImageAssetUploader.tsx:48,382` → `useFileUpload()` with `{ guard: true }` option
- `features/files/components/core/FileUploadDropzone/FileUploadDropzone.tsx:21,61` → Same — but this is the canonical dropzone, so it stays inside `features/files/` and becomes the internal caller.
- `features/files/components/surfaces/desktop/NewMenu.tsx:34,44` → Same — internal to features/files.

#### `components/ui/file-upload/useFileUploadWithStorage.ts` (legacy compat shim)
- `components/ui/file-upload/FileUploadWithStorage.tsx:7,45` → `useFileUpload()`. Plan §6.3 explicitly cites this hook (16 callers per plan, current count is just the wrapper component).
- The wrapper file `FileUploadWithStorage.tsx` itself is also banned (`@/components/ui/file-upload/FileUploadWithStorage` import path goes away with the hook).

#### `components/ui/file-upload/usePasteImageUpload.ts`
- `components/ui/file-upload/PasteImageHandler.tsx:3,5,42` → `useFileUpload({ guard: false })` + the new `<PasteImageHandler>` component should consume `useFileUpload` directly.

#### `components/image/cloud/resolveCloudFileUrl.ts`
- `components/image/cloud/CloudFilesTab.tsx:58–59,164,191` → `useFile(ref).url` (component) or `fileHandler.use(ref).as({ kind: "html_src" })` (non-React)
- `components/image/cloud/CloudUploadTab.tsx:45–46,170` → Same
- `components/image/cloud/CloudImagesTab.tsx:94–95,324,356` → Same
- `components/image/cloud/cloudFilesBrowsePayload.ts:1` → Same

#### `features/files/utils/resolveRenderableImageUrl.ts`
- `components/image/cloud/resolveCloudFileUrl.ts:23,43,45` → both files fold together when consolidated; the inner `resolveRenderableImageUrl` is replaced by `resolveCloudFile()` inside the new `resolver/` directory.
- `features/files/hooks/useSignedUrl.ts:14–15,56` → going away (hook deleted).

#### `features/files/upload/cloudUpload.ts`
- `features/file-handler/upload.ts:19–21,60` → Single `features/files/upload/upload.ts` after merge.
- `features/image-studio/components/useCropStudioController.ts:40` → `useFileUpload().upload(...)`.

#### `features/file-handler/hooks/useFileMediaBlock.ts`
No external importers — it's only used internally. Folds into the resolver.

#### `features/file-handler/hooks/useFileDownloadUrl.ts`
No external importers found. After the merge, callers use `useFile(ref, { target: "download" }).url`.

### Direct `getJson` / `postJson` / `del` / `patchJson` imports from `@/features/files/api/client.ts`

Per plan §6.4, `features/files/client/*` becomes internal-only (ESLint ban on external import). Today these are used outside `features/files/**`:

| File | Lines |
|---|---|
| `features/rag/components/RepositoriesPage.tsx:35` |
| `features/rag/components/library/QuickSearchDialog.tsx:21` |
| `features/rag/components/library/LibraryPreviewPage.tsx:39` |
| `features/rag/components/library/LibraryPage.tsx:69` |
| `features/rag/components/library/LibraryDocDetailSheet.tsx:52` |
| `features/rag/hooks/useDataStores.ts:19` |
| `features/rag/hooks/useLibrary.ts:14` |
| `features/rag/api/search.ts:11` |
| `features/rag/api/ingest.ts:23` |
| `features/rag/api/document.ts:9` |
| `features/rag/api/stages.ts:25` |
| `features/page-extraction/api/stream.ts:13` |
| `features/file-analysis/api/file-analysis.ts:53` |
| `features/files/api/document-lookup.ts:25` |
| `features/pdf-extractor/state/thunks.ts:3` |

**Migration target:** these are NOT cloud-file calls — they are RAG / page-extraction / pdf-extractor calls that just happen to share Python's base-URL fetch primitive. Move `getJson` / `postJson` / `del` / `patchJson` to a shared `lib/python-client.ts` (or `lib/http.ts`) so RAG/page-extraction/PDF-extractor have an allowed import path, and tighten the ESLint rule to ban `features/files/client/*` imports outside `features/files/**`. (Plan §6.4 anticipates this — calls out `features/files/client/*` as internal.)

### Stray `fetch()` that touches signed URLs (download + blob fetch)

These are legitimate today (they pull bytes from Python or S3) but the rebuild should funnel them through `useFileBlob` / SW + IDB:

| File | Lines | Migration target |
|---|---|---|
| `features/files/components/core/RowContextMenu/RowContextMenu.tsx:155` | `useFileBlob(ref)` |
| `features/files/components/core/FileContextMenu/FileContextMenu.tsx:232` | `useFileBlob(ref)` |
| `features/files/components/surfaces/useFileShortcuts.ts:209,346` | `useFileBlob(ref)` |
| `features/files/api/client.ts:210,226,247,269,289,310,335,483,682,695` | Internal — stays (becomes `features/files/client/requests.ts`). |
| `features/files/api/server-client.ts:166,188,261` | DELETE entire file (plan §6.3). |

---

## Part 2 — Cross-cutting unification opportunities

### 2.1 Avatar rendering

User profile photos, contact avatars, message-author chips, share-target user chips, and org member avatars all build the same `<AvatarImage>` + fallback initials pattern, with different `src` resolution paths.

**Today (14 callsites across 13 files):**
- `components/user-nav.tsx:28` — header user nav
- `components/matrx/PublicHeaderAuth.tsx:68` — public layout header auth chip
- `components/layout/UserAvatar.tsx` — auth-aware layout avatar
- `features/cx-chat/components/sidebar/SidebarUserFooter.tsx:54` — chat sidebar footer
- `features/public-chat/components/sidebar/SidebarUserFooter.tsx:54` — public chat sidebar footer (duplicate of cx-chat)
- `features/landing/components/AuthAwareButton.tsx:80` — landing CTA
- `features/tasks/components/TaskAssigneePicker.tsx:88,190` — assignee picker (current + list)
- `features/sharing/components/tabs/ShareWithUserTab.tsx:266,300` — share-with-user contact rows + selected chip
- `features/whatsapp-clone/shared/WAAvatar.tsx:71` — WA avatar (also calls `Image src=`)
- `features/canvas/leaderboard/CanvasLeaderboard.tsx:85` — leaderboard rows
- `features/messaging/components/MessageBubble.tsx:108` — chat message avatar
- `features/messaging/components/ConversationList.tsx:264` — conversation row
- `features/workflows/results/registered-components/SerpResultsPage.tsx:177` — search-result favicons (third-party)
- `app/oauth/consent/ConsentClient.tsx:613` — OAuth consent screen avatar

**After:** Build `<UserAvatar mediaRef={…} fallbackName={…} size="sm|md|lg" />` as a thin wrapper over `<InlineMediaRef>` with a name-based initials fallback. It internally calls `useFileSrc(mediaRef)` so signed URLs get the auto-refresh, the SW byte cache covers 304s, and there's one source of truth for sizing (32/40/48/64 across the app today are uncoordinated).

**Migration notes:**
- `avatar_url` columns today hold a mix of public CDN URLs, Supabase Auth provider URLs (Google/GitHub), and our own cloud-file URLs. The wrapper accepts a plain URL fallback for the OAuth-provider case (which we don't own).
- For SerpResultsPage (third-party favicons), pass through as a raw URL — `<InlineMediaRef ref={urlToMediaRef(url)}>`. The SW caches it.

### 2.2 Logo rendering

**Today (~15 callsites):**
- Org logos: `features/organizations/components/OrgSidebar.tsx:146-148`, `features/organizations/components/GeneralSettings.tsx:294,303,306,311`, `features/organizations/components/OrganizationCard.tsx:139,141`, `features/organizations/components/CreateOrgModal.tsx:288`
- Applet / app cover images (used as logos and as cover art interchangeably): `features/applet/home/applet-card/Enhanced.tsx:37,39`, `features/applet/home/applet-card/Modern.tsx:68,70`, `features/applet/home/applet-card/Default.tsx:23,25`, `features/applet/home/applet-card/Glass.tsx:13` (uses `backgroundImage`), `features/applet/home/main-layout/Grid.tsx:94,96` (`<img src>`), `features/applet/builder/previews/AppletPreviewCard.tsx:57,60`, `features/applet/builder/modules/smart-parts/applets/SmartAppletList.tsx:410,413`, `features/applet/builder/modules/smart-parts/apps/SmartAppList.tsx:391,393` (`<img src>`), `features/applet/builder/modules/app-builder/AppEditor.tsx:188`
- Admin: `components/admin/applet-admin/AppConfigViewer.tsx:60,63`, `components/admin/applet-admin/AppletConfigViewer.tsx:269`
- App card via `components/applet/apps/AppletCard.tsx:91` passes `imageUrl` prop downstream

**After:** Same `<InlineMediaRef>` with `size="logo-sm|logo-md|logo-lg"` mapped to `logo_*` variant keys from the Plan's preset dimension table (Plan §Gap 3). For "no logo" fallback, the component takes an `initials` or `icon` prop. The org and applet cards collapse to `<EntityIcon entity={org|app|applet} size="md">` (a 30-line wrapper around `<InlineMediaRef>` that knows how to extract the entity's logo `MediaRef`).

**Migration notes:**
- Organization logos are stored as raw URLs in `organizations.logo_url` today (string column). After consolidation, this column becomes the master `file_id` and the wire envelope ships `logo_lg|logo_md|logo_sm` variants. The collapse is gated on the BE writing `logo_*` variants on upload (Plan §Gap 3).
- Applet `imageUrl` is similar but the schema column is the legacy public-URL form. Migration: when consolidation lands, write the new asset envelope to `app_id.logo_file_id` and migrate the column.
- `Glass.tsx:13` uses `backgroundImage={applet.imageUrl}` (CSS prop) — `<InlineMediaRef>` won't help. Either swap to an `<img>` underneath, or add a `mode="background"` to InlineMediaRef.

### 2.3 File-chip / attachment-chip

**Today:**
- `features/files/components/core/FileChip/FileChip.tsx` — the canonical, exists today (1 file, 1 import).
- `features/tasks/components/TaskAttachments.tsx:134,136` — bespoke task attachment row with filename + size
- `features/tasks/components/TaskAttachmentsPanel.tsx` — task attachments panel
- `features/files/components/preview/FileResourceChip.tsx` — a parallel chip in preview context
- Resource picker chips: `features/resource-manager/resource-picker/*`, `features/public-chat/components/resource-picker/*` — used for showing the picked-resource in the chat input draft (multiple variants in `cx-chat`, `cx-conversation`, `chat`, `prompts/components/PromptInput.tsx`, `agents/components/inputs/smart-input/AgentTextarea.tsx`).

**After:** One `<FileChip mediaRef={…} variant="inline|attachment|preview" onRemove? onOpen?>` component, plus the existing `<FileResourceChip>` becomes a variant. Tasks/RAG/chat all consume.

**Migration notes:** 4–5 of the resource-picker variants today build their own preview-thumbnail strip; they're all near-identical structure (icon + name + size + remove). Should collapse before the bypass sweep.

### 2.4 Image upload + crop + save

The "let user upload an image, optionally crop, then persist as an asset" flow lives in at least **5 places**:

**Today:**
- `components/official/ImageAssetUploader.tsx` (1063 lines) — the most complete; has paste, drag-drop, crop, preset selection, multi-image support.
- `components/official/image-cropper/ImageCropper.tsx`, `EasyImageCropper.tsx`, `ImageCropperWithSelect.tsx` — three crop UI variants
- `features/image-studio/**` — full Image Studio with crop, resize, format conversion (uses `useImageStudio`, `useCropStudioController`)
- `features/image-manager/components/BrandedUploadTab.tsx` — image-manager hub's branded upload tab
- `features/image-manager/components/ProfilePhotoTab.tsx` — profile photo specific
- `features/canvas/social/ShareCoverImagePicker.tsx` — share cover image
- `features/organizations/components/CreateOrgModal.tsx:288` + `GeneralSettings.tsx:294` — org logo set/edit (calls into `<ImageAssetUploader preset="logo">` today, but the modal frame is duplicated 2x)

**After:** One `<ImageAssetUploader preset={…} folder={…} aspect? crop? onAsset={…}>` is already the right canonical — it just needs:
1. Its internal dual-path (`uploadAsset` + `useGuardedFileUpload`) collapsed to a single `useFileUpload({ preset })` call (Plan §6.3 explicit deletion). 
2. The three `ImageCropper*` variants in `components/official/image-cropper/` collapsed to one `<ImageCropper>` with a `mode="select-and-crop"` prop.
3. `BrandedUploadTab.tsx`, `ProfilePhotoTab.tsx`, `ShareCoverImagePicker.tsx` become 30-line wrappers that mount `<ImageAssetUploader>` with the right preset.

**Migration notes:** `<ImageAssetUploader>` is already the closest thing to canonical. The work is *removing* the others, not building a new one.

### 2.5 Paste-image handlers

**Today (3 parallel implementations):**
- `components/ui/file-upload/usePasteImageUpload.ts` (legacy hook — Plan §6.3 deletes) — used by `components/ui/file-upload/PasteImageHandler.tsx` and demoed in `app/(authenticated)/(admin-auth)/administration/official-components/component-displays/paste-image-handler.tsx`.
- `components/official/ImageAssetUploader.tsx` (inline paste handler in lines ~580–593) — listens for `paste` events on the dropzone.
- `features/cx-chat/components/user-input/ConversationInput.tsx` + `features/cx-conversation/ConversationInput.tsx` + `features/public-chat/components/ChatInputWithControls.tsx` + `features/agents/components/inputs/smart-input/AgentTextarea.tsx` + `features/prompts/components/smart/CompactPromptInput.tsx` + `features/prompts/components/smart/SmartPromptInput.tsx` + `features/prompts/components/PromptInput.tsx` — each chat-input component has its own paste-image listener.
- `components/ui/file-upload/useClipboardPaste.ts` — yet another paste-from-clipboard hook.
- `features/window-panels/windows/FeedbackWindow.tsx` — uses `useFileUpload` directly with a paste handler.

**After:** One `usePasteImage({ onFile, scopes?: ['image/*' | 'application/pdf'], enabled? })` hook that consumes `useFileUpload` under the hood. Returns `{ isListening }`. Every chat-input / textarea uses it.

**Migration notes:** The existing `usePasteImageUpload` is 246 lines and does too much — it owns the upload AND the paste detection. The new hook splits the two: paste detection emits a `File`; caller decides whether to upload + via what preset.

### 2.6 Drag-and-drop dropzones

**Today (~20 files using `react-dropzone`):**

| File | Purpose |
|---|---|
| `components/ui/file-upload/file-upload.tsx` | Legacy general-purpose |
| `components/matrx/ArmaniForm/field-components/file-upload.tsx` | Form field |
| `components/matrx/ArmaniForm/field-components/EntityFileUpload.tsx` | Entity form field |
| `components/official/ImageAssetUploader.tsx` | Image upload |
| `features/files/components/core/FileUploadDropzone/FileUploadDropzone.tsx` | **canonical for cloud-files** |
| `features/image-manager/components/FullImageStudioTab.tsx` | Image manager hub |
| `features/agent-apps/components/inputs/AgentAppImageField.tsx` | Agent app image input |
| `features/resource-manager/resource-picker/UploadResourcePicker.tsx` | Resource picker upload |
| `features/public-chat/components/resource-picker/PublicUploadResourcePicker.tsx` | Public chat resource picker upload |
| `features/agents/components/inputs/input-components/MediaVariableInput.tsx` | Agent variable input |
| `features/applet/builder/modules/container-builder/ContainerCard.tsx` | Applet container builder |
| `features/rag/components/data-stores/DataStoresPage.tsx` | RAG data store add docs |
| `features/podcasts/components/admin/AssetUploader.tsx` | Podcast cover upload |
| `features/canvas/social/ShareCoverImagePicker.tsx` | Canvas social share cover |
| `features/transcript-studio/components/columns/AudioImportDialog.tsx` | Transcript studio audio import |
| `features/notes/components/NotesSidebar.tsx`, `NoteTabs.tsx`, `NoteTabBar.tsx`, `NoteSidebar.tsx` | Notes attachments (4 files) |
| `features/rich-text-editor/RichTextEditor.tsx` | RTE image insert |
| `features/files/components/core/FileUploadDropzone/FileUploadDropzone.tsx` | Files page |
| `features/pdf-extractor/components/PdfExtractorWorkspace.tsx`, `studio/PdfStudioUpload.tsx`, `studio/PdfStudioReader.tsx` | PDF extractor |
| `features/image-studio/components/StudioDropZone.tsx` | Image studio |
| `app/(public)/free/zip-code-heatmap/components/FileUpload.tsx` | Public freebie tool |
| `app/(a)/images/_shared/ModeImagePicker.tsx` | Image mode picker |
| `app/(a)/images/convert/page.tsx` | Image convert tool |
| `app/entities/fields/other-components/EntityFileUpload.tsx`, `file-upload.tsx` | Entity form (duplicate of `components/matrx/...`) |
| `app/(legacy)/legacy/demo/many-to-many-ui/claude/RelationshipMaker.tsx` | Legacy demo |

**After:** All defer to `<FileUploadDropzone preset folder onUploaded accept maxFiles>` (the cloud-files canonical). For non-cloud-files cases (in-memory pre-process before upload, e.g., the image-studio one-shot), expose a `mode="local"` variant that emits raw `File[]` without uploading.

**Migration notes:**
- `components/matrx/ArmaniForm/field-components/file-upload.tsx` and the duplicate at `app/entities/fields/other-components/file-upload.tsx` should collapse to a single `<EntityFileUpload>` that wraps `<FileUploadDropzone>`.
- The 4 notes dropzones (`NotesSidebar`, `NoteTabs`, `NoteTabBar`, `NoteSidebar`) — 4 components, mostly identical — should collapse to 1 in `features/notes/components/NoteFileDropzone.tsx`.

### 2.7 "Import file from URL"

**Today:**
- `features/resource-manager/resource-picker/ImageUrlResourcePicker.tsx` — paste image URL → fetch + display
- `features/resource-manager/resource-picker/FileUrlResourcePicker.tsx` — paste any URL
- `features/resource-manager/resource-picker/YouTubeResourcePicker.tsx` — paste YouTube URL
- `features/resource-manager/resource-picker/WebpageResourcePicker.tsx` — paste webpage URL
- `features/public-chat/components/resource-picker/PublicImageUrlPicker.tsx` — public chat version (duplicate logic)
- `features/public-chat/components/resource-picker/PublicFileUrlPicker.tsx` — Same
- `features/public-chat/components/resource-picker/PublicWebpagePicker.tsx` — Same
- `app/(authenticated)/(admin-auth)/administration/official-components/component-displays/paste-image-handler.tsx` — admin demo

**After:** One `<ImportUrlPicker mode="image|file|youtube|webpage" onResource={…}>` component. The `paste-image-handler.tsx` admin demo becomes a thin caller. The 4 public-chat variants collapse to use the auth-aware base — the only behavioral difference today is the auth context, which the underlying `useFileUpload` already handles (anonymous Supabase auth UUID per `features/file-handler/FEATURE.md` invariant 4).

### 2.8 Image picker dialogs

**Today:**
- `features/files/components/pickers/FilePicker.tsx` — the canonical cloud-files picker.
- `components/image/cloud/CloudFilesTab.tsx` + `CloudImagesTab.tsx` + `CloudUploadTab.tsx` + `ImageStudioTab.tsx` — 4 tabs that the plan §6.3 calls out for deletion ("3 of 4 `features/image-manager/components/*Tab.tsx`"). These are the legacy image-modal tabs.
- `components/image/shared/ImageGrid.tsx` + `ImagePreviewRow.tsx` + `SingleImageSelect.tsx` — inline image selectors
- `features/image-manager/components/StudioLibraryTab.tsx` — image-manager image library
- `features/rag/components/data-stores/CldFilePicker.tsx` — RAG file picker
- `features/agents/components/settings-management/AgentSettingMediaPicker.tsx` — agent media picker
- `app/(a)/images/_shared/ModeImagePicker.tsx` — image mode picker

**After:** `<FilePicker mode="cloud|local|url|all" mimeFilter? multiple?>` is the single canonical (`features/files/components/pickers/FilePicker.tsx`). The image-modal tabs collapse per plan §6.3 (3 of 4 deleted). All other pickers wrap or compose `<FilePicker>`.

### 2.9 Share-link UI surfaces

**Today:**
- `features/files/components/core/ShareLinkDialog/ShareLinkDialog.tsx` — canonical share-link dialog for `cld_files`.
- `features/notes/components/ShareNoteDialog.tsx` — bespoke note share dialog (notes don't ride on cld_files).
- Various "Copy link" menu items in `features/files/components/core/FileContextMenu/`, `RowContextMenu/`, etc.

**After:** `<ShareLinkDialog>` becomes generic — it takes a `resource: { kind: "file" | "note" | ..., id: string }` discriminator and looks up the resource-specific share mechanism. Or, more conservatively, share-link UX stays per-resource and only the underlying token-generation API unifies via Python's `cld_share_links` table (which today is files-specific). Push to user: should notes/agents/applets share-links unify on `cld_share_links` (current model is per-feature)?

### 2.10 Inline file mention in markdown / text

**Today:** Markdown blocks render `![alt](url)` directly. `components/mardown-display/blocks/images/ImageOutputBlock.tsx` is the AI-image-output block that calls `useAiImageUrl` (deleted hook). Other markdown image renderers (`features/cx-chat/**`, `features/agents/components/messages-display/**`) parse markdown without going through a media block.

**After:** `<InlineMediaRef>` is the universal — markdown image renderers emit a normalized `MediaRef` and `<InlineMediaRef>` renders it.

### 2.11 Thumbnail rendering in lists/grids

**Today:**
- `features/files/components/core/MediaThumbnail/MediaThumbnail.tsx` — canonical
- `features/files/components/surfaces/desktop/FileGridCell.tsx` — grid cell with thumbnail
- `features/podcasts/components/admin/PodcastsTable.tsx:199,257` — podcast row thumb (raw `<img>`)
- `features/podcasts/components/admin/ShowsClient.tsx:221` + `ShowDetailClient.tsx:155,279` — podcast cover thumbs
- `features/applet/home/applet-card/*` — applet cover thumbs (raw `<img>`/`<Image>` 4 variants)
- `features/canvas/leaderboard/CanvasLeaderboard.tsx:85` — avatar variant
- Image-manager grid cells in `features/image-manager/**`

**After:** `<InlineMediaRef ref={mediaRef} size="thumbnail">` reads the `thumbnail_url` variant. Two-line collapse for every thumbnail callsite.

---

## Part 3 — Ad-hoc one-offs that should defer to a canonical

### `<InlineMediaRef>` target — every raw `<img src=…>` or `<Image src=…>` that today renders a file URL

Repo has only **8 raw `<img>` tags** that render file-like URLs (the rest are inside official-components scaffolding or are decorative). Each migrates to `<InlineMediaRef ref={mediaRef}>` where `mediaRef = fileIdToMediaRef(id)` or `urlToMediaRef(url)`:

| File | Line | Today | Why |
|---|---|---|---|
| `components/mardown-display/blocks/artifact/ArtifactBlock.tsx` | 167 | `<img src={content} alt={artifactTitle} className="max-w-full max-h-[400px] object-contain rounded" />` | Artifact image from agent output. |
| `components/matrx/Entity/prewired-components/entity-management/parts/EntitySelectVariants.tsx` | 165 | `<img src={imageUrl} alt={String(label)} ... />` | Entity selector preview. |
| `features/workflows/results/registered-components/BraveSearchDisplay.tsx` | 257, 375, 467, 579, 600, 639 | Multiple `<img>` for search results, video thumbs, favicons | Third-party URLs from Brave Search results. Pass through with `urlToMediaRef`. |
| `features/applet/home/main-layout/Grid.tsx` | 95 | `<img src={applet.imageUrl} ...>` | Applet cover. |
| `features/applet/builder/modules/smart-parts/apps/SmartAppList.tsx` | 393 | `<img src={app.imageUrl} alt={app.name} ...>` | App cover. |
| `features/podcasts/components/admin/PodcastsTable.tsx` | 199, 257 | `<img src={show.image_url} ...>` / `<img src={ep.image_url} ...>` | Podcast cover. |
| `app/(authenticated)/tests/oauth/components/SlackManager.tsx` | 337 | `<img src={getUserAvatar(...)} ...>` | OAuth test page Slack avatar. |

Plus the `<Image src>` (Next.js Image) usages already enumerated in §2.2 (logos) and §2.11 (thumbnails) — same migration pattern.

### `<FilePreview>` target — every component that builds its own previewer dispatch logic

The canonical `<FilePreview>` is the registry-based previewer at `features/files/components/core/FilePreview/FilePreview.tsx` (plan §6.3 splits its 404-line switch into a registry — keep the public component).

| File | Line | Why |
|---|---|---|
| `features/code/editor/BinaryFilePdfPreview.tsx` | full file | Bespoke PDF previewer for the code editor — should defer to `<FilePreview source={ref} kind="pdf">`. |
| `features/code/editor/BinaryFileViewer.tsx` | full file | Same — generic binary viewer. |
| `features/code/editor/CloudFilePreviewer.tsx` | full file | Cloud-file previewer specifically for the code editor. |
| `features/chat/components/input/PromptInputContainer.tsx` | (search ref) | Inline preview hook-up — use `<FilePreview>` instead. |
| `features/rag/components/documents/panes/PdfPane.tsx` | full file | RAG-specific PDF pane — should embed `<FilePreview source={ref}>` and add only the RAG-overlay layer. |
| `features/file-analysis/components/AnnotatablePdfCanvas.tsx` | full file | File-analysis PDF canvas — should use `<FilePreview>` for the base layer + annotation overlay. |
| `features/prompts/components/resource-display/ResourcePreviewSheet.tsx` | full file | Resource preview sheet (legacy prompts) — replaced post-migration. |
| `features/pdf-demo/components/PdfWorkbench.tsx` | full file | Standalone PDF workbench demo. |
| `components/image/shared/ImagePreviewRow.tsx`, `ImageGrid.tsx` | full file | Image preview row/grid — inline image previewers. |
| `features/agents/components/messages-display/user/AgentUserMessage.tsx` | (search ref) | User-message attachment renderer. |
| `features/window-panels/windows/cloud-files/FilePreviewWindow.tsx` | (kept) | Already uses `<FilePreview>` — keep, but verify single path. |

### `<FileUploadDropzone>` target — every place that today implements `useDropzone` directly

All 20+ files listed in §2.6 above. The canonical `<FileUploadDropzone>` already exists at `features/files/components/core/FileUploadDropzone/FileUploadDropzone.tsx`. The non-cloud-files cases (image-studio in-memory crop, public freebies) need a `mode="local"` variant.

---

## Part 4 — Anti-patterns to enforce against (ESLint)

The current `eslint.config.mjs` already locks down:
- `supabase.storage.from(...)` (`fileHandlerSyntaxRestrictions`)
- `getPublicUrl` on a `from(...)` chain
- Legacy Supabase env-var key names

**Rules to ADD** for the consolidation (Plan §6.4):

1. **Ban direct `Files.*` / `uploadAsset` / `patchAsset` imports outside `features/files/api/*` and `features/files/**`.**
   - Rationale: every Part 1 row above. Forces all callsites through hooks/facade.
   - Selector: `no-restricted-imports` pattern on `@/features/files/api/*`.

2. **Ban `features/files/redux/*`, `features/files/client/*`, `features/files/state/*`, `features/files/resolver/*`, `features/files/cache/*` imports outside `features/files/**`.**
   - Rationale: forces external callers through the 5 hooks + facade.
   - Caveat: need to first relocate `getJson` / `postJson` / `del` / `patchJson` to a shared `lib/python-client.ts` (15 RAG / page-extraction / pdf-extractor callsites). Otherwise the rule grounds those features.

3. **Ban `fetch('/api/pdf/compress')` and `fetch('/api/images/studio/process')` and any `fetch('/api/files/...')`/`fetch('/api/share/...')`/`fetch('/api/images/...')`** at the URL-literal level. After PR1 (matrx-utils v1.1.0), nothing should hit these.
   - Selector: `CallExpression[callee.name='fetch'][arguments.0.value=/\/api\/(images|files|share|pdf)\//]`.

4. **Ban hand-built `ImageBlock|AudioBlock|VideoBlock|DocumentBlock` literals outside `features/files/` (and `features/files/converters.ts` specifically).**
   - Rationale: per `features/file-handler/FEATURE.md` invariant 1.
   - Plan §6.4 ESLint rule.

5. **Ban manual `MediaRef` object literals outside `features/files/state/converters.ts`.**
   - Rationale: Plan §6.4. Force use of `cloudFileToMediaRef`, `fileIdToMediaRef`, `urlToMediaRef`, `fileUriToMediaRef`.
   - Selector: object literal containing `file_id`/`url`/`file_uri` keys outside the converters file. (Custom rule needed.)

6. **Ban new `app/api/(images|files|share|pdf)/*` routes via `no-restricted-imports` / directory rule.**
   - Plan §6.4.

7. **Ban `import sharp from 'sharp'` anywhere.** Already partially gone — make it permanent.

8. **Ban new `<CloudFilesRealtimeProvider>` mounts outside `app/Providers.tsx`.**
   - Today: 4 per-route mounts (`app/(a)/images/layout.tsx`, `app/(a)/files/layout.tsx`, `features/code/views/explorer/CloudFilesExplorer.tsx`, `features/window-panels/windows/cloud-files/CloudFilesWindow.tsx`, `features/window-panels/windows/cloud-files/FilePreviewWindow.tsx`). Plan §6.6 deletes 4 of them.

9. **Warn on raw `<img src=…>` inside `features/**`, `components/**`, `app/**` (allowlist: branding, decorative, official-components demo)** — encourage `<InlineMediaRef>`.

10. **Ban imports of the 13 deleted hooks** by import-path rule:
    - `@/features/files/hooks/useSignedUrl`
    - `@/features/files/hooks/useFileAsset`
    - `@/features/files/hooks/useFileDocument`
    - `@/features/agents/hooks/useAiImageUrl`
    - `@/features/files/utils/resolveRenderableImageUrl`
    - `@/features/files/upload/cloudUpload`
    - `@/features/files/api/server-client`
    - `@/components/image/cloud/resolveCloudFileUrl`
    - `@/components/ui/file-upload/useFileUploadWithStorage`
    - `@/components/ui/file-upload/usePasteImageUpload`
    - `@/components/ui/file-upload/FileUploadWithStorage`
    - `@/features/file-handler/hooks/useFileMediaBlock`
    - `@/features/file-handler/hooks/useFileDownloadUrl`
    - `@/features/file-handler/**` (whole directory ceases to exist post-merge per plan §6.2)

---

## Part 5 — Open questions for the user

1. **`features/notes/components/ShareNoteDialog.tsx` vs `features/files/components/core/ShareLinkDialog/ShareLinkDialog.tsx`** — notes today live outside `cld_files`. Do notes adopt `cld_share_links` (so a single share-link dialog handles all resource types), or do per-resource share-link tables stay (and only the dialog shell unifies)?

2. **`organizations.logo_url`, `applet.imageUrl`, `app.imageUrl`, `podcasts.image_url`** — these are bare URL columns (legacy public-URL form). Plan calls for `MediaRef` everywhere. Do we backfill these columns to `master_file_id` + variants envelope, or do we keep the URL columns and have `<InlineMediaRef>` accept a raw URL fallback (via `urlToMediaRef`) indefinitely? The Part 2.2 collapse depends on the answer.

3. **`useClipboardPaste.ts` (`components/ui/file-upload/useClipboardPaste.ts`)** — does it survive consolidation as a low-level "give me clipboard contents" hook (which is general-purpose, not file-specific), or does it fold into the new `usePasteImage`? Currently it's used in `RichTextEditor.tsx` and possibly elsewhere.

4. **`features/workflows/results/registered-components/BraveSearchDisplay.tsx`** — has 8 raw `<img>` tags for third-party search-result thumbnails / favicons. Do these route through `<InlineMediaRef>` + `urlToMediaRef` (gives SW byte caching for free) or stay raw (privacy / referrer concern with auto-fetch)?

5. **`features/code-files/service/s3Service.ts`** — code-editor virtual files. They have their own bucket (`code-editor`) per `features/file-handler/FEATURE.md` Obliteration Plan item 6 — partially migrated. After full migration, does the `s3Service.ts` file disappear, or stay as a thin wrapper over `fileHandler` for code-editor-specific path conventions?

6. **`features/files/api/client.ts` — `getJson` / `postJson` / `del` / `patchJson` are general HTTP wrappers used by 15+ non-cloud-files features** (RAG, page-extraction, file-analysis, pdf-extractor). Plan §6.4 wants `features/files/client/*` to be internal-only. Confirm: relocate these primitives to `lib/python-client.ts` (or similar) so RAG/page-extraction don't transitively depend on `features/files/`?

7. **`app/(public)/share/[token]/page.tsx`** uses raw `fetch` to the Python `/share/{token}` endpoint (server-side, no auth needed for public shares). Should this be routed through the new internal client wrapper anyway for consistency (auth-header opt-out, X-Request-Id stamping), or accepted as-is?

8. **`components/matrx/ArmaniForm/field-components/file-upload.tsx` vs `app/entities/fields/other-components/file-upload.tsx`** — these appear to be near-duplicates (form-system file fields). Same for `EntityFileUpload.tsx`. Should they collapse, or do the two paths serve different ArmaniForm / entity-form pipelines?

9. **`features/applet/home/applet-card/Glass.tsx:13`** uses `backgroundImage={applet.imageUrl}` as a CSS background. `<InlineMediaRef>` doesn't help here. Add a `mode="background"` to InlineMediaRef, or accept the one-off?

10. **`hooks/usePdfOptimize.ts`** (top-level `hooks/`) calls `/api/pdf/compress`. Plan §6.3 deletes that route. Where does the hook go — into `features/files/hooks/` or into `features/pdf-extractor/hooks/`? Currently it's a stray top-level hook.
