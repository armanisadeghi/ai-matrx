# Image Feature Inventory

> Audit run: 2026-05-05. Source: read-only scan of the matrx-frontend repo.
> Purpose: feed the central /image-manager hub.

## 1. Already in /image-manager

The `/image-manager` route renders `ImageManagerPageShell` (`app/(a)/image-manager/_components/ImageManagerPageShell.tsx`) with a sidebar of 6 sections, all backed by the cloud-files system:

- **Public Images** → `<ResponsiveGallery type="unsplash">` (`components/image/ResponsiveGallery.tsx` → `components/image/unsplash/ResponsiveUnsplashGallery.tsx`).
- **Your Cloud (My Images)** → `CloudImagesTab` (`components/image/cloud/CloudImagesTab.tsx`) — image-MIME view of `features/files` Redux tree.
- **All Files (My Files)** → `CloudFilesTab` (`components/image/cloud/CloudFilesTab.tsx`) — full cloud-files browser with `allowFileTypes={["any"]}`.
- **Upload** → `CloudUploadTab` (`components/image/cloud/CloudUploadTab.tsx`) — drag/drop + paste + picker via `useFileUpload`.
- **Image Studio** → `ImageStudioTab` (`components/image/cloud/ImageStudioTab.tsx`) wrapping `EmbeddedImageStudio` (`features/image-studio/components/EmbeddedImageStudio.tsx`).
- **AI Generate** → in-file `AIGenerateHero` placeholder (no implementation yet).

Selection state is shared with the rest of the app via `SelectedImagesProvider` (`components/image/context/SelectedImagesProvider.tsx`). Active section is persisted to `localStorage` under `image-manager:active-section`.

## 2. Image surfaces by category

### 2.1 Pickers, selectors, browsers

- **`ImageManager` modal** → `components/image/ImageManager.tsx` — full-screen `FullScreenOverlay` version of the same six tabs. Identical content, modal chrome. Used everywhere the user has to "pick an image" inline. **Integration: KEEP-SEPARATE (modal twin of the route — both use the same provider).**
- **`SingleImageSelect`** → `components/image/shared/SingleImageSelect.tsx` — single-image preview tile + click → opens `ImageManager`. **ABSORB as a reusable picker primitive; route should advertise it.**
- **`ImageManagerRow`** → `components/image/shared/ImageManagerRow.tsx` — `ImagePreviewRow` + "Add/manage" trigger that opens `ImageManager`. **LINK-FROM (form-builder helper).**
- **`ImageManagerIcon`** → `components/image/shared/ImageManagerIcon.tsx` — icon-only picker trigger with selection badge. **LINK-FROM.**
- **`PublicImageSearch` (official)** → `components/official/PublicImageSearch.tsx` — Unsplash search dialog + URL paste, single or multi-select. Older sibling of `CloudImagesTab`/`UnsplashSearch`. **LINK-FROM (compact-input variant).**
- **`ImageUrlResourcePicker`** → `features/resource-manager/resource-picker/ImageUrlResourcePicker.tsx` — paste/select image URL inside the agents resource-picker menu. **KEEP-SEPARATE (resource-picker contract).**
- **`PublicImageUrlPicker`** → `features/public-chat/components/resource-picker/PublicImageUrlPicker.tsx` — guest variant of the same. **KEEP-SEPARATE.**
- **`UploadResourcePicker` / `PublicUploadResourcePicker`** → `features/resource-manager/resource-picker/UploadResourcePicker.tsx`, `features/public-chat/components/resource-picker/PublicUploadResourcePicker.tsx` — image+other upload entry from chat composer. **KEEP-SEPARATE (chat-scoped).**
- **`SingleImageSelect` examples** → `components/image/examples/ImageManagerExample.tsx`. Demo only.

### 2.2 Galleries, viewers, lightboxes

- **`ResponsiveGallery`** → `components/image/ResponsiveGallery.tsx` — switches between direct array gallery and Unsplash gallery.
- **`ResponsiveDirectGallery`** → `components/image/gallery/ResponsiveDirectGallery.tsx`, splits to:
  - `components/image/gallery/desktop/ImageGallery.tsx`
  - `components/image/gallery/desktop/SimpleImageViewer.tsx`
  - `components/image/gallery/mobile/MobileImageGallery.tsx`
  - `components/image/gallery/mobile/MobileImageViewer.tsx`
