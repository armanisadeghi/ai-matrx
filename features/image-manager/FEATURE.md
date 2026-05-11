# FEATURE.md — `image-manager`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-05-07`

---

## Purpose

`image-manager` provides the **shared tab components** for every image-related affordance in the app — public stock search, the user's cloud library, branded variant uploads, the Studio Library, profile-photo updates, AI generation (placeholder), and a Tools group hosting niche utilities (crop, lightbox, screenshot, etc.). These components are consumed by two surfaces: the unified `/images/*` route tree (real Next.js routes, one per tab) and the legacy modal `<ImageManager>` (used as a picker by callers elsewhere in the app).

> **Migration note (2026-05-06):** The dedicated `/image-manager` route was removed. Every tab is now a flat sibling under `/images/*` — see `app/(a)/images/_components/imagesRoutes.ts`. The components in `features/image-manager/components/` are unchanged; only the route shell that hosted them moved.

---

## Entry points

**Routes (under `/images/*`)**
- `/images/public-search` → `<PublicImagesSection>`
- `/images/my-cloud` → `<CloudImagesTab>`
- `/images/all-files` → `<CloudFilesTab>`
- `/images/upload` → `<CloudUploadTab>`
- `/images/branded` → `<BrandedUploadTab>`
- `/images/tools` → `<ToolsTab>`
- `/images/studio-light` → `<ImageStudioTab>`
- `/images/studio-library` → `<StudioLibraryTab>`
- `/images/ai-generate` → `<AIGenerateHero>`
- `/images/profile-photo` → `<ProfilePhotoTab>`

Layout/sidebar shell: `app/(a)/images/layout.tsx` + `app/(a)/images/_components/ImagesSidebar.tsx`. Active route is detected via `usePathname()` — no fake routes, no client-state tab switching.

**Modal**
- `<ImageManager>` from `components/image/ImageManager.tsx` — fullscreen overlay used by callers that need a picker. Consumes the same `buildImageManagerSections` registry; never enters Browse mode. Independent of the route shell — deleting the route had no impact on the modal.

**Hooks**
- `useBrowseAction()` from `features/image-manager/browse/BrowseImageProvider.tsx` — hook every Browse-aware tab calls. Wraps `openImageViewer()` from `features/window-panels/windows/image/ImageViewerWindow.tsx`.
- `useSelectedImages()` (re-used) from `components/image/context/SelectedImagesProvider.tsx` — adds Selection vs. Browse mode awareness via `selectionMode: "single" | "multiple" | "none"` (`"none"` semantically = Browse).

**Registry**
- `features/image-manager/registry/sections.ts` — `buildImageManagerSections(ctx)` factory. Single source of truth for tab list. Both modal and route call it.
- `features/image-manager/registry/types.ts` — `SectionDefinition`, `SectionContext`, `SectionId`.
- `SECTION_IDS` exports stable ids for deep-linking.

**API endpoints**
- `app/api/unsplash/route.ts` — Unsplash proxy (POST + GET). Consumes the server-only `UNSPLASH_ACCESS_KEY`. Used by both `components/official/PublicImageSearch.tsx` and `hooks/images/useUnsplashGallery.ts` (via `hooks/images/unsplashClient.ts`).
- `app/api/image-proxy/route.ts` — image proxy with Cache-Control + CORP. Sole survivor; the legacy `/api/proxy-image` was deleted.
- `app/api/images/upload/route.ts` — Sharp-based variant generator (powers the Branded Upload tab via `<ImageAssetUploader>`).

**Redux**
- No new slice — uses `cloudFiles` (from `features/files/`), the existing `SelectedImagesProvider` context, and the overlay slice for the floating viewer / floating gallery / settings deep-link.

---

## Data model

No new tables. Reads from:

- **`cloud_files`** (Supabase, owned by `features/files/`) — every upload lands here, every "Your Cloud" / "All Files" listing reads from here.
- **Supabase `auth.users.user_metadata`** — `Profile Photo` tab writes `avatar_url` and `picture` via `supabase.auth.updateUser`.

Key types:

- `SectionDefinition` (`features/image-manager/registry/types.ts`)
- `ImageSource` (`components/image/context/SelectedImagesProvider.tsx`) — `type: "public" | "temporary" | "local" | "bucket" | "cloud-file"` with optional cloud-file `metadata`.

---

## Architecture

### One registry, two surfaces

Both `<ImageManager>` and `<ImageManagerPageShell>` call `buildImageManagerSections(ctx)`. The shape:

```ts
interface SectionContext {
  variant: "route" | "modal";
  initialSearchTerm?: string;
  userImages?: string[];
  allowFileTypes?: string[];
  defaultUploadFolderPath?: string;
  defaultUploadFolderId?: string;
  defaultVisibility?: "private" | "public";
  acceptMimes?: string[];
  imageStudioProps?: Record<string, unknown>;
  showImageStudio?: boolean;
  showAIGenerate?: boolean;
  showTools?: boolean; // route only
  selectionMode?: "single" | "multiple" | "none";
}
```

