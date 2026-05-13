# Image Component Inventory

> Audit: 2026-05-13. Covers rendering, uploading, and modifying.
> Purpose: identify every file that touches images so we know exactly which ones need to change.

---

## RENDERING

### Lowest Level — Direct API or public-source fetch

These are the files actually calling the network. Change here → everything above breaks.

| File | What it does | Status |
|------|-------------|--------|
| `features/files/hooks/useSignedUrl.ts` | Calls `Files.getSignedUrl()` directly. Manages expiry timer + auto-refresh 30s before URL dies. THE raw URL fetching primitive for private cloud files. | Active — core |
| `features/files/api/files.ts` (`getSignedUrl`) | REST client function that POSTs to Python `/files/{id}/url`. Called only by `useSignedUrl` and `resolveCloudFileUrl`. | Active — deepest layer |
| `components/image/cloud/resolveCloudFileUrl.ts` | Imperative (non-hook) version of the same: reads `publicUrl` from Redux or calls `getSignedUrl` once. Used at selection time when no hook lifecycle is available. | Active |
| `hooks/images/useUnsplashSearch.ts` | Calls `/api/unsplash` route (POST search). Direct network caller for Unsplash. | Active |
| `hooks/images/useUnsplashGallery.ts` | Calls `/api/unsplash` (random / collections). Direct network caller for Unsplash. | Active |

**Pure renderers** (no fetch — receive URL as prop, just put `<img>` on screen):

| File | What it does | Status |
|------|-------------|--------|
| `features/files/components/core/FilePreview/previewers/ImagePreview.tsx` | Pure `<img src={url}>` with error/empty states. Called by `FilePreview` after it resolves the URL. | Active |
| `components/mardown-display/blocks/images/ImageBlock.tsx` | Markdown `![]()` renderer. Takes `src` string, renders `<img>` with zoom/copy/share/download overlay. | Active |
| `components/mardown-display/blocks/images/ImageOutputBlock.tsx` | Agent output image block. Receives URL as prop, adds download/copy-URL actions. Overlaps with `ImageBlock` — dedup deferred. | Active — overlaps `ImageBlock` |

---

### Mid Level — Renders via hook

These components call a hook to resolve the URL, then render. Changing the hook changes all of them.

| File | Hook(s) used | What it does | Status |
|------|-------------|-------------|--------|
| `features/files/components/core/MediaThumbnail/MediaThumbnail.tsx` | `useSignedUrl` | THE single source of truth for cloud-file thumbnails. Picks CDN URL (public files) or signed URL (private). Renders `<img>` for images, `<video>` for video posters. | Active — canonical |
| `features/files/handler/hooks/useFileSrc.ts` | `useFileAs` → `useSignedUrl` | Convenience hook: takes any `FileSource`, returns an `<img src>`-ready string. Abstracts CDN vs signed URL vs share link selection. | Active — canonical |
| `features/files/handler/hooks/useFile.ts` | (handler internals) | Full `NormalizedFile` from any `FileSource`. Used when you need more than just the URL. | Active |
| `features/files/handler/hooks/useFileAs.ts` | (handler internals) | Typed output variant of `useFile` — returns `html_src`, `blob`, `download_url`, etc. | Active |
| `hooks/images/useImage.ts` | none (takes raw `src`) | UI-behavior hook: zoom, fullscreen, copy, download, dimensions for a given `src` string. Does NOT fetch URLs — assumes URL is already resolved. | Active — mostly used by `ImageBlock` |
| `hooks/images/useDownloadImage.ts` | (fetch) | Fetches image as blob, triggers browser download. | Active |
| `hooks/images/useImageDimensions.ts` | (Image constructor) | Loads image in memory to compute natural dimensions. | Possibly unused — verify |

---

### Higher Level — Uses an internal component to render

These compose the layers above. Modifying lower layers flows up here automatically.