- **Unsplash gallery stack** → `components/image/unsplash/ResponsiveUnsplashGallery.tsx`, `desktop/EnhancedUnsplashGallery.tsx`, `desktop/EnhancedImageViewer.tsx`, `mobile/MobileUnsplashGallery.tsx`, `mobile/MobileUnsplashSearch.tsx`, `mobile/MobileUnsplashViewer.tsx`, `demo/EnhancedSearchDemo.tsx`. **Already integrated** via Public Images tab. **KEEP.**
- **`ImageViewerWindow` / `openImageViewer`** → `features/window-panels/windows/image/ImageViewerWindow.tsx` — floating window with zoom/pan/keyboard nav/download. **LINK-FROM (use as the lightbox click-target from /image-manager tiles).**
- **`GalleryFloatingWorkspace`** → `features/gallery/components/GalleryFloatingWorkspace.tsx` (and `features/window-panels/windows/image/GalleryWindow.tsx`) — floating-panel Unsplash gallery with favorites/topic shortcuts. **LINK-FROM (mini overlay version of Public Images).**
- **`ImagePreview` (cloud-files previewer)** → `features/files/components/core/FilePreview/previewers/ImagePreview.tsx` — rendered by `FilePreview` for image MIMEs in /files. **KEEP.**
- **`MediaThumbnail`** → `features/files/components/core/MediaThumbnail/MediaThumbnail.tsx` — single source of truth for cloud-file thumbnails (image, video poster, pdf-firstpage, backend-thumb, icon). **KEEP — already used by `CloudImagesTab`.**
- **`ImageBubble`** → `features/whatsapp-clone/chat-view/bubbles/ImageBubble.tsx` — chat bubble. **KEEP.**
- **`ImageGalleryPlaceholder`** → `components/matrx/image-gallery.tsx` — demo using `FocusCards`. (verify if still used).
- **`ImagePreviewRow`** → `components/image/shared/ImagePreviewRow.tsx` — already mounted in /image-manager footer.
- **`SelectableImageCard`** → `components/image/shared/SelectableImageCard.tsx` — wraps cards with selection state.
- **`QuickImagePreview`** → `components/image/shared/QuickImagePreview.tsx` — fast hover preview popup.
- **`ImageGrid`** → `components/image/shared/ImageGrid.tsx` — generic grid layout used by `CloudImagesTab`.

### 2.3 Upload surfaces (single, multi, paste, URL, base64)

- **`CloudUploadTab`** → already in `/image-manager`.
- **`ImageAssetUploader`** (official) → `components/official/ImageAssetUploader.tsx` — drag/drop + preset variants (social/cover/avatar/logo/favicon/square) via the Python `POST /assets` endpoint (was the Next.js+Sharp route at `/api/images/upload` until 2026-05-12). Used by org logos, podcast covers, etc. **ABSORB as the "Branded Upload" tab (variant-generating upload).**
- **`ImageUploaderWindow`** → `features/window-panels/windows/image/ImageUploaderWindow.tsx` + opener hook `useOpenImageUploaderWindow.ts` + `callbacks.ts` — floating-window wrapper around `ImageAssetUploader` for callback-based async upload from any feature. **LINK-FROM (programmatic surface).**
- **`ImageUploadField`** → `components/ui/file-upload/ImageUploadField.tsx` — small inline upload field with preview (uses `useFileUpload` from `@/features/files`). **LINK-FROM.**
- **`PasteImageHandler`** → `components/ui/file-upload/PasteImageHandler.tsx`, `useClipboardPaste.ts` — invisible wrapper enabling clipboard paste anywhere (paste-to-upload now goes through `useFileUpload` from `@/features/files`). **Already in CloudUploadTab via dropzone, but worth surfacing separately.** LINK-FROM.
- **`FileUploadWithStorage`** → `components/ui/file-upload/FileUploadWithStorage.tsx`, `file-upload.tsx` — generic dropzone primitive. KEEP.
- **AssetUploader (podcast)** → `features/podcasts/components/admin/AssetUploader.tsx` — composes `ImageAssetUploader` + a podcast-only video uploader. **KEEP-SEPARATE (podcast-only).**
- **`/image-studio/from-base64`** → `app/(a)/image-studio/from-base64/page.tsx`, `FromBase64ShellClient.tsx`, `features/image-studio/components/Base64DecoderShell.tsx`, `features/image-studio/hooks/useBase64Decoder.ts`, `utils/decode-base64.ts` — paste a base64 / `data:` URL → preview → save as cloud asset with a permanent share URL. **ABSORB as a sub-tool of "Upload" tab or as its own tab.**
- **Camera capture** → `components/matrx/camera/{camera.tsx, camera-view.tsx, camera-provider.tsx, camera-types.ts}` — webcam capture returning data-URL images. (verify if still used; appears legacy). **LINK-FROM if revived.**

### 2.4 Editing / cropping / resizing / variants

