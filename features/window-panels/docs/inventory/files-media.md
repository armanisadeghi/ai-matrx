# Window Panel Inventory — Files & Media

> Chunk row file for the [Panel Inventory](../../PANEL_INVENTORY.md). Covers the file/image/PDF panels.
> Legend: ✓ present · ◑ partial · ✗ missing · — n/a. Priority P0/P1/P2 · Effort S/M/L.
>
> **Scope note.** Nine panels assigned. **Seven are registered overlays** (`cloudFilesWindow`, `filePreviewWindow`, `galleryWindow`, `imageUploaderWindow`, `imageViewer`, `cropStudioWindow`, `pdfExtractorWindow`). **Two are NOT registered** — `cropPreviewWindow` and `initialCropWindow` are inline-only `<WindowPanel>`s, `dynamic()`-mounted by `ImageStudioShell` (`/images/convert`); they pass `File[]` + callbacks that can't survive Redux serialization, so by design they are not in `overlay-ids.ts` / `OverlayController` / `windowRegistryMetadata`. They are listed for completeness and for the consolidation verdict.

---

## Table A — Functionality, Coverage & Composition

| Panel | Domain | Purpose | Maturity | Create(M/I/AI) | Seed | Edit | Manage | Rel | Exec | Fidelity gap | Family | Consolidation verdict | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cloudFilesWindow | Files | Full cloud-files browser (Browse/Recent/Shared/Trash) anywhere | Solid | ◑/✓/✗ (upload via dropzone) | ✗ | ◑ rename/move | ✓ tabs+sidebar | ◑ share | — | none — wraps canonical `WindowPanelShell` from `@/features/files` | filePreview | keep-separate-justified (browser vs single-file preview) | add surface+std-ctrls (P1·M); surface from more spots (P1·S) |
| filePreviewWindow | Files | Non-blocking single-file preview (= `/files` PreviewPane) | Solid | — | ✗ | — | ◑ Versions tab | ◑ copy-link | ◑ download | none — wraps canonical `PreviewPane` | cloudFiles | keep-separate-justified | add surface+std-ctrls (P2·M) |
| galleryWindow | Media | Image gallery (Unsplash search + favorites) → opens imageViewer | Partial | ✗/✓ search/✗ | ✗ | — | ◑ favorites | — | ◑ download/insert | favorites in `localStorage`, not Redux/DB; raw search-image handling | imageViewer | keep-separate-justified | move favorites to Redux/DB (P2·M); surface+std-ctrls (P2·M) |
| imageUploaderWindow | Media | Spawnable upload surface, returns variant URLs via callback bus | Solid | ✓/✓ url-paste/✗ | ✓ currentUrl | — | — | ✓ callback to caller | ✓ upload | none — wraps official `ImageAssetUploader` | — | already-one (canonical core) | surface+std-ctrls (P2·S) |
| imageViewer | Media | Generic zoom/pan/rotate/flip viewer + thumbnail sidebar | Solid | — | ✓ images[] | — | ◑ multi-image nav | — | ◑ download | **main `<img src>` is raw — not `<InlineMediaRef>`** (thumbnails are correct); download is a bare `<a href>` | gallery | already-one (the viewer primitive) | swap main img→InlineMediaRef (P1·S); surface+std-ctrls (P2·M) |
| cropStudioWindow | Media | Standalone batch crop workshop (drop→tab-per-file→crop→apply-to-all→cloud upload) | Solid | ✓ dropzone/✓ paste/✗ | ✗ | ✓ crop | ✓ queue sidebar | — | ✓ save-to-cloud (canonical pipeline) | sidebar tab thumb is raw `<img>` (local objectUrl — low risk) | **crop family** | **merge-to-modes** (3 crop UIs — see verdict below) | crop consolidation review (P1·L); surface+std-ctrls (P2·M) |
| cropPreviewWindow *(unregistered, inline)* | Media | Live two-pane preset preview inside Image Studio | Solid | — | ✗ | ◑ focal point | ◑ file/preset switch | — | — | shell-prop driven (correct for inline); no Redux state | **crop family** | **merge-to-modes** (preview = a mode of the crop component) | fold into mode-driven crop (P1·L) |
| initialCropWindow *(unregistered, inline)* | Media | Pre-variant queue crop walk-through in Image Studio | Solid | — | ✗ | ✓ crop | ◑ queue badge | — | ◑ onComplete(File[]) | not registry-mountable (File[]+cb); shares `InitialCropPanel` parts with cropStudio | **crop family** | **merge-to-modes** (walk-through = a mode; cropStudio is the registry host) | fold into mode-driven crop (P1·L) |
| pdfExtractorWindow | PDF | Floating PDF→text/markdown batch extractor (utility) | Solid | ✓ file picker/✗/✗ | ✗ | ◑ copy/edit text | ◑ history sidebar | — | ✓ batch-extract pipeline | **forks file logic** — raw `FormData`+`fetch`, not `fileHandler`; history is local `useState`, not the `pdfStudioSlice` it ships beside | pdf domain (Studio sibling) | keep-separate-justified (window = quick extract; Studio = deep) | route uploads through fileHandler (P1·M); surface from agent builder (P1·M) |