| File | Component(s) used | What it does | Status |
|------|------------------|-------------|--------|
| `components/image/cloud/CloudImageGrid.tsx` | `MediaThumbnail` | Renders a grid of cloud-file image tiles. | Active |
| `components/image/cloud/CloudImagesTab.tsx` | `CloudImageGrid` → `MediaThumbnail` | Full "My Images" tab. Image-MIME filter of the cloud-files tree. | Active |
| `components/image/cloud/CloudFilesBrowserTable.tsx` | `MediaThumbnail` | Tabular view of cloud files with image previews. | Active |
| `components/image/shared/DesktopImageCard.tsx` | `<img>` direct | Desktop card for a single image in a gallery. | Active |
| `components/image/shared/MobileImageCard.tsx` | `<img>` direct | Mobile variant card. | Active |
| `components/image/shared/SelectableImageCard.tsx` | `DesktopImageCard` / `MobileImageCard` | Adds selection state (checkbox overlay) to a card. | Active |
| `components/image/shared/ResponsiveImageCard.tsx` | `DesktopImageCard` / `MobileImageCard` | Responsive switcher between the two card variants. | Active |
| `components/image/shared/QuickImagePreview.tsx` | `<img>` | Hover popup preview. | Active — verify usage |
| `components/image/shared/ImageGrid.tsx` | cards | Generic image grid layout used by `CloudImagesTab`. | Active |
| `components/image/shared/ImagePreviewRow.tsx` | cards | Row of selected-image previews (appears at bottom of manager). | Active |
| `components/image/gallery/desktop/ImageGallery.tsx` | `DesktopImageCard` | Desktop gallery grid with lightbox. | Active |
| `components/image/gallery/desktop/SimpleImageViewer.tsx` | `<img>` | Simple single-image lightbox for desktop. | Active |
| `components/image/gallery/mobile/MobileImageGallery.tsx` | `MobileImageCard` | Mobile gallery grid. | Active |
| `components/image/gallery/mobile/MobileImageViewer.tsx` | `<img>` | Mobile lightbox. | Active |
| `components/image/gallery/ResponsiveDirectGallery.tsx` | `ImageGallery` / `MobileImageGallery` | Responsive switcher for direct-array galleries. | Active |
| `components/image/unsplash/desktop/EnhancedUnsplashGallery.tsx` | cards | Desktop Unsplash gallery; uses `useUnsplashSearch`. | Active |
| `components/image/unsplash/mobile/MobileUnsplashGallery.tsx` | cards | Mobile Unsplash gallery. | Active |
| `components/image/unsplash/ResponsiveUnsplashGallery.tsx` | `EnhancedUnsplashGallery` / `MobileUnsplashGallery` | Responsive Unsplash picker. Uses `useUnsplashGallery`. | Active |
| `components/image/ResponsiveGallery.tsx` | `ResponsiveDirectGallery` / `ResponsiveUnsplashGallery` | Top-level gallery: switches between direct-array and Unsplash modes. | Active |
| `components/image/ImageManager.tsx` | All tabs + `SelectedImagesProvider` | Full-screen modal picker with 6 tabs. Top of the rendering tree. | Active |
| `app/(authenticated)/news/ProgressiveNewsImage.tsx` | `<img>` | News-specific progressive image loader. | Active — isolated |
| `features/files/components/core/FilePreview/FilePreview.tsx` | `ImagePreview` | Routes a cloud file to the right previewer by MIME type. | Active |

---

### Dead / Legacy (rendering)

| File | Reason |
|------|--------|
| `components/advanced-image-editor/**` | fabric.js — broken under Turbopack. Ships dead code in bundle. Flagged for removal. |
| `app/(authenticated)/image-editing/page.tsx` (+ /gallery, /public-image-search, /simple-crop) | Disabled routes (fabric.js dependency). Show "temporarily unavailable" notice. |
| `types/imageEditorTypes.ts` | Unused schema placeholder. |
| `components/matrx/image-gallery.tsx` | Demo using `FocusCards` — verify if any live surface still references it. |
| `components/matrx/parallax-scroll/**` | Used only by the dead `/image-editing/gallery` route. |