- **Image Studio (multi-variant generator)** → entire `features/image-studio/**` + `app/(a)/image-studio/**`. Routes: `/image-studio` (landing), `/image-studio/convert` (main tool), `/image-studio/presets` (catalog), `/image-studio/library` (saved variants), `/image-studio/from-base64`. 60+ presets across 10 categories + 6 one-click bundles. **Already wired (via tab) — KEEP route + ABSORB into hub navigation.**
- **`EmbeddedImageStudio`** → `features/image-studio/components/EmbeddedImageStudio.tsx` — drop-in form input that auto-uploads every requested preset to `Images/Generated/<rootSegment>/<filenameBase>/`. **KEEP — already used by the tab.**
- **`ImageCropper`** (official) → `components/official/image-cropper/ImageCropper.tsx`, `cropImage.js`, plus wrappers `ImageCropperWithSelect.tsx`, `EasyImageCropper.tsx` — `react-easy-crop`-based dialog with aspect ratio options. **LINK-FROM — surface as "Crop" sub-tool.**
- **`InitialCropWindow`** → `features/image-studio/components/InitialCropWindow.tsx` — pre-variant crop step inside `EmbeddedImageStudio` (floating WindowPanel form). The older `InitialCropDialog.tsx` modal wrapper was orphaned and removed 2026-05; `InitialCropWindow` is the only initial-crop wrapper now. **KEEP.**
- **`CropPreview` / `CropPreviewWindow` / `CropControls` / `MiniFocalPointPicker`** → `features/image-studio/components/*`. **KEEP.**
- **`MetadataPanel`** → `features/image-studio/components/MetadataPanel.tsx` — per-source metadata (filename base, alt text, etc.) inside the studio. **KEEP.**
- **`PresetCatalog`** → `features/image-studio/components/PresetCatalog.tsx` (catalog of 60+ presets). **KEEP.**
- **Image Studio support utils** → `features/image-studio/utils/{compute-crop, crop-file, decode-base64, slugify-filename, format-bytes, build-describe-preview, download-bundle}.ts`. **KEEP.**
- **`/image-editing` legacy route** → `app/(authenticated)/image-editing/page.tsx`, plus `/gallery`, `/public-image-search`, `/simple-crop`. **Currently disabled** — `image-editing/page.tsx` shows a "temporarily unavailable" notice (fabric.js/jsdom incompatible with Turbopack). **KEEP-SEPARATE; flagged for cleanup.**
- **`components/advanced-image-editor/**`** → fabric.js-based editor (`AdvancedImageEditor`, `BasicImageEditor`, `ExtendedImageEditor`, `FullFeaturedImageEditor`, `AIImageEditor`, `ImageGeneration`, menus `Adjust/Beauty/Filters/AiEnhancement`, tools `CutPaste/FreeForm/Layer/Opacity`, `ImageProcessingLoader`, layouts/Navigation). **DEAD; depends on `/vendors/fabric.js` which is broken under Turbopack. Mark for removal in audit.**
- **`utils/image/imageCompression.ts`** → client-side canvas-based resize/quality compression. **KEEP (used by screenshot pipeline).**

### 2.5 AI image generation

- **No first-class generation pipeline ships today.** Only:
  - `AIGenerateHero` placeholder in `/image-manager` and `ImageManager` modal.
  - Settings tab `features/settings/tabs/ImageGenerationTab.tsx` (model / resolution / style / palette / AI enhance toggles bound via `useSetting` to `userPreferences.imageGeneration.*`) — UI scaffolding only, no actual generator.
  - `components/advanced-image-editor/ImageGeneration.tsx`, `menus/AiEnhancementMenu.tsx` — UI shell of the dead fabric.js editor.
- **No backend route for image generation.** No `flux`, `dall-e`, `imagen` providers wired. The codebase grep matches are unrelated (chat constants, Storybook tests, prompt templates).
- **Recommendation:** ABSORB as a new tab driven by an agent shortcut once Python/agent backing exists; until then keep the "coming soon" hero. The settings tab can already gate user defaults.

### 2.6 Stock-image search (Unsplash)

- **Active**: `app/api/unsplash/route.ts` (Node API route → `unsplash-js` SDK with `UNSPLASH_ACCESS_KEY`).
- **Hooks**: `hooks/images/useUnsplashSearch.ts`, `hooks/images/useUnsplashGallery.ts`.
- **UI**: `components/image/unsplash/**` (Public Images tab) and the older `components/official/PublicImageSearch.tsx` (modal + URL paste, also calls Unsplash directly via `NEXT_PUBLIC_UNSPLASH_ACCESS_KEY`).
- **Used by**: `/image-manager` Public Images tab, `ImageManager` modal, `app/(authenticated)/image-editing/public-image-search/page.tsx`, `app/(authenticated)/image-editing/gallery/page.tsx`, `GalleryFloatingWorkspace`, `ShareCoverImagePicker` (preset covers are Unsplash URLs).
- **Integration:** ABSORB into the canonical Public Images tab; consolidate the duplicate Unsplash client (one server-side route via `UNSPLASH_ACCESS_KEY`).
- **No other stock providers wired** (no Pexels, Pixabay, Getty, etc.).