---

## Table B — Utility, Surface & Construction

| Panel | Header | Footer | Sidebar | 2nd | Tabs | Persist (collect/url/heavy/auto) | Popout | Tray | Ref/cb | Surface | Std ctrls | Help ctx | Canonical core | E2E state | Underused | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cloudFilesWindow | ✓ | ✗ | ✗ (Browse tab has its own) | ✗ | per-feat (Browse/Recent/Shared/Trash) | ✓/✓/✗/✗ | ✓ | default | opener ✓ | ✗ | ✗ | ✗ | ✓ built-from-shared `WindowPanelShell` | ✓ DB→Redux (files slice)→selectors→core | secondaryPanel, surface+help+agents | surface+std-ctrls (P1·M) |
| filePreviewWindow | ✓ | ✗ | ✗ | ✗ | per-feat (Preview/Versions) | ✓/✓/✗/✗ | ✓ | default | opener+`openFilePreview` ✓ | ✗ | ✗ | ✗ | ✓ built-from-shared `PreviewPane` | ✓ files slice | surface+help+agents | surface+std-ctrls (P2·M) |
| galleryWindow | ✓ | ✓ (view-mode toggle) | ✓ favorites (default-closed) | ✗ | ✗ | ✓ (viewMode)/✓/✗/✗ | ✓ | default | opener ✓ | ✗ | ✗ | ✗ | ◑ feature workspace (own) | **◑ favorites in localStorage (forked)** | surface+help+agents | favorites→Redux/DB (P2·M); surface (P2·M) |
| imageUploaderWindow | ✓ | ✓ (Use image / Cancel) | ✗ | ✗ | ✗ | ✗ (ephemeral)/—/✗/✗ | ✓ | default | **callback bus ✓ (gold)** | ✗ | ✗ | ✗ | ✓ official `ImageAssetUploader` + `fileHandler` | ✓ via handler | surface+help+agents | surface+std-ctrls (P2·S) |
| imageViewer | ✓ | ✗ (toolbar in body) | ✓ thumbnails (multi-image) | ✗ | ✗ | ✓ (images,index)/—/✗/✗ | ✓ | default | opener `openImageViewer` ✓ (6+ sites) | ✗ | ✗ | ✗ | ✓ the viewer primitive | local (display-only, fine) | secondaryClass; surface+help+agents | swap main img→InlineMediaRef (P1·S) |
| cropStudioWindow | ✓ titleNode | ✓ rich (destination + actions) | ✓ queue tabs | ✗ | ✗ | ✓ (folder/aspect)/✓/✗/✗ | ✓ | default | opener ✓ | ✗ | ✗ | ✗ | ◑ shares `InitialCropPanel` parts; cloud-save via canonical pipeline | local controller (`useCropStudioController`) | surface+help+agents | crop merge (P1·L); surface (P2·M) |
| cropPreviewWindow *(inline)* | ✓ actionsRight | ✓ (focal point) | ✗ | ✗ | ✗ | — (not registered) | ◑ joins runtime mgr | default | none (inline props) | ✗ | ✗ | ✗ | ◑ `CropPreview` core | shell props (fine inline) | — | crop merge (P1·L) |
| initialCropWindow *(inline)* | ✓ actionsRight (queue badge) | ✓ (skip/apply) | ✗ | ✗ | ✗ | — (not registered) | ◑ joins runtime mgr | default | none (File[]+cb, by design) | ✗ | ✗ | ✗ | ✓ `InitialCropPanel` core (shared w/ cropStudio) | controller (fine inline) | — | crop merge (P1·L) |
| pdfExtractorWindow | ✓ | ✓ (copy footer) | ✓ history | ✗ | per-feat (new + per-doc tabs; text/markdown sub-tabs) | ✓ (history)/✗/✗/✗ | ✓ | default | opener ✓ | ✗ | ✗ | ✗ | ◑ thin shell→`PdfExtractorFloatingWorkspace`; **but upload forks fileHandler** | **◑ history local `useState` (direct Supabase), bypasses `pdfStudioSlice`** | surface+help+agents; urlSync | route upload→fileHandler (P1·M); surface (P1·M) |

---

## Table C — Availability & Placement