---

## UPLOADING

### Lowest Level — Direct API call

| File | What it does | Status |
|------|-------------|--------|
| `features/files/api/files.ts` (`uploadFile`, `uploadFileWithProgress`) | Raw HTTP client. POSTs `multipart/form-data` to Python `/files/upload` with optional XHR progress. Called only by `cloudUpload`. | Active — deepest layer |
| `features/files/upload/cloudUpload.ts` (`cloudUpload`, `cloudUploadRaw`, `cloudUploadMany`) | THE single upload primitive. Resolves file path, calls the API, dispatches Redux optimistic updates, optionally creates a share link. All browser uploads route through here. | Active — canonical |
| `app/api/images/upload/route.ts` | Server-side Sharp variant pipeline. Accepts a raw file, generates up to 4 size variants (social / cover / avatar / logo / favicon / square), writes each to cld_files via `Api.Server.uploadAndShare`. Used only by `ImageAssetUploader`, NOT through `cloudUpload`. | Active — separate track |
| `features/audio/services/audioFallbackUpload.ts` | Audio-specific fallback upload (separate path). Not image-related. | Out of scope |

---

### Mid Level — Upload via hook

| File | Hook(s) / function used | What it does | Status |
|------|------------------------|-------------|--------|
| `features/files/handler/hooks/useFileUpload.ts` | `fileHandler.upload()` → `cloudUpload` | THE canonical React upload hook. Manages `uploading / progress / result / error` state. All UI upload surfaces should use this. | Active — canonical |
| `features/files/handler/upload.ts` (`uploadInternal`) | `cloudUpload` | Non-hook imperative wrapper used by `fileHandler.upload()`. Stamps org/project/task scope onto metadata. | Active |
| `features/files/hooks/useGuardedFileUpload.ts` | `useFileUpload` + duplicate-detect | Wraps `useFileUpload` with file-hash duplicate detection before committing upload. Used by the main dropzone. | Active |
| `components/ui/file-upload/usePasteImageUpload.ts` | (clipboard API + upload) | Hook for clipboard paste → upload. Verify whether it routes through `useFileUpload` or the legacy path. | Verify |
| `components/ui/file-upload/useFileUploadWithStorage.ts` | Supabase storage directly | **Legacy.** Bypasses the canonical `cloudUpload` path; writes to Supabase Storage instead of cld_files via Python. Needs migration. | ⚠️ Legacy — bypasses handler |

---

### Higher Level — Upload UI components