### 2.7 Avatar / profile photo flows

- **`components/ui/avatar.tsx`** — Radix Avatar primitive. Display only.
- **`features/files/components/surfaces/desktop/SharedAvatarStack.tsx`** — avatar stack for shared files.
- **`features/whatsapp-clone/shared/WAAvatar.tsx`** — chat avatar.
- Profile/org logo flows use `ImageAssetUploader` with `preset="avatar"` or `"logo"`:
  - `features/organizations/components/CreateOrgModal.tsx`
  - `features/organizations/components/GeneralSettings.tsx`
- `CloudFolders.IMAGES_AVATARS = "Images/Avatars"` reserved in `features/files/utils/folder-conventions.ts`.
- **No first-class user profile photo flow** in this codebase — `avatar_url` is read in many places (user menu, messaging, dashboard) but there's no dedicated upload surface for the primary user avatar. **ABSORB as a dedicated "Profile photo" tab/flow.**

### 2.8 Metadata, captions, alt text, descriptions

- **`MetadataPanel`** (Image Studio) — title/filename/alt scaffolding, ready for an agent to populate.
- **`build-describe-preview.ts`** in `features/image-studio/utils` — prepares an AI-describe preview payload (the actual describe action is a known follow-up).
- **`ImageSource.metadata`** in `SelectedImagesProvider` carries `description`, `title`, `mimeType`, `fileSize`, `urlExpiresAt`, `fileId` — already plumbed everywhere.
- **`SEOImageViewer`** → `features/scraper/parts/tabs/images/SEOImageViewer.tsx` — given a list of scraped image URLs, requests metadata (meta title / description / suggested titles) per image. **LINK-FROM (scraper-specific).**
- **No alt-text generation route** wired today.
- **Integration:** ABSORB metadata editing as a side panel on the My Images tab (per-tile drawer); LINK-FROM the SEO scraper tool.

### 2.9 OG / social card / banner generation

- **OG generation (real, runtime)** → `app/(public)/canvas/shared/[token]/opengraph-image.tsx` — Next.js `ImageResponse` rendering a 1200×630 OG card for shared canvases. **KEEP (canonical pattern).**
- **`ShareCoverImagePicker`** → `features/canvas/social/ShareCoverImagePicker.tsx` + `preset-covers.ts` — picks a preset Unsplash cover or uploads a custom one (via the Python `POST /assets` endpoint, through `<ImageAssetUploader>`). **LINK-FROM (canvas-scoped).**
- **`ImageAssetUploader` presets** include `"cover"` (1200×630 only) — ready for any OG flow. **ABSORB as the "Branded Upload" tab.**
- **Image Studio presets** include "Open Graph", "Twitter Card", "Schema.org" presets in the SEO bundle. **Already in tab.**
- **Favicon generation** → `app/api/agent-apps/generate-favicon/route.ts`, `app/api/prompt-apps/generate-favicon/route.ts` — generates colored letter-based favicons and saves them via `Api.uploadAndShare` to the agent-app / prompt-app folder. **LINK-FROM (per-app feature).**
- **Banner**: only `features/applet/home/app-display/Banner.tsx` (display component, not a generator). No banner-generation route.
- **No `app/api/og/**` routes exist beyond the per-page `opengraph-image.tsx`.**

### 2.10 Artifacts / canvas / agent tool image renderers

- **`features/canvas/**`** — canvas system supports cover images via `ShareCoverImagePicker` (covers stored as public URLs). Canvas types: `code`, `html`, `markdown`, etc. — most are non-image artifacts.
- **No image-specific tool renderer** in `features/tool-call-visualization/renderers/**` (renderers exist for web search, deep research, news, SEO meta — none for image generation).
- **`ImageOutputBlock`** → `components/mardown-display/blocks/images/ImageOutputBlock.tsx` — renders an image URL output block (download, copy URL, expand) inside markdown content from agents.
- **`ImageBlock`** → `components/mardown-display/blocks/images/ImageBlock.tsx` — markdown-image renderer with feedback/copy/share/zoom.
- **Integration:** When AI generation is implemented, ABSORB output preview into the AI Generate tab; reuse `ImageOutputBlock` for streamed image outputs.

### 2.11 Markdown / rich-text image embeds

- **`ImageBlock`** → `components/mardown-display/blocks/images/ImageBlock.tsx` (markdown `![]()` rendering).
- **`ImageOutputBlock`** → `components/mardown-display/blocks/images/ImageOutputBlock.tsx` (structured image output block).
- Registered in `components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry.tsx` and `BlockRenderer.tsx`.
- Markdown image insertion from the editor uses the chat resource pickers (`UploadResourcePicker`, `ImageUrlResourcePicker`) — not a dedicated "insert image" UI inside the rich-text editor.
- **Integration:** LINK-FROM — the rich-text editor's image-insert button could open `ImageManager` in a focused mode.