The registry returns a flat `SectionDefinition[]` with `group: "primary" | "tools"`. The route shell splits them with a hairline divider; the modal filters `group === "primary"`.

### Selection modes

`useSelectedImages().selectionMode` is the single dispatcher:

| Mode       | What clicks do                                             | Where used        |
|------------|------------------------------------------------------------|-------------------|
| `single`   | Replace selection with this one image                       | route + modal     |
| `multiple` | Toggle this image in/out of selection                      | route + modal     |
| `none`     | Browse — open `ImageViewerWindow` via `useBrowseAction()`  | route only        |

The 3-way toggle in the route's sidebar persists last choice to `localStorage["image-manager:selection-mode"]`.

### Browse mode

`<BrowseImageProvider>` mounts at the route shell root (and inside the modal — it falls back to a no-op if no provider). Tabs that opt-in (currently `CloudImagesTab`, `CloudFilesTab`, `PublicImagesSection`, `ToolsTab`) call `useBrowseAction()` and short-circuit in `selectionMode === "none"` to dispatch `openImageViewer({ images, alts, initialIndex, title })`.

---

## Tabs (current registry)

Primary group:

1. **Public Images** (`PublicImagesSection`) — Curated Covers chip + Unsplash search. Curated covers come from `features/canvas/social/preset-covers.ts`.
2. **Your Cloud** (`CloudImagesTab`) — image-filtered view of `cloud_files`. Includes a per-tile `Info` button that opens the `CloudFileMetadataSheet` side drawer.
3. **All Files** (`CloudFilesTab`) — full cloud-files browser. Includes a "Photos" link to `/files/photos` for the deeper file-management view.
4. **Upload** (`CloudUploadTab`) — image-first drag/drop/paste/picker powered by `<ImageAssetUploader mode="cloud">`, while preserving the Cloud Files upload pipeline. Includes a collapsible "Paste base64 instead" sub-tool (`Base64DecoderShell`).
5. **Branded Upload** (`BrandedUploadTab`) — wraps `<ImageAssetUploader pasteCaptureMode="asset">`. Presets: `social | cover | avatar | logo | favicon | square`. Dragged, picked, or pasted images run through the Sharp variant pipeline and generated variants are auto-pushed to `SelectedImagesProvider`.
6. **Image Studio** (`FullImageStudioTab`, id `studio-full`) — embeds the full three-column `<ImageStudioShell>` (the same component that powers `/image-studio/convert`). Lazy-loaded with `dynamic(... ssr: false)`. Users get the complete preset-catalog → file-card grid → export-panel pipeline without leaving the hub.
7. **Studio Light** (`ImageStudioTab`, id `image-studio`) — embeds the picker-tuned `<EmbeddedImageStudio hideTitle>`. Returns variant URLs straight to `SelectedImagesProvider`, which the full shell does not — picker callers still want this.
8. **Studio Library** (`StudioLibraryTab`) — read-only embed of the `Images/Generated/...` cloud folder. Resolves the folder ID via `ensureFolderPath`, then keys a `<CloudFilesTab>` to it.
9. **AI Generate** (`AIGenerateHero`) — placeholder. "Set defaults" button deep-links to the `ai.imageGeneration` settings tab.
10. **Profile Photo** (`ProfilePhotoTab`) — wraps `<ImageAssetUploader preset="avatar">`, calls `supabase.auth.updateUser({ data: { avatar_url, picture } })` on completion.

Tools group (route only):

11. **Tools** (`ToolsTab`) — landing card grid:
    - **Active tools**: Crop (inline expand), Crop Studio (one-or-many overlay → `cropStudioWindow`), Lightbox (`openImageViewer`), Floating Gallery (`galleryWindow`), Screenshot (`useScreenshot`), Presets reference, Photos view, Compact picker, Favicons explainer.
    - **Beta** subgroup: legacy / candidate-for-removal surfaces tracked in `CLEANUP-CANDIDATES.md` — Legacy Image Editor, Legacy Parallax Gallery, Legacy Public Image Search, Legacy Easy Cropper. Kept reachable so we can verify nothing essential was missed before deletion.

Adding a new tile is a `ToolDescriptor` append — see `ToolsTab.tsx`.

---

## Key flows

### Adding a new tab

1. Create the tab component under `features/image-manager/components/<Name>Tab.tsx`. Consume `useSelectedImages()` and `useBrowseAction()` if it shows images.
2. Append to the appropriate group (`primary` or `tools`) in `features/image-manager/registry/sections.ts`. Add a stable id under `SECTION_IDS`.
3. Done — both modal and route pick it up automatically.