| File | Hook / inner component | What it does | Status |
|------|----------------------|-------------|--------|
| `features/files/components/core/FileUploadDropzone/FileUploadDropzone.tsx` | `useGuardedFileUpload` | Main drag-and-drop / file-picker dropzone. Shows progress list. Used throughout the app. | Active — canonical |
| `components/image/cloud/CloudUploadTab.tsx` | `FileUploadDropzone` + `useFileUpload` | Image-manager Upload tab. Drag/drop + paste + base64 decoder sub-tool. | Active |
| `components/official/ImageAssetUploader.tsx` | POST `/api/images/upload` directly | Drag/drop → Sharp variant pipeline. Returns persistent share URLs per variant. Used for org logos, podcast covers, profile photos, social images. NOT through `cloudUpload`. | Active |
| `features/window-panels/windows/image/ImageUploaderWindow.tsx` | `ImageAssetUploader` | Floating window wrapper around `ImageAssetUploader`. Exposes it imperatively from any feature via callback. | Active |
| `features/window-panels/windows/image/useOpenImageUploaderWindow.ts` | (opener hook) | Hook to open `ImageUploaderWindow` programmatically. | Active |
| `features/resource-manager/resource-picker/UploadResourcePicker.tsx` | `useFileUpload` | Upload entry inside the agents resource picker (chat composer). | Active — chat-scoped |
| `features/public-chat/components/resource-picker/PublicUploadResourcePicker.tsx` | `useFileUpload` | Guest variant of `UploadResourcePicker`. | Active — public-scoped |
| `components/ui/file-upload/FileUploadWithStorage.tsx` | `useFileUploadWithStorage` | Generic dropzone using the **legacy** Supabase path. | ⚠️ Legacy |
| `components/ui/file-upload/ImageUploadField.tsx` | `useFileUploadWithStorage` | Small inline upload field with preview. Uses the **legacy** path. | ⚠️ Legacy |
| `features/image-manager/components/BrandedUploadTab.tsx` | `ImageAssetUploader` | Branded-upload tab in image-manager (social/cover/avatar/logo presets). | Active |
| `features/image-manager/components/ProfilePhotoTab.tsx` | `ImageAssetUploader` (avatar preset) | Profile photo upload tab. | Active |
| `features/podcasts/components/admin/AssetUploader.tsx` | `ImageAssetUploader` | Podcast-specific: composes `ImageAssetUploader` + a video uploader. | Active — podcast-scoped |
| `features/image-studio/modes/shared/save-edited-image.ts` | `useFileUpload` / `cloudUpload` | Saves processed studio output back to cld_files. | Active |
| `features/canvas/social/ShareCoverImagePicker.tsx` | POST `/api/images/upload` | Picks or uploads a canvas social cover. Image-specific, canvas-scoped. | Active — canvas-scoped |

---

## MODIFYING (crop, resize, process, edit)

### Lowest Level — Actual transformation logic

| File | What it does | Status |
|------|-------------|--------|
| `components/official/image-cropper/cropImage.js` | Canvas-based crop utility. Takes pixel area + rotation, returns a cropped Blob. Pure function — no React. | Active |
| `utils/image/imageCompression.ts` | Canvas resize + quality compression + thumbnail generation. Used by screenshot pipeline. | Active |
| `app/api/images/studio/process/route.ts` | Server-side Sharp batch processor for Image Studio. Returns base64 data URLs (no storage write). | Active |
| `app/api/images/upload/route.ts` | Server-side Sharp variant pipeline (also listed under uploading — the same route does resize + upload). | Active |
| `features/image-studio/utils/compute-crop.ts` | Computes crop pixel area from percent coordinates. | Active |
| `features/image-studio/utils/crop-file.ts` | Applies crop to a `File` using canvas. | Active |
| `features/image-studio/utils/decode-base64.ts` | Converts base64 / data-URI string to a `File`. | Active |
| `features/image-studio/utils/download-bundle.ts` | Bundles multiple processed variants into a zip for download. | Active |
| `features/image-studio/utils/build-describe-preview.ts` | Prepares a payload for AI-describe (Python). No describe route wired yet. | Active — incomplete |
| `features/image-studio/api/python.ts` | HTTP client for Python image operations (describe, AI edit). | Active |

---

### Mid Level — Modification via hook

| File | What it does | Status |
|------|-------------|--------|
| `features/image-studio/hooks/useImageStudio.ts` | Orchestrates the full studio flow: load source → initial crop → select presets → batch process → upload variants. | Active — canonical for studio |
| `features/image-studio/components/useCropStudioController.ts` | Controls the crop-first step inside `EmbeddedImageStudio`. | Active |
| `features/image-studio/modes/shared/use-image-source.ts` | Provides image source (file/URL/cloud) to studio mode shells. | Active |
| `features/image-studio/hooks/useBase64Decoder.ts` | Decodes a pasted base64 / data-URI → preview → save as cloud asset. | Active |

---

### Higher Level — Modification UI components