### 2.12 Public image catalogs / registries

- **`features/canvas/social/preset-covers.ts`** — curated public Unsplash cover catalog used for canvas social shares.
- **`utils/icons/matrx-public-svg-registry.ts`** + admin route `app/(authenticated)/admin/icon-library` (verify) — SVG icon registry, not raster image catalog.
- **`scripts/migrate-public-assets-to-cdn.ts`** + `lib/cdn-assets.ts` — one-shot migrator that lifts assets out of `/public/` into cloud-files as admin-owned public files; produces typed CDN URL constants for use in components.
- **No user-facing "stock library" beyond Unsplash.**
- **Integration:** ABSORB the canvas preset-covers catalog as a "Curated Covers" bundle in the Public Images tab (or under Branded Upload).

### 2.13 Anything else that doesn't fit above

- **Image proxies**:
  - `app/api/proxy-image/route.ts` (older, no caching headers).
  - `app/api/image-proxy/route.ts` (Cache-Control + CORP for cross-origin embedding).
- **Feedback screenshots** — admin views render `feedback.image_urls` directly. Old screenshots from the deleted Supabase Storage bucket are unrecoverable (per project doctrine: anything in Supabase has no value once the new system is wired). New uploads land in cld_files like everything else.
- **Screenshot capture** → `hooks/useScreenshot.ts` (wraps `useScreenCapture` → `html-to-image`), `hooks/useScreenCapture.ts`. Uses `utils/image/imageCompression.ts` + `generateThumbnail`. Used by feedback flow and AdminIndicator.
- **Voice avatars** → `features/audio/voice/voiceImages.ts` + `ImageLoader.tsx` + `VoiceModal.tsx` — image collateral for voice picker; not a managed surface.
- **`components/matrx/parallax-scroll/**`** — visual parallax of image URLs (used by `image-editing/gallery` legacy page).
- **`types/imageEditorTypes.ts`** — schema placeholder, unused.

## 3. Official components inventory (image-related only)

| Component | Path | Purpose | Image-related | Recommended /image-manager tab |
|---|---|---|---|---|
| `PublicImageSearch` | `components/official/PublicImageSearch.tsx` | Unsplash search + URL paste in compact dialog | Yes | LINK-FROM Public Images tab (it predates the in-tab search) |
| `ImageAssetUploader` | `components/official/ImageAssetUploader.tsx` | Drag/drop upload → preset variants (social/cover/avatar/logo/favicon/square) via `POST /assets` (Python) | Yes | ABSORB as "Branded Upload" tab |
| `ImageCropper` | `components/official/image-cropper/ImageCropper.tsx` | react-easy-crop dialog + aspect ratio | Yes | LINK-FROM "Edit" sub-action |
| `ImageCropperWithSelect` | `components/official/image-cropper/ImageCropperWithSelect.tsx` | Pick + crop in one component | Yes | LINK-FROM |
| `EasyImageCropper` | `components/official/image-cropper/EasyImageCropper.tsx` | Auto-open cropper after image select | Yes | LINK-FROM |
| `cropImage.js` | `components/official/image-cropper/cropImage.js` | Crop helper util | Yes (util) | KEEP |
| `IconResolver` | `components/official/IconResolver.tsx` | Icon component (mentions image) | No (icons only) | n/a |

Image-related components from the registry (`app/(authenticated)/(admin-auth)/administration/official-components/parts/component-list.tsx`):

| Registry id | Path | Purpose |
|---|---|---|
| `public-image-search` | `components/official/PublicImageSearch.tsx` | Unsplash + URL select |
| `image-manager` | `components/image/ImageManager.tsx` | Full-screen tabs picker |
| `image-preview-row` | `components/image/shared/ImagePreviewRow.tsx` | Selected-images row |
| `image-manager-row` | `components/image/shared/ImageManagerRow.tsx` | Row + manage button |
| `image-manager-icon` | `components/image/shared/ImageManagerIcon.tsx` | Icon-only picker |
| `single-image-select` | `components/image/shared/SingleImageSelect.tsx` | Single-image preview tile |
| `image-cropper` | `components/official/image-cropper/index.tsx` (verify) | Crop dialog |
| `image-upload-field` | `components/ui/file-upload/ImageUploadField.tsx` | Inline upload field |
| `image-asset-uploader` | `components/official/ImageAssetUploader.tsx` | Variant uploader |
| `paste-image-handler` | `components/ui/file-upload/PasteImageHandler.tsx` | Clipboard paste wrapper |
| `screenshot-tools` | `hooks/useScreenshot.ts` | Page-screenshot helper |