### Cloud upload flow

1. User picks/drops a file in `CloudUploadTab` (or pastes an image into the page; base64 stays in the sub-tool).
2. `<ImageAssetUploader mode="cloud">` renders the shared official image dropzone and calls `useFileUpload`, so bytes still write to `cloud_files` via the upload pipeline in `features/files/`.
3. New `CloudFileRecord` is added to the cloud-files Redux slice, which ripples into Your Cloud / All Files automatically (no refetch needed).
4. `CloudUploadTab` calls `addImage()` with the resolved URL so the upload becomes selectable in the footer preview row.

### Browse-mode click

1. Tab calls `useBrowseAction()` and gets a `browse(payload)` function.
2. On click, the tab resolves the visible images to URLs and dispatches `browse({ images, alts, initialIndex, title })`.
3. `<BrowseImageProvider>` invokes `openImageViewer(dispatch, payload)` from `ImageViewerWindow.tsx`, which dispatches `openOverlay({ overlayId: "imageViewer", instanceId: "default", data })`.
4. `OverlayController` mounts `ImageViewerWindow` with the payload spread as props.

### Branded upload flow (Sharp variants)

1. User picks a preset chip and uploads by drop, picker, or clipboard paste.
2. `<ImageAssetUploader pasteCaptureMode="asset">` POSTs to `/api/images/upload` with the preset key.
3. Server returns `{ image_url, primary_url, social_url, ... }` — every populated URL is auto-added to `SelectedImagesProvider` so the user can drag the variant into a form afterwards.

---

## Invariants & gotchas

- **Modal never enters Browse mode.** `selectionMode: "none"` is route-only. The modal hides the Image Studio tab when in `"none"` historically; the registry honors this via `showImageStudio !== false && selectionMode !== "none"`.
- **`group: "tools"` is route-only.** The modal calls `buildImageManagerSections({ variant: "modal", showTools: false })`. Don't put primary functionality under `tools`.
- **`SelectedImagesProvider.selectionMode === "none"` is "Browse".** Don't add a 4th mode — the contract is enumerated and consumed in two surfaces. Reuse `none`.
- **`Base64DecoderShell` lives in `features/image-studio`** — Image Manager imports it. If Image Studio moves, update the import in `CloudUploadTab.tsx`.
- **`/images/upload` uses `ImageAssetUploader` in cloud mode, not `FileUploadDropzone`.** Keep `FileUploadDropzone` in `features/files` for generic files and overlay upload surfaces; Image Manager uses the official image-first uploader for visual consistency.
- **Server-only Unsplash key.** `NEXT_PUBLIC_UNSPLASH_ACCESS_KEY` was removed. Every Unsplash call goes through `/api/unsplash` via `hooks/images/unsplashClient.ts` (or the GET form for `PublicImageSearch`). Don't reintroduce a `NEXT_PUBLIC_*` Unsplash key.
- **`ImageManagerContent` is a deprecated alias** of `<ImageManager>` — kept for legacy callers. New code imports `ImageManager` directly.

---

## Related features

- **Depends on:** `features/files` (cloud-files redux + upload), `features/image-studio` (`EmbeddedImageStudio`, `Base64DecoderShell`, presets catalog), `features/window-panels` (`ImageViewerWindow`, `GalleryWindow`, overlay controller), `features/canvas/social` (curated covers).
- **Depended on by:** every product surface that uses `<ImageManager>` (chat, applets, recipes, agent UIs, admin tools).
- **Cross-links:**
  - `features/files/FEATURE.md`
  - `features/image-studio/FEATURE.md`
  - `features/window-panels/FEATURE.md`
  - `features/image-manager/IMAGE-FEATURE-INVENTORY.md` — running inventory of every image-related component in the codebase.
  - `features/image-manager/CLEANUP-CANDIDATES.md` — sign-off-required deletion list.

---

## Current work / migration state

The Image Manager Hub plan landed across Phases 1–7 (May 2026). Pending owner-approved deletions live in `CLEANUP-CANDIDATES.md`. Markdown image-block dedup (legacy `ImageBlock` vs `ImageOutputBlock`) is deferred and tracked in the same doc.

---

## Change log