| Panel | Opener? | Ref wired | Portable vs route-locked | Tools Grid (tile/category) | Placement issue | Bespoke call sites (count + surfaces) | Usage gap | Action |
|---|---|---|---|---|---|---|---|---|
| cloudFilesWindow | ✓ `useOpenCloudFilesWindow` | popout ✓ | portable | ✓ `tile.quick-files` + `tile.file-upload` (files-web) | two tiles → one window (Files & Upload), ok | **~0** (Tools-Grid only) | **utility-panel gap confirmed** — no "open my files" button on agent builder / chat / record pages | wire bespoke buttons (P1·M) |
| filePreviewWindow | ✓ `useOpenFilePreviewWindow` + `openFilePreview` | popout ✓ | portable | ✗ (none — opened contextually) | ok (no tile is correct; it is contextual) | **5+** — FileContextMenu, RowContextMenu, FileResourceChip, item-presentation, pdf-extractor | well-surfaced | — |
| galleryWindow | ✓ `useOpenGalleryWindow` | popout ✓ | portable | ✓ `tile.gallery` (files-web) | ok | **~0** (Tools-Grid only) | under-surfaced (no "browse gallery/insert image" from chat/builders) | wire bespoke (P2·M) |
| imageUploaderWindow | ✓ `useOpenImageUploaderWindow` (light hook in image dir) | **callback bus ✓** | portable | ✗ (none — contextual upload) | ok | **5+** — image-asset-uploader demo, ImageUrlResourcePicker, PromptAppEditor, AddBlockButton | well-surfaced (gold pattern) | — |
| imageViewer | ✓ `openImageViewer` (+ `useOpenImageViewerWindow`) | popout ✓ (multi-instance) | portable | ✗ (none — opened on click) | ok | **6+** — image-manager Tools/Browse, scraper, gallery, ImageArrivalPeekHost, feedback, imagePeekHost | well-surfaced | — |
| cropStudioWindow | ✓ `useOpenCropStudioWindow` | popout ✓ | portable | ✓ `tile.crop-studio` (files-web) | ok | **~0** (Tools-Grid only) | under-surfaced (no "crop these" from files/gallery/uploader) | wire bespoke (P2·M) |
| cropPreviewWindow *(inline)* | ✗ (inline mount) | none (props) | **route-locked** (`/images/convert` only) | ✗ | inline by design | inline in `ImageStudioShell` | n/a — sub-surface of Image Studio | fold into crop merge (P1·L) |
| initialCropWindow *(inline)* | ✗ (inline mount) | none (File[]+cb) | **route-locked** (Image Studio + EmbeddedImageStudio consumers) | ✗ | inline by design | `ImageStudioShell`, `EmbeddedImageStudio` (SavePageTab etc.) | n/a — sub-surface | fold into crop merge (P1·L) |
| pdfExtractorWindow | ✓ `useOpenPdfExtractorWindow` | popout ✓ | portable | ✓ `tile.pdf-extractor` (files-web) | ok | **~0** (Tools-Grid only) | **utility-panel gap confirmed** — agent builder needing PDF sample data has no "pull PDF text" button; chat/RAG ingest don't fire it | surface from agent builder + RAG (P1·M) |

---

## Synthesis (chunk-level findings)

1. **Crop consolidation — MERGE verdict.** Three crop UIs (`cropStudioWindow`, `initialCropWindow`, `cropPreviewWindow`) already share `InitialCropPanel` parts and the same viewport/aspect-bar primitives. They differ only by **mode**: *batch-tab workshop* (cropStudio, registry host), *queue walk-through* (initialCrop), *live preset preview* (cropPreview). Collapse to **one mode-driven crop component** (`mode: "studio" | "queue" | "preview"`) with the cropStudio registry overlay as the single host; the two inline windows become modes mounted inline by Image Studio. P1·L.

2. **fileHandler adherence — two violations.**
   - `pdfExtractorWindow` (`usePdfExtractor`) **forks file logic**: raw `FormData` + `fetch` to the batch-extract endpoint instead of `fileHandler`. (The deep PDF *Studio* — `PdfStudioReader` — correctly uses `fileHandler.upload`; only the floating window bypasses it.) P1·M.
   - `imageViewer`'s **main image is a raw `<img src={url}>`** (durability/self-heal risk — a signed URL won't re-mint), while its own thumbnail sidebar correctly uses `<InlineMediaRef>`. Swap the main view to `InlineMediaRef`. P1·S. (cloudFiles, filePreview, imageUploader all go through `@/features/files` correctly.)

3. **Utility-panel usage gap CONFIRMED.** `pdfExtractorWindow`, `cloudFilesWindow`, `cropStudioWindow`, `galleryWindow` are **Tools-Grid-only with ~0 bespoke call sites** — exactly the master-doc pattern. Highest-value fix: fire `pdfExtractorWindow` from the **agent builder** (pull PDF sample data) and **RAG ingest**, and add an "open my files" entry on builders/chat/record pages for `cloudFilesWindow`. P1·M.

4. **No surface registration, no std header controls, no help-assistant context** on ANY of the 9 panels (system-wide S2/S3 gap, not a local defect). The two best-built panels to use as the surface-registration pilot are the canonical-core ones: `imageUploaderWindow` and `cloudFilesWindow`.

5. **Gold-pattern exemplars to replicate, not fix.** `imageUploaderWindow` (callback-bus, 5+ sites) and `imageViewer` (`openImageViewer`, 6+ sites) and `filePreviewWindow` (`openFilePreview`, 5+ sites) are the *well-distributed* panels — the model for closing the utility-panel gap on the other four.

6. **State forks.** `galleryWindow` favorites live in `localStorage` (should be Redux/DB); `pdfExtractorWindow` history is local `useState` direct-from-Supabase and bypasses the `pdfStudioSlice` it ships beside (end-to-end-state gap). cloudFiles/filePreview correctly run DB→Redux(files slice)→selectors→canonical core.

7. **No orphans in this chunk.** Every registered panel has a working opener; the two unregistered crop windows are inline-by-design (correct), not orphans.