Demo files for each live under `app/(authenticated)/(admin-auth)/administration/official-components/component-displays/`.

## 4. Routes inventory (image-related only)

| Route | File | Purpose | Recommended action |
|---|---|---|---|
| `/image-manager` | `app/(a)/image-manager/page.tsx` (`_components/ImageManagerPageShell.tsx`) | The hub being expanded | KEEP (target) |
| `/image-studio` | `app/(a)/image-studio/page.tsx` | Image Studio landing | LINK from hub (or absorb landing as hub home) |
| `/image-studio/convert` | `app/(a)/image-studio/convert/page.tsx` (`ImageStudioShellClient.tsx`) | Multi-file → variants | LINK; tab-embed already exists via `EmbeddedImageStudio` |
| `/image-studio/presets` | `app/(a)/image-studio/presets/page.tsx` | Preset reference catalog | LINK (read-only catalog) |
| `/image-studio/library` | `app/(a)/image-studio/library/page.tsx` | User's saved variants | ABSORB as "Studio Library" tab (or LINK) |
| `/image-studio/from-base64` | `app/(a)/image-studio/from-base64/page.tsx` (`FromBase64ShellClient.tsx`) | Paste base64 → cloud asset | ABSORB as a tool inside Upload tab |
| `/files/photos` | `app/(a)/files/photos/page.tsx` | Image-MIME filter of `/files` tree | LINK-FROM (deeper file management) |
| `/image-editing` | `app/(authenticated)/image-editing/page.tsx` | Disabled fabric.js editor | KEEP-SEPARATE (flag for removal) |
| `/image-editing/gallery` | `app/(authenticated)/image-editing/gallery/page.tsx` | ParallaxScroll Unsplash demo | KEEP-SEPARATE (legacy demo) |
| `/image-editing/public-image-search` | `app/(authenticated)/image-editing/public-image-search/page.tsx` | Older Unsplash search demo | KEEP-SEPARATE (legacy demo) |
| `/image-editing/simple-crop` | `app/(authenticated)/image-editing/simple-crop/page.tsx` | `ImageCropperWithSelect` / `EasyImageCropper` demo | KEEP-SEPARATE (legacy demo) |

## 5. Storage / pipeline / API surfaces

- **`POST /assets`** (Python backend) — canonical multi-variant asset pipeline (presets `social`, `cover`, `avatar`, `logo`, `favicon`, `square`). Variants land in `Images/<folder>/<uuid>/` and return permanent CDN URLs. Called from the FE via `features/files/api/assets.ts` (`uploadAsset()`) and the `useFileAsset` hook. **Replaced** the legacy Next.js+Sharp route at `/api/images/upload`, which was deleted on 2026-05-12.
- **`/api/images/studio/process`** → `app/api/images/studio/process/route.ts` — Sharp batch processor for the Image Studio convert flow. Returns base64 data URLs (no storage write). (This is the only remaining caller of the `sharp` npm package on the FE.)
- **`/api/unsplash`** → `app/api/unsplash/route.ts` — Unsplash search/random/collections via `UNSPLASH_ACCESS_KEY`.
- **`/api/proxy-image`** and **`/api/image-proxy`** → external image proxies (CORS / cross-origin embedding). The two routes overlap; the `image-proxy` variant is the better one (Cache-Control, CORP).
- **`/api/agent-apps/generate-favicon`** → procedurally-generated favicon, uploaded to cld_files via `Api.Server.uploadAndShare`. (The legacy `/api/prompt-apps/generate-favicon` was deleted along with prompt-apps deprecation.)
- **OG image generation** → file-based `app/(public)/canvas/shared/[token]/opengraph-image.tsx` using Next.js `ImageResponse`.
- **Cloud-files folder conventions** (`features/files/utils/folder-conventions.ts`):
  - `Images` (top-level drawer)
  - `Images/Chat` (chat attachments)
  - `Images/Screenshots`
  - `Images/Avatars`
  - `Images/Generated` (AI / studio outputs)
  - `Images/Uploads`, `Images/Uploads/Public`, `Images/Uploads/Private` (legacy aliases mapped from `ImageManager.saveTo`).
- **No Supabase Storage anywhere** — every image upload routes through the universal file handler (`fileHandler.upload`, `useFileUpload`) which calls Python's `/files/upload`, or through the canonical `POST /assets` endpoint for preset-variant uploads. The `bucket`/`path` legacy props on `ImageManager` and `PasteImageHandler` are remapped to cloud-files folder paths.
- **CDN migration** → `scripts/migrate-public-assets-to-cdn.ts` + `lib/cdn-assets.ts` constants.
- **Compression / utils** → `utils/image/imageCompression.ts` (canvas resize/quality + thumbnail).
- **Hooks** → `hooks/images/{useImage,useImageDimensions,useDownloadImage,useUnsplashGallery,useUnsplashSearch}.ts`.