- `2026-05-07` — `/images/upload` now renders `<ImageAssetUploader mode="cloud">` for the main image dropzone, preserving the existing Cloud Files upload pipeline, folder picker, paste support, selection integration, and base64 sub-tool while aligning the Upload and Branded Upload visual affordances.
- `2026-05-07` — Branded Upload now opts into `ImageAssetUploader pasteCaptureMode="asset"`, so clipboard images can be pasted directly into the Sharp variant pipeline.
- `2026-05-07` — My Cloud image bulk selection: extracted image grid/list renderers, added per-image bulk checkboxes, wired a shared floating selection toolbar for download/move/visibility/delete/cancel, and reused the official empty-state card for empty results.
- `2026-05-07` — Browse-mode image preview gained icon-only rotate-left, rotate-right, flip-horizontal, and flip-vertical controls in the shared Image Viewer window.
- `2026-05-07` — My Cloud search now uses the official `SearchInput`, matching Public Search while preserving the existing filename filter behavior.
- `2026-05-07` — Public Search toolbar polish: switched Unsplash search to the official `SearchInput`, moved result text into a dedicated results header, added a more visible loaded-count status, and reused the official `EmptyStateCard` when no Unsplash images are loaded.
- `2026-05-05` — **Legacy `/image-editing/*` routes deleted** (CLEANUP-CANDIDATES.md items 2-5). Dropped the entire `app/(authenticated)/image-editing/` directory (4 pages + 1 layout): the disabled placeholder, the parallax-scroll gallery demo, the standalone public-image-search demo, and the simple-crop demo. `pnpm tsc --noEmit` clean. Knock-on cleanups not yet applied (per owner): `components/matrx/parallax-scroll/` is now orphaned, and the live "Image Search" entry in `constants/navigation-links.tsx` (plus `favicon-route-data.ts` and the deprecated `MatrixFloatingMenu.tsx`) still link to `/image-editing/public-image-search` and will 404 from `<MatrxFloatingMenu>`/`<NavigationMenu>` until pruned. The `ToolsTab.tsx` **Beta** subgroup also still links to the deleted routes — owner asked to leave the Tools tab untouched.
- `2026-05-05` — **Fabric.js purge** (CLEANUP-CANDIDATES.md items 1 + 9). Deleted `components/advanced-image-editor/` (17 files), `vendors/fabric.js` (~1.0 MB), and the orphaned duplicate `app/vendor/fabric.js` (~1.2 MB), plus their now-empty parent directories. Companion build-config cleanup: dropped the `vendors/fabric.js` `script-loader` rule from `utils/next-config/webpackConfig.js`, removed the duplicate fabric-specific `jsdom` client externalization block from `next.config.js` (the remaining block in `webpackConfig.js` still covers other transitive consumers), and removed `@types/fabric` from `package.json` devDependencies. `pnpm install` re-pinned the lockfile. The `/image-editing/*` legacy demo routes and the `ToolsTab` Beta group still reference `/image-editing` placeholder URLs — pending in items 2-7 of the cleanup checklist.
- `2026-05-05` — **Your Cloud** view-mode toggle (Cozy / Compact / List) plus localStorage persistence under `image-manager:cloud-images-view`. Same UX feel as Public Images — Cozy is the previous default (5-col grid), Compact bumps to 9-col with smaller tiles, List is a table-style row view with thumbnail + filename + size + relative timestamp + mime. Also fixed a Browse-mode bug: clicking a tile previously kicked off `Promise.all(imageFiles.map(resolveCloudFileUrl))` (a signed-URL request per visible image, on every single click) AND pushed each `ResolvedCloudUrl` *object* into the viewer's `images: string[]` contract — so `<ImageViewerWindow>` rendered `<img src="[object Object]">`. Browse now resolves only the clicked file's URL and opens the viewer with one image.
- `2026-05-05` — Round 2: collapsible sidebar (slim icon-only rail; the blue ImageIcon doubles as the expand affordance), persisted to `localStorage` under `image-manager:sidebar-collapsed`. Renamed the embedded studio tab to **Studio Light** and added a new **Image Studio** tab (`FullImageStudioTab`, id `studio-full`) that lazy-loads the full `<ImageStudioShell>` in-page. Tightened the **Crop Studio** tool card copy to call out one-or-many file support and renamed it to "Crop Studio (one or many)". Added a **Beta** subgroup inside `ToolsTab` linking the four cleanup-candidate `image-editing/*` routes (legacy editor, parallax gallery, public-image-search demo, easy cropper demo) so they remain reachable for verification before deletion. New `SECTION_IDS.studioFull = "studio-full"`.
- `2026-05-05` — `SECTION_IDS` extracted into a leaf `registry/ids.ts` module to break a Turbopack TDZ cycle (`ImageManager` → `sections.ts` → `ToolsTab` → `ImageCropperWithSelect` → `SingleImageSelect` → `ImageManager`). `sections.ts` re-exports for back-compat. Drive-by: deleted orphaned `features/image-studio/components/InitialCropDialog.tsx` (zero importers — `InitialCropWindow` is the canonical wrapper).
- `2026-05-05` — Hub plan completed: section registry, 3-way selection mode (Browse/Single/Multi), `BrowseImageProvider`, Curated Covers, metadata sheet, Photos link, base64 paste, Branded Upload, Studio Library, Profile Photo tabs, Tools group, Unsplash server proxy, `proxy-image` deleted, `ImageManagerContent.tsx` deleted, cleanup candidates listed.