| File | Inner component / hook | What it does | Status |
|------|----------------------|-------------|--------|
| `components/official/image-cropper/ImageCropper.tsx` | `react-easy-crop` + `cropImage.js` | Crop dialog with aspect ratio options. | Active |
| `components/official/image-cropper/EasyImageCropper.tsx` | `ImageCropper` | Auto-opens cropper after an image is selected. | Active |
| `components/official/image-cropper/ImageCropperWithSelect.tsx` | `ImageCropper` | Pick + crop in one component. | Active |
| `features/image-studio/components/CropControls.tsx` | (canvas utils) | Crop UI controls (rotation, zoom, grid) inside the studio. | Active |
| `features/image-studio/components/CropPreview.tsx` | `CropControls` | Live crop preview panel. | Active |
| `features/image-studio/components/InitialCropWindow.tsx` | `CropPreview` | Pre-variant crop step in `EmbeddedImageStudio` (WindowPanel form). The only initial-crop wrapper now (`InitialCropDialog` was removed). | Active |
| `features/image-studio/components/EmbeddedImageStudio.tsx` | `useImageStudio` + `InitialCropWindow` + `/api/images/studio/process` | Drop-in form input: auto-uploads every requested preset variant to `Images/Generated/…/`. | Active — canonical for multi-variant |
| `features/image-studio/components/ImageStudioShell.tsx` | `EmbeddedImageStudio` | Full-page route shell for `/image-studio/convert`. | Active |
| `features/image-studio/modes/edit/EditModeShell.tsx` | Python API | AI-edit mode shell (calls Python). | Active — AI edit |
| `features/image-studio/modes/annotate/AnnotateModeShell.tsx` | (canvas) | Annotate mode. | Active |
| `features/image-studio/modes/avatar/AvatarModeShell.tsx` | (canvas) | Avatar-generation mode. | Active |
| `features/image-manager/components/FullImageStudioTab.tsx` | `EmbeddedImageStudio` | Full studio tab inside image-manager. | Active |
| `features/image-manager/components/StudioLibraryTab.tsx` | (cloud files query) | Read-only view of saved studio variant sessions. | Active |
| `components/image/cloud/ImageStudioTab.tsx` | `EmbeddedImageStudio` | Studio tab entry point from the image manager tabs. | Active |

---

## SUMMARY: Files Closest to the Wire (Tier 1 — Change Here, Everything Breaks)

### Rendering
- `features/files/hooks/useSignedUrl.ts` — URL resolution for private files
- `features/files/api/files.ts` — REST client
- `components/image/cloud/resolveCloudFileUrl.ts` — imperative URL resolution at selection time
- `features/files/handler/hooks/useFileSrc.ts` — universal hook for any FileSource → img src

### Uploading
- `features/files/upload/cloudUpload.ts` — THE upload primitive (99% of uploads)
- `features/files/handler/hooks/useFileUpload.ts` — canonical React hook over cloudUpload
- `app/api/images/upload/route.ts` — separate Sharp variant track (used by `ImageAssetUploader`)

### Modifying
- `components/official/image-cropper/cropImage.js` — crop primitive
- `app/api/images/studio/process/route.ts` — server-side Sharp processing
- `utils/image/imageCompression.ts` — client-side compression

---

## Legacy / Dead Code to Remove

| File(s) | Reason |
|---------|--------|
| `components/advanced-image-editor/**` | fabric.js — dead under Turbopack. Dead code in bundle. |
| `app/(authenticated)/image-editing/**` | Disabled routes (depend on dead editor). |
| `types/imageEditorTypes.ts` | Unused schema placeholder. |
| `components/ui/file-upload/useFileUploadWithStorage.ts` | Bypasses canonical upload path — writes to Supabase Storage directly. Callers need migration to `useFileUpload`. |
| `components/ui/file-upload/FileUploadWithStorage.tsx` | Uses the legacy hook above. |
| `components/ui/file-upload/ImageUploadField.tsx` | Uses the legacy hook above. |
| `components/matrx/parallax-scroll/**` | Only used by the dead `/image-editing/gallery` route. |
| `components/matrx/image-gallery.tsx` | Demo component — verify if any live surface still imports it. |
| `features/image-studio/index.ts` | Barrel re-export — violates project no-barrel rule. Needs gradual replacement. |