## 6. Recommendations for /image-manager hub

### Per-finding classification

| Surface | Action |
|---|---|
| `ImageManager` modal | KEEP-SEPARATE (modal twin) |
| `ImageAssetUploader` (variant pipeline) | ABSORB as new tab |
| `EmbeddedImageStudio` | KEEP (already absorbed) |
| `/image-studio/from-base64` | ABSORB as sub-tool of Upload |
| `/image-studio/library` | ABSORB as Studio Library tab |
| `/image-studio/presets` | LINK-FROM |
| `ImageCropper` (official) | LINK-FROM (sub-action on tiles) |
| `PublicImageSearch` (official) | LINK-FROM (compact-input variant) |
| `ImageUrlResourcePicker` / `PublicImageUrlPicker` | KEEP-SEPARATE |
| `UploadResourcePicker` | KEEP-SEPARATE |
| `ImageManagerRow`/`ImageManagerIcon`/`SingleImageSelect` | LINK-FROM (form helpers) |
| `ImageViewerWindow` / `openImageViewer` | LINK-FROM (use as lightbox click-target) |
| `GalleryFloatingWorkspace` | LINK-FROM (overlay variant) |
| `/files/photos` | LINK-FROM (deep file management) |
| `ShareCoverImagePicker` + `preset-covers` | ABSORB curated covers as a Public Images bundle |
| Avatar / profile-photo flow | ABSORB (no first-class flow today) |
| Favicon generation routes | LINK-FROM (per-app feature) |
| OG image generation (`opengraph-image.tsx`) | KEEP-SEPARATE (per-route Next.js convention) |
| Settings → Image Generation tab | KEEP — defaults provider for AI Generate |
| Settings → Photo Editing tab | KEEP — defaults provider for editing |
| AI image generation backend | TODO — wire when agent shortcut exists |
| `components/advanced-image-editor/**` | KEEP-SEPARATE; flagged for removal (broken under Turbopack) |
| `/image-editing/**` (legacy routes) | KEEP-SEPARATE; flagged for removal |
| Screenshot capture (`useScreenshot`) | LINK-FROM (debug / feedback only) |
| `SEOImageViewer` (scraper) | KEEP-SEPARATE |
| Image proxies (`/api/proxy-image`, `/api/image-proxy`) | KEEP — consolidate into one |
| Feedback image proxy | KEEP-SEPARATE (admin) |
| `scripts/migrate-public-assets-to-cdn.ts` | KEEP-SEPARATE (admin script) |

### Top 5 next tabs to add to /image-manager (priority order)

1. **AI Generate (real)** — Replace the placeholder with an agent-shortcut-driven generation tab (Imagen/Flux/DALL·E via Python). Highest user value, biggest gap, already has settings scaffolding. Variants land in `Images/Generated/`.
2. **Branded Upload** — Surface `ImageAssetUploader` (the social/cover/avatar/logo/favicon preset pipeline) inside the hub. Today users have to dig into org-settings or modal callers to access it.
3. **Studio Library** — Embed the `/image-studio/library` view so saved variant sessions are one click away from the hub.
4. **Profile Photo** — Dedicated tab for the user's primary avatar (uses `ImageAssetUploader` `preset="avatar"`, writes to `Images/Avatars/`). No first-class flow exists today; `avatar_url` is read in 50+ places.
5. **From Base64 / Paste Decode** — Promote `/image-studio/from-base64` into the Upload tab as a sub-tool. It's a natural consumer flow (paste data URL from chat tools) and is currently buried.

## 7. Open questions / risks

- **Selection-awareness gaps**: `ImageAssetUploader`, `ImageCropper`, `EmbeddedImageStudio` produce URLs but don't push into `SelectedImagesProvider`. Absorbing them as tabs requires a thin wrapper that calls `addImage()` after success (`ImageStudioTab` already does this for the studio).
- **Duplicate Unsplash clients**: `app/api/unsplash/route.ts` (server, `UNSPLASH_ACCESS_KEY`) and `components/official/PublicImageSearch.tsx` (client, `NEXT_PUBLIC_UNSPLASH_ACCESS_KEY`) — different keys, different rate-limit pools. Consolidate to the server route only.
- **Duplicate image proxies**: `/api/proxy-image` (no caching) vs `/api/image-proxy` (with caching + CORP). Pick one; delete the other.
- **Dead editor**: `components/advanced-image-editor/**` and `/image-editing/**` depend on `vendors/fabric.js` which is incompatible with Turbopack. Flagged in the route's own copy. Either resurrect with a Turbopack-friendly canvas lib or delete; currently dead code shipping in bundles.
- **Legacy `userImages` / `saveTo` / `bucket` props on `ImageManager`** still mapped onto cloud-files via `legacyPropsToFolderPath`. Safe but worth grep-cleaning callers as a follow-up.
- **No alt-text/caption generator** wired despite `MetadataPanel` having the slots. Captions only exist as a known follow-up in `features/image-studio/FEATURE.md`.
- **No Profile Photo flow today** — `avatar_url` is read in dozens of places (user menu, dashboard, org members, messaging, projects, tasks) but nothing in the codebase writes it from a dedicated UI. `CloudFolders.IMAGES_AVATARS` is reserved but unused.
- **`/image-studio/library` reads but doesn't delete** — only the save side of the API exists. Absorbing the library means addressing the read-only constraint.
- **Image Manager modal vs route divergence** — both files own their own SECTION list; if a tab is added to the route only, the modal silently lacks it. Consider lifting tab definitions to a single registry.
- **`ImageBlock` zoom/share/copy duplicates** of `ImageOutputBlock` — two markdown image renderers with overlapping features. Worth unifying.
- **Camera capture (`components/matrx/camera/**`)** — present but not surfaced; verify if any feature still uses it before recommending removal.
- **`features/image-studio` `index.ts`** is a barrel re-export — flagged by the project's no-barrel rule for gradual replacement.

---

## 8. Execution status (2026-05-05 — Image Manager Hub plan landed)

| Surface | Plan action | Status |
|---|---|---|
| Single section registry (`buildImageManagerSections`) | NEW | ✅ Shipped — `features/image-manager/registry/sections.ts` |
| 3-way selection toggle (Browse/Single/Multi) + persistence | NEW | ✅ Shipped — route shell + `localStorage` |
| `<BrowseImageProvider>` + `useBrowseAction()` | NEW | ✅ Shipped — `features/image-manager/browse/` |
| `CloudImagesTab` Browse-mode click | RETROFIT | ✅ Shipped |
| `CloudFilesTab` Browse-mode click + Photos link | RETROFIT | ✅ Shipped |
| Mobile drawer for sidebar | NEW | ✅ Shipped — `useIsMobile()` |
| Curated covers in Public Images | ABSORB | ✅ Shipped — `PublicImagesSection` |
| Per-tile metadata side drawer | NEW | ✅ Shipped — `CloudFileMetadataSheet` |
| Paste-base64 sub-tool inside Upload | ABSORB | ✅ Shipped — collapsible inside `CloudUploadTab` |
| Branded Upload tab | NEW | ✅ Shipped — `BrandedUploadTab` |
| Studio Library tab | NEW | ✅ Shipped — `StudioLibraryTab` (read-only) |
| AI Generate placeholder + Set defaults link | POLISH | ✅ Shipped — deep-links to `ai.imageGeneration` settings |
| Profile Photo tab | NEW | ✅ Shipped — `ProfilePhotoTab` (Supabase auth update) |
| Tools group (Crop / Lightbox / Floating Gallery / Screenshot / Presets / Photos / Compact picker / Favicons) | NEW | ✅ Shipped — `ToolsTab` |
| `PublicImageSearch` → `/api/unsplash` | CONSOLIDATE | ✅ Shipped — server proxy only |
| `useUnsplashGallery` → `/api/unsplash` | CONSOLIDATE | ✅ Shipped — via `unsplashClient` shim |
| `NEXT_PUBLIC_UNSPLASH_ACCESS_KEY` removed from `.env.example` | CONSOLIDATE | ✅ Done |
| `app/api/proxy-image/` deleted | CONSOLIDATE | ✅ Done — zero callers, replaced by `/api/image-proxy` |
| `components/image/ImageManagerContent.tsx` deleted | CLEANUP | ✅ Done — alias preserved on `ImageManager` for back-compat |
| `CLEANUP-CANDIDATES.md` produced | NEW | ✅ Awaiting Arman's sign-off |
| `ImageBlock` vs `ImageOutputBlock` dedup | DEFER | ⏸ Deferred (tracked in `CLEANUP-CANDIDATES.md`) |
| `features/image-manager/FEATURE.md` | NEW | ✅ Shipped |
| Tier 2 entries in `AGENTS.md` / `CLAUDE.md` | DOCS | ✅ Shipped |
| `components/image/README.md` banner pointing to FEATURE.md | DOCS | ✅ Shipped |
| `features/files/FEATURE.md` change-log entry | DOCS | ✅ Shipped |
| `features/image-studio/FEATURE.md` change-log entry | DOCS | ✅ Shipped |
| Official-components catalog entries (route + new tabs) | DOCS | ✅ Shipped |

