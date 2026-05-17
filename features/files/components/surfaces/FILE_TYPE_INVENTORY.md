# File Type Capability Inventory

> **Scope:** the two file-viewing surfaces and their 7 tabs (Preview, Edit, Document, Analysis, Share, Info, Versions). Treat this doc as the single source of truth for "what do we support per file type today." Update it whenever a previewer, editor, or tab gains/loses a capability.
>
> **Surfaces:**
> - `PreviewPane` (`features/files/components/surfaces/PreviewPane.tsx`) — compact side panel inside `PageShell` at `/files` and `/files/<path>`.
> - `SingleFileShell` (`features/files/components/surfaces/single-file/SingleFileShell.tsx`) — dedicated full-page viewer at `/files/f/{fileId}`. Adds a left **control rail** that drives per-tab settings (zoom/rotate/fit/transparency for images, Rendered/Source + viewport for HTML, font-size/word-wrap/minimap/tab-size for Monaco). Reuses the same 7-tab body via `<FileTabsBody/>`.
>
> **Type resolution:** every decision below flows from `features/files/utils/file-types.ts` (the `FILE_TYPES` registry → `previewKind` → previewer/editor). When this doc and the registry disagree, the registry wins — fix this doc.
>
> **Tab-by-file-type semantics:** the Preview tab should *render* the file (HTML rendered, SVG rendered, Markdown rendered, image displayed, etc.). The Edit tab is the source-of-truth editor (Monaco). When a file kind can't be rendered, the Preview tab falls back to "source view" or a metadata card — but that's a gap, not the design intent.

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Fully supported — production quality |
| 🟡 | Works but has a known gap (see Notes) |
| 🔴 | Missing — falls back to a generic / source / unhelpful state |
| ➖ | Intentionally not applicable for this kind |
| 🐛 | Bug: wrong tab content (e.g. Preview shows source instead of rendered output) |

The seven columns map to the seven tabs in `PreviewPane.tsx`.

- **Preview** — visual render (the *result*, not the source)
- **Edit** — inline Monaco editor with the right language hint, Cmd+S saves a new version
- **Document** — RAG ingest + processed-document viewer (works for any file with `processed_documents` row)
- **Analysis** — `useFileAnalysis` detectors (today: PDF-centric)
- **Share** — visibility, share links, people/groups
- **Info** — read-only metadata
- **Versions** — `cld_file_versions` list + Restore

**Document / Share / Info / Versions** are file-type-agnostic and uniformly supported on every *real* `cld_files` row. They are marked ✅ across the board in the tables below unless there's a specific gap, and virtual-source files (Notes, Code Snippets, Agent Apps) get adapter-specific behavior — see § Virtual sources.

---

# Part 1 — Capability framework

A "complete" file type touches ~55 capability slots across 9 groups. Most file types don't need all of them; types live on a tier curve:

- **T0 — Bare minimum.** Group 1 only. Examples: `7z`, `dmg`, opaque binaries. Icon + Download is the whole story.
- **T1 — Standard preview.** Groups 1–4 + parts of 5–6. Most kinds live here.
- **T2 — First-class citizen.** All 9 groups. Today: `pdf`, `image`, `html`, `md`. Aspires-to: `video`, `code`, `csv`.

**Legend (used across this doc):**

| Symbol | Meaning |
|---|---|
| ✅ | Implemented and production-quality |
| 🟡 | Works with a known gap (see notes) |
| 🔴 | Missing |
| ➖ | Intentionally not applicable for this kind |
| 🐛 | Wrong behaviour (e.g. preview shows source instead of rendered output) |

When the doc and the code (`features/files/utils/file-types.ts` / `FilePreview.tsx` / `EDITABLE_KINDS` / `LANGUAGE_BY_EXT`) disagree, the code wins — fix the doc.

## Group 1 — Identity & metadata

| # | Slot | Where |
|---|---|---|
| 1 | Extensions list | `FILE_TYPES[].extensions` |
| 2 | MIME types (canonical + aliases) | `FILE_TYPES[].mime` (+ `mimeAliases`) |
| 3 | Category + sub-category | `FILE_TYPES[].category` / `subCategory` |
| 4 | Display name | `FILE_TYPES[].displayName` |
| 5 | `previewKind` | `PreviewKind` union + `FILE_TYPES[].previewKind` |
| 6 | Icon (Lucide) | `FILE_TYPES[].icon` |
| 7 | Tailwind color class | `FILE_TYPES[].color` |
| 8 | 🟡 Magic-byte / header signature | `binary-sniff.ts` (only a few types) |
| 9 | 🔴 Sensitivity flag | Not modeled yet — `.env`/`.pem`/`.key` should default to private + warn-on-share |

## Group 2 — List + grid presentation

| # | Slot | Where |
|---|---|---|
| 10 | Icon at standard sizes | `FileIcon` |
| 11 | Thumbnail strategy enum (`icon \| auto \| first-frame \| …`) | `FILE_TYPES[].thumbnailStrategy` |
| 12 | 🟡 Real thumbnail generator | `useFileAsset` variants — implemented for image; PDF/video need server-side help |
| 13 | 🔴 Grid card preview body | Most kinds show only an icon in the grid today |
| 14 | 🔴 Hover / spacebar quick-look | Not implemented |
| 15 | Kind-filter chip membership | `selectKindFilter` + chips data |
| 16 | 🟡 Default sort column per kind | Single global sort today |

## Group 3 — Preview tab

| # | Slot | Where |
|---|---|---|
| 17 | Previewer component | `core/FilePreview/previewers/<Kind>Preview.tsx` |
| 18 | Streaming policy (signed-URL `src` vs blob fetch) | Dispatcher in `FilePreview.tsx` |
| 19 | Size-cap override | `FILE_TYPES[].previewSizeCapOverride` + `getFilePreviewProfile` |
| 20 | Inline toolbar fallback when no rail | Each previewer's own header strip |
| 21 | Control-rail panel for `SingleFileShell` | `surfaces/single-file/<Mode>Controls.tsx` + rail dispatcher |
| 22 | Error state ("unavailable" / "format unsupported") | Each previewer |
| 23 | Loading skeleton | Each previewer |

## Group 4 — Edit tab

| # | Slot | Where |
|---|---|---|
| 24 | Editable-kind classification | `preview-actions.ts` → `EDITABLE_KINDS` |
| 25 | Monaco language id mapping | `CloudFileInlineEditor.tsx` → `LANGUAGE_BY_EXT` |
| 26 | Save → new-version handler | `CloudFileInlineEditor.handleSave` (uses `uploadFiles` thunk) |
| 27 | 🔴 Per-type non-text editor | Image cropper, CSV grid, etc. — all "Coming soon" today |
| 28 | 🔴 Format-on-save / linter hook | Not implemented |
| 29 | 🔴 Starter template for "New <type>" | Not implemented |

## Group 5 — Companion tabs

| # | Slot | Where |
|---|---|---|
| 30 | Document (RAG) tab | Backend-driven, content-agnostic for text-extractable files |
| 31 | 🟡 RAG ingest defaults per kind (chunk size, embedding model) | Python defaults; no per-kind override |
| 32 | 🟡 Analysis-tab detectors | `features/file-analysis/` — exhaustive for PDF, nothing for others |
| 33 | Info tab (uniform metadata) | `FileInfoTab.tsx` |
| 34 | 🟡 Info-tab extra fields per kind | Image gets AI metadata; others bare |
| 35 | Versions list | `FileVersionsList.tsx` |
| 36 | 🔴 Per-kind diff renderer | No diff anywhere — text-diff / image-diff / metadata-diff all missing |
| 37 | Share tab (file-type agnostic) | `FileShareTab.tsx` |

## Group 6 — Actions & integrations

| # | Slot | Where |
|---|---|---|
| 38 | Universal actions (Download, Copy link, Rename, Move, Delete, Duplicate) | `useFileActions` |
| 39 | Edit-handoff button (gated on `EDITABLE_KINDS`) | `preview-actions.ts` |
| 40 | 🟡 Open-in-feature handoff | `openInRoute` in adapters; PDF → PDF Extractor exists; most others 🔴 |
| 41 | 🔴 Per-type extra actions | (`.zip` → "Browse contents", `.docx` → "Convert to PDF", `.json` → "Format") |
| 42 | 🔴 Convert-to dropdown | Not implemented |
| 43 | 🟡 Print handler | `block-print-system` infra exists; per-kind printers wired for some |

## Group 7 — Cross-feature behavior

| # | Slot | Where |
|---|---|---|
| 44 | 🟡 Inline file-chip | `FileResourceChip` (generic) — could be richer per kind |
| 45 | 🔴 Drag-to-slot adapter (drop a file onto an agent / data source / context slot) | Not implemented |
| 46 | 🟡 Citation deep-links (e.g. `?tab=document&page=N&chunk=…`) | PDF only |
| 47 | 🔴 Embeddability policy (CDN-friendly / signed-only / never) | Not modeled |
| 48 | 🟡 Upload-accept rules per surface | Per-uploader, no central policy |
| 49 | 🔴 Paste-from-clipboard support per type | Not implemented |

## Group 8 — Creation paths

| # | Slot | Where |
|---|---|---|
| 50 | 🔴 "New <type>" entry in New-item menu | Folder only today |
| 51 | 🔴 Template gallery for that type | Not implemented |
| 52 | 🟡 Virtual-source provisioning | Notes / Code Snippets / Agent Apps own this |

## Group 9 — Bundle / ops

| # | Slot | Where |
|---|---|---|
| 53 | Dynamic-import declaration | `FilePreview.tsx` |
| 54 | 🟡 Bundle-weight annotation | Comment block in `FilePreview.tsx` |
| 55 | 🟡 Browser-codec / runtime caveats | Captured per-type in this doc, not in code |

---

# Part 2 — Per-type wishlists (T1/T2 types)

Compact, prioritized "what's next" for each high-impact kind. Pair each entry with the support matrix in Part 3 and the consolidated priorities at the end of this doc. Add a new wishlist whenever a kind graduates to T1+.

## Image (jpg / png / webp / avif / gif)

**Tier:** T2 (in progress) · **Registry:** `previewKind: "image"`

**Has** ✅
- Registry: extensions, MIME, category, displayName, icon, color, `thumbnailStrategy: "auto"`
- ImagePreview previewer (passive in `PreviewPane`, controlled in `SingleFileShell`)
- ImagePreviewControls rail: zoom (10–800%), rotate ±90°, fit/100% toggle, transparency grid, reset
- Action bar: Download, Copy link, Rename, Delete
- Variant thumbnails via `useFileAsset` (signed asset URL with `hero_url`/`cover_url`/`primary_url`)
- AI metadata enrichment (description, keywords, dominant colors) surfaced in the Info tab
- Kind chip: "Images"

**Wishlist (prioritized)**
1. 🔴 **Grid card preview** — show the actual thumbnail in the file grid, not the generic icon (slot #13)
2. 🔴 **Click-and-drag pan** when zoomed past fit (wheel / trackpad pan already work via overflow scroll)
3. 🔴 **EXIF in Info tab** — camera, lens, focal length, GPS, taken-at (slot #34)
4. 🔴 **Image-specific Analysis detectors** — OCR, NSFW, dominant-objects, content-aware bounding boxes (slot #32)
5. 🔴 **Inline image editor** — crop, rotate-and-save, annotate (slot #27)
6. 🔴 **Image diff** — side-by-side, onion-skin, difference blend (slot #36)
7. 🔴 **Convert-to** — heic → jpg, png → webp, large-original → resized variants (slot #42)
8. 🟡 **HEIC/HEIF server-side conversion** — currently Safari-only

**Code touchpoints**
- `features/files/utils/file-types.ts` (registry)
- `features/files/components/core/FilePreview/previewers/ImagePreview.tsx`
- `features/files/components/surfaces/single-file/ImagePreviewControls.tsx`
- `features/files/hooks/useFileAsset.ts` (variants)

---

## PDF

**Tier:** T2 · **Registry:** `previewKind: "pdf"`

**Has** ✅
- Registry: ext `pdf`, MIME `application/pdf`, displayName, icon, color
- PdfPreview (the best previewer in the system): zoom, fit-page, fit-width, actual-size, rotate, prev/next + counter, ResizeObserver sizing, overlay slot for annotations
- HTTP-range streaming via service worker — no full-file blob fetch
- Action bar: Download, Copy link, plus "Open in PDF Extractor" handoff
- Analysis tab: full detector grid (Overview, Outline, Text, PII, Tables, Images, Regions, Duplicates, Classify)
- Document tab: RAG ingest + processed-document viewer + citation deep-links (`?tab=document&page=N&chunk=…`)
- Kind chip: "PDF"

**Wishlist (prioritized)**
1. 🔴 **Edit tab content** — wire the PDF Extractor's edit surface into the Edit tab so users don't have to bounce routes (slot #27)
2. 🔴 **In-toolbar text search (Cmd+F)** — text-layer selection works; no search UI
3. 🔴 **Thumbnail strip + outline panel** inside the renderer (Studio has them; standard preview doesn't)
4. 🔴 **Promote PDF toolbar controls into the SingleFileShell rail** (slot #21)
5. 🔴 **PDF diff** — page-by-page text or visual diff for the Versions tab (slot #36)
6. 🔴 **Convert-to** — pdf → docx / pdf → markdown export (slot #42)
7. 🟡 **Real thumbnail (page 1)** in the file grid (slot #12, slot #13)

**Code touchpoints**
- `features/files/utils/file-types.ts`
- `features/files/components/core/FilePreview/previewers/PdfPreview.tsx`
- `features/pdf-extractor/**` (the deeper PDF tooling)
- `features/file-analysis/**` (Analysis detectors)

---

## HTML

**Tier:** T2 · **Registry:** `previewKind: "html"`

**Has** ✅
- Registry: ext `html, htm`, MIME `text/html`, displayName, icon, color
- HtmlPreview: sandboxed iframe (`sandbox="allow-scripts allow-popups allow-forms"`, no same-origin) with Rendered/Source toggle
- HtmlPreviewControls rail: View toggle, Viewport picker (Auto / Phone / Tablet / Desktop), Reload
- Source view in `PreviewPane` falls back to a local toggle in the previewer header
- Edit tab: Monaco with `html` language (`LANGUAGE_BY_EXT.html`)
- `EDITABLE_KINDS` includes `"html"`
- Action bar: Download, Copy link, Edit, Rename, Delete

**Wishlist (prioritized)**
1. 🔴 **Silent signed-URL refresh on focus** — 1-hour TTL means long-open sessions go blank
2. 🔴 **Grid card preview** — render a tiny iframe screenshot (or server-rendered PNG) in the file grid (slot #13)
3. 🔴 **HTML-specific Analysis detectors** — broken links, missing alt-text, document outline, script count, accessibility score (slot #32)
4. 🔴 **Info-tab extras** — `<title>`, scripts loaded, external resources count (slot #34)
5. 🔴 **Convert-to** — html → pdf (print-to-pdf) and html → md (readability) (slot #42)
6. 🟡 **Vue/Svelte/Astro "compiled-placeholder" view** — open question; needs an SFC compiler bundle
7. 🟡 **Template files** (`hbs`, `twig`, `jinja`, …) "Source / Rendered with sample data" toggle

**Code touchpoints**
- `features/files/utils/file-types.ts`
- `features/files/components/core/FilePreview/previewers/HtmlPreview.tsx`
- `features/files/components/surfaces/single-file/HtmlPreviewControls.tsx`
- `features/files/components/surfaces/FileViewerControlsContext.tsx` (`htmlMode` / `htmlViewport` / `htmlReloadKey`)

---

## Markdown

**Tier:** T2 (in progress) · **Registry:** `previewKind: "markdown"`

**Has** ✅
- Registry: ext `md, markdown, mdx`, MIME, displayName, icon, color
- MarkdownPreview: ReactMarkdown + GFM (tables / strikethrough / task lists) + math (KaTeX) + Prism-highlighted code blocks
- Truncation at 1 MB
- Edit tab: Monaco with `markdown` language
- `EDITABLE_KINDS` includes `"markdown"`
- Kind chip: "Markdown"

**Wishlist (prioritized)**
1. 🔴 **Outline / TOC sidebar** — auto-generated from headings
2. 🔴 **Print mode** — clean print stylesheet (slot #43)
3. 🔴 **Grid card preview** — render the first ~5 lines (slot #13)
4. 🔴 **Convert-to** — md → html / md → pdf / md → docx (slot #42)
5. 🟡 **MDX runtime** — currently raw JSX tags are rendered as text; either drop MDX from `markdown` previewKind or wire a real MDX runtime (decision open)
6. 🔴 **Starter template** for "New Markdown file" — frontmatter scaffold + heading (slot #51)

**Code touchpoints**
- `features/files/utils/file-types.ts`
- `features/files/components/core/FilePreview/previewers/MarkdownPreview.tsx`

---

## Video

**Tier:** T1 · **Registry:** `previewKind: "video"`

**Has** ✅
- Registry: ext `mp4, mov, webm, m4v, mkv, avi`, MIME, displayName, icon, color
- VideoPreview: bare `<video controls>` (browser-native chrome)
- Streamed via signed URL — no size cap
- Action bar: Download, Copy link

**Wishlist (prioritized)**
1. 🔴 **Match AudioPreview's feature set** — playback rate (0.5×–2×), AB-loop, ±10s skip, click-scrub timeline with buffered bar (`AudioPreview` is the reference implementation)
2. 🔴 **Captions / cue-track wiring** — `<track>` support, language picker
3. 🔴 **Picture-in-picture toggle**
4. 🔴 **Scrub-thumbnail preview** (server-rendered sprite sheet)
5. 🔴 **"Format unsupported" branch** — `mkv` / `avi` silently fail on Chrome today
6. 🔴 **Grid card preview** — show the poster frame, not the icon (slot #13)
7. 🔴 **Info-tab extras** — duration, codec, resolution, bitrate (slot #34)
8. 🔴 **Video-specific Analysis** — speech-to-text, scene boundaries, dominant colors per frame (slot #32)

**Code touchpoints**
- `features/files/utils/file-types.ts`
- `features/files/components/core/FilePreview/previewers/VideoPreview.tsx`
- `features/files/components/core/FilePreview/previewers/AudioPreview.tsx` (reference for player polish)

---

## Code (js / ts / py / go / rs / java / etc.)

**Tier:** T1 (uneven) · **Registry:** `previewKind: "code"`

**Has** ✅
- Registry: extensions + aliases (`Dockerfile.*`, `Makefile.*`, `Procfile`, dotfiles, …), MIME, displayName, icon, color
- CodePreview: Prism syntax highlighting with a rich language map
- Edit tab: Monaco — but `LANGUAGE_BY_EXT` is a SUBSET of the registry, so many languages open as `plaintext`
- `EDITABLE_KINDS` includes `"code"`
- Kind chip: "Code"

**Wishlist (prioritized)**
1. 🔴 **Editor language-map parity** — extend `CloudFileInlineEditor.LANGUAGE_BY_EXT` to cover every `previewKind: "code"` extension (slot #25). Cheapest, highest-impact change.
2. 🔴 **`.diff` / `.patch` viewer** — use React-Diff-Viewer (already in the codebase) for split/unified diffs (slot #17)
3. 🔴 **Format-on-save / linter hook** — Prettier for js/ts/css, Biome / Black / Rustfmt / Gofmt for the rest (slot #28)
4. 🔴 **Diff renderer for the Versions tab** — text-diff per language (slot #36)
5. 🔴 **GraphQL / Proto schema preview** — could be schema-aware; today: plain source
6. 🔴 **Starter templates** for the common kinds (`new.ts`, `new.py`, `Dockerfile`) (slot #51)

**Code touchpoints**
- `features/files/utils/file-types.ts`
- `features/files/components/core/FilePreview/previewers/CodePreview.tsx`
- `features/files/components/core/FileEditor/CloudFileInlineEditor.tsx` (`LANGUAGE_BY_EXT`)

---

> **Other types** (`audio`, `svg`, `text`, `data`, `spreadsheet`, `office`, `3d`, `archives`, `certs`) — see the matrix in Part 3 for current state, and § Priority recommendations at the end for the consolidated next-steps list. Promote any of these to a full Part 2 entry when it becomes a T1/T2 priority.

---

# Part 3 — Tab support matrix per file type

(Existing per-type scorecards — quick "what works in PreviewPane today" reference.)

---

## IMAGE

| Ext | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `jpg/jpeg, png, gif, webp, avif` | ✅* | ➖ | ✅ | 🔴 | ✅ | ✅ | ✅ | Zoom / rotate / fit / transparency grid via left rail in `SingleFileShell`. **In `PreviewPane` (side panel) it's still a passive `<img>` — the rail only mounts on `/files/f/{id}`.** |
| `heic, heif` | 🟡 | ➖ | ✅ | 🔴 | ✅ | ✅ | ✅ | Renders only on Safari natively — Chrome/Firefox hit the error fallback. Needs a server-side conversion. |
| `bmp, tif/tiff, ico` | 🟡 | ➖ | ✅ | 🔴 | ✅ | ✅ | ✅ | TIFF renders only on Safari. |
| `svg` | 🟡 | ✅ | ✅ | 🔴 | ✅ | ✅ | ✅ | Rendered/Source toggle ✅. **Source view is unstyled `<pre>`, no syntax highlighting.** Monaco edits as XML. |

\* On the dedicated `/files/f/{id}` route. Side-panel preview stays passive — promoting the rail into the side panel is a follow-up if we ever decide that surface deserves the extra column.

**Gaps:**
- **Side-panel image preview is still passive.** The control rail is `SingleFileShell`-only.
- **Click-and-drag pan is not implemented.** Overflow scroll handles wheel / trackpad pan when zoomed past 100%; pointer-drag pan is a follow-up.
- **No image analysis pipeline.** Image-specific detectors (EXIF, dominant colors, OCR, content-aware crop) are not surfaced in the Analysis tab today; that tab is PDF-centric.

---

## VIDEO

| Ext | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `mp4, mov, webm, m4v` | 🟡 | ➖ | ✅ | 🔴 | ✅ | ✅ | ✅ | Bare `<video controls>`. Streamed, no cap. |
| `mkv, avi` | 🟡 | ➖ | ✅ | 🔴 | ✅ | ✅ | ✅ | Will silently fail on Chrome — no "format unsupported" branch. |

**Gaps:**
- No playback-rate, AB-loop, captions/cue track wiring, PiP toggle, or scrub-thumbnail. **AudioPreview is fully featured — VideoPreview should match.**
- No fallback message when the codec isn't browser-supported.

---

## AUDIO

| Ext | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `mp3, wav, ogg, m4a, aac, flac, opus` | ✅ | ➖ | ✅ | 🔴 | ✅ | ✅ | ✅ | Custom player: play/pause, ±10s, loop, 0.5×–2× rate, volume, click-scrub timeline with buffered bar. |

**Gaps:**
- No waveform render (deliberate — bundle cost). Long-term: server-rendered waveform.
- No transcript / chapter / cue support.

---

## PDF

| Ext | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `pdf` | ✅ | 🔴 | ✅ | ✅ | ✅ | ✅ | ✅ | Best previewer in the system. Streamed via HTTP Range + Service Worker. |

**Preview-tab features:** zoom in/out, fit-page, fit-width, actual-size, rotate, prev/next + page counter, ResizeObserver-driven sizing, overlay slot for annotations.

**Gaps:**
- **No Edit tab content.** Shows "Coming soon" — PDF Extractor's edit components are not wired into the Edit tab yet.
- No in-toolbar text search (selection works via text layer, but no Cmd+F).
- No thumbnail strip / outline panel inside the renderer (Studio adds those).

---

## MARKDOWN

| Ext | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `md, markdown` | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ReactMarkdown + GFM + math (KaTeX) + Prism code blocks. Truncated at 1 MB. |
| `mdx` | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | Rendered as plain Markdown — **JSX components are NOT evaluated.** |

**Gaps:**
- MDX renders raw JSX tags in prose. Either drop MDX from `markdown` previewKind or wire a real MDX runtime.
- No outline / TOC sidebar.
- No print mode of its own.

---

## HTML & TEMPLATE

| Ext | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `html, htm` | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | ✅ | Sandboxed iframe (signed-URL `src`) with Rendered / Source toggle. Viewport picker (Auto / Phone / Tablet / Desktop) + Reload in `SingleFileShell`'s rail. Source view in `PreviewPane` falls back to a local toggle in the previewer header. Monaco edits as `html`. |
| `vue, svelte, astro` | 🟡 | 🟡 | ✅ | 🔴 | ✅ | ✅ | ✅ | Still routed through `CodePreview` (syntax-highlighted source). Rendering these would require a full SFC compiler, so source IS the right preview — but the marker is yellow because a "compiled placeholder" component view would be nice. |
| `hbs, handlebars, mustache, ejs, liquid, twig, jinja, j2, njk` | 🟡 | 🟡 | ✅ | 🔴 | ✅ | ✅ | ✅ | Template formats — rendering requires data binding, so source view is the design choice for now. |

**Sandbox policy for HTML:** `<iframe sandbox="allow-scripts allow-popups allow-forms">`. Scripts run (most saved web pages need them) but the iframe is **not** same-origin — it cannot read aimatrx.com cookies, localStorage, or hit our APIs. Top-frame navigation is blocked, so a hostile page cannot bounce the user off the app.

**Gaps:**
- Vue/Svelte/Astro could ship a "compiled-placeholder" view but that needs a SFC compiler bundle. Open question.
- Template files (`hbs`, `twig`, etc.) could surface a "Source / Rendered placeholder" toggle if we ever wire a tiny demo data binding.
- HTML signed-URL has a 1-hour TTL. Long-open viewer sessions will see the iframe go blank when the URL expires; we should re-mint silently on refocus.

---

## TEXT / LOG / DOCS-AS-TEXT

| Ext | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `txt, text, asc, me, log, out, err` | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | Plain `<pre>` truncated at 1 MB. No syntax highlighting, no line numbers, no wrap toggle, no find. |
| `rst, adoc, asciidoc, org` | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | Rendered as plain text — **no AsciiDoc/Org-mode/reST renderer.** |
| `srt, vtt` (subtitles) | 🟡 | ✅ | ✅ | 🔴 | ✅ | ✅ | ✅ | Rendered as plain text — no cue-timeline view. |
| `pem, csr` (PEM-armored cert) | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | ✅ | Text-as-text is the right call here. |
| `eml` (email) | 🟡 | ✅ | ✅ | 🔴 | ✅ | ✅ | ✅ | Raw RFC 822 source. **No parsed headers / HTML body / attachments view.** |
| README / LICENSE / CHANGELOG / TODO / NOTICE / AUTHORS / etc. (aliases) | 🟡 | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | Plain text. If the project ever needs Markdown-flavored READMEs, the alias should route to `markdown` instead. |

**Gaps:**
- No syntax highlighting in `TextPreview` (CodePreview has it).
- No encoding detection — Latin-1 / Windows-1252 / GBK render as `�`.
- No find-in-file, no line numbers, no wrap toggle.

---

## CODE

The full set: `js, mjs, cjs, jsx, ts, tsx, py, rb (+ Rakefile/Gemfile/Vagrantfile/Berksfile/Brewfile/Capfile/Guardfile/Podfile/Fastfile/Appfile/Deliverfile/Matchfile/Pluginfile/Snapfile/Scanfile/Gymfile), go, rs, java, swift, c, h, cpp, cc, cxx, hpp, cs, css, scss, less, styl, stylus, sh, bash, zsh, fish, ksh, ash (+ .bashrc/.zshrc/.profile/.env.*/etc.), sql, lua, pl, pm, r, R, rmd, dart, kt, kts, scala, sbt, clj, cljs, cljc, edn, ex, exs, erl, hrl, hs, lhs, ml, mli, fs, fsi, fsx, zig, nim, nims, jl, vue, svelte, astro, graphql, gql, graphqls, proto, sol, bat, cmd, ps1, psm1, psd1, php, phtml, phps, twig, jinja, j2, njk, hbs, handlebars, mustache, ejs, liquid, dockerfile, containerfile, mk, make, diff, patch, ini, cfg, conf, config, properties, prefs, tex, latex, ltx, sty, cls, bib, ttl, n3, nt, nq, trig, yaml, yml, toml`, plus aliases like `Dockerfile.*`, `Makefile.*`, `Procfile`, `Pipfile`, `Justfile`, `Earthfile`.

| Status | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `js, ts, jsx, tsx, py, rb, go, rs, java, c, cpp, cs, sh, html, css, scss, sql, xml, yaml, yml, toml(→ini), json, md, mdx, txt, svg` | 🟡 | ✅ | ✅ | 🔴 | ✅ | ✅ | ✅ | Prism in Preview, Monaco with proper language in Edit. |
| All other `code`-kind extensions above | 🟡 | 🟡 | ✅ | 🔴 | ✅ | ✅ | ✅ | Prism highlights in Preview (rich language map), but **Monaco opens them as `plaintext`** because `CloudFileInlineEditor.LANGUAGE_BY_EXT` is much smaller than the registry. |

**Gaps:**
- 🟡 **Editor language gap:** `php, lua, dart, kt, swift, scala, vue, svelte, astro, graphql, proto, sol, ps1, perl, r, dockerfile, makefile, diff, ini/cfg, less, styl, hbs, twig, ex/erl/hs/ml/fs/zig/nim/jl/clj`, and every dotfile alias open in Monaco without syntax highlighting. Fix: extend `LANGUAGE_BY_EXT`.
- 🟡 **Preview is "source only" everywhere.** `.diff/.patch` should get a split/unified diff viewer (React-Diff-Viewer exists in the codebase already). `.proto/.graphql` could get schema-aware tooling later.
- 🐛 **HTML preview** — see the HTML & Template section above.

---

## DATA

| Ext | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `json, jsonc, json5, har, geojson, topojson` (+ `.babelrc/.eslintrc/.prettierrc` aliases) | 🟡 | 🔴 | ✅ | 🔴 | ✅ | ✅ | ✅ | Tabular if array-of-objects, else pretty-print. **Edit tab is hidden** — `data` is not in `EDITABLE_KINDS`. |
| `csv, tsv` | 🟡 | 🔴 | ✅ | 🔴 | ✅ | ✅ | ✅ | PapaParse → sortable table + search + 25-row pagination. No inline edit. |
| `xml` | 🟡 | 🔴 | ✅ | 🔴 | ✅ | ✅ | ✅ | Renders as raw text — **no tree view, no pretty-print, no XSLT.** Edit hidden. |
| `ipynb` (Jupyter) | 🔴 | 🔴 | ✅ | 🔴 | ✅ | ✅ | ✅ | **Falls into DataPreview as JSON.** No cells + outputs renderer. The registry has a `NOTEBOOK` category but no `notebook` previewKind. |
| `sqlite, sqlite3, db` | 🔴 | 🔴 | ✅ | 🔴 | ✅ | ✅ | ✅ | `GenericPreview` — Download only. No browsable schema/query UI. |

**Gaps:**
- **`data` and `spreadsheet` are not in `EDITABLE_KINDS`** in `preview-actions.ts:48`. The Edit button is hidden even though Monaco knows `json` and CSV is trivially editable as text. Either add them to the set, or build dedicated grid editors for CSV/XLSX.
- **No notebook renderer** for `.ipynb`. Should ship cells + outputs (image / DataFrame HTML / matplotlib base64).
- **No XML tree view.**

---

## SPREADSHEET

| Ext | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `xlsx, xls` | ✅ | 🔴 | ✅ | 🔴 | ✅ | ✅ | ✅ | SheetJS → multi-sheet selector + sortable table + pagination. Streamed, no cap. |

**Gaps:**
- No inline edit (no grid editor). Edit tab shows "Coming soon."
- Large XLSX files do a full SheetJS load — no streaming parse.

---

## OFFICE — NOT PREVIEWABLE

| Ext | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `doc, docx` (Word) | 🔴 | 🔴 | ✅ | 🔴 | ✅ | ✅ | ✅ | `GenericPreview` — Download only. Needs `mammoth.js` (docx → HTML) or server-side render. |
| `ppt, pptx` (PowerPoint) | 🔴 | 🔴 | ✅ | 🔴 | ✅ | ✅ | ✅ | `GenericPreview` — Download only. Needs server-side slide render. |
| `epub` | 🔴 | 🔴 | ✅ | 🔴 | ✅ | ✅ | ✅ | `GenericPreview`. Needs an EPUB reader (`epub.js`). |

---

## 3D / CAD — NOT PREVIEWABLE

| Ext | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `glb, gltf` | 🔴 | 🔴 | ✅ | 🔴 | ✅ | ✅ | ✅ | `GenericPreview`. Needs Three.js + `@react-three/fiber` GLTF loader. |
| `stl, obj, fbx` | 🔴 | 🔴 | ✅ | 🔴 | ✅ | ✅ | ✅ | `GenericPreview`. Same renderer would cover all three with format-specific loaders. |

---

## CERTIFICATES / KEYS

| Ext | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `pem, csr` (PEM-armored) | ✅ | ✅ | ✅ | 🔴 | ✅ | ✅ | ✅ | Treated as text — correct. |
| `crt, cer, der, key, pub, p7b, p7c, pfx, p12` | 🔴 | 🔴 | ✅ | 🔴 | ✅ | ✅ | ✅ | `GenericPreview` — but binary viewer's byte sniff offers "View as text" when bytes are PEM-armored. No decoded-cert summary (subject/issuer/expiry). |

---

## ARCHIVES

| Ext | Preview | Edit | Document | Analysis | Share | Info | Versions | Notes |
|---|---|---|---|---|---|---|---|---|
| `zip, rar, 7z, tar, gz, tgz` | 🔴 | 🔴 | ➖ | 🔴 | ✅ | ✅ | ✅ | `GenericPreview` — Download only. No browse-tree of contained files. |

---

## Unknown / fallback

When the registry doesn't recognize a file:
- **Dotfile heuristic** (`getFileTypeDetails` → `dotfileLooksLikeText`): any filename starting with `.` followed by an alphanumeric char gets `ASSUMED_TEXT_DETAILS` → opens in `TextPreview` with the Edit tab enabled. Covers anonymous configs.
- **Everything else** → `UNKNOWN_DETAILS` → `GenericPreview` (Download only). Binary viewer's `sniffTextBytes` (UTF-8 / BOM / printability) escapes to "View as text" when the bytes are actually printable.

---

## Cross-cutting tabs

### Document
- ✅ for every real `cld_files` row regardless of file type (RAG pipeline is content-agnostic — extracts text from PDF/Word/HTML/Markdown/etc.).
- 🔴 for virtual-source files — see § Virtual sources.

### Analysis
- ✅ for PDFs — full detector grid (Overview, Outline, Text, PII, Tables, Images, Regions, Duplicates, Classify).
- 🔴 for everything else — the underlying detectors are PDF-specific today. Status shows `not_applicable`. Image / video / audio / data detectors don't exist yet.

### Share / Info / Versions
- ✅ uniform for every real file regardless of type.
- 🟡 for virtual-source files — Share is replaced by a stub ("handled by source"), Versions shows an empty state per adapter.

---

## Virtual sources

`file.source.kind === "virtual"` files come from adapters (Notes, Code Snippets, Agent Apps). Each adapter declares an `inlinePreview` component that mounts inside `FilePreview`, plus an optional `openInRoute` for the action bar.

- **Preview** — adapter's `inlinePreview` component (typically the adapter's own editor in compact mode).
- **Edit** — disabled with hint: "Editing handled in Preview".
- **Document** — works the same way (RAG can ingest any text content).
- **Analysis** — 🔴 (adapters don't surface PDF-like analysis).
- **Share** — replaced with adapter-managed-sharing stub.
- **Info** — works (less RAG metadata, but everything else).
- **Versions** — empty-state per adapter — each adapter owns its own version schema and they aren't wired into `cld_file_versions`.

---

## Cleanup items unrelated to file types

- **DEBUG_RING + DebugLayerLabel** still rendered in `FilePreview.tsx`, `PreviewPane.tsx`, `PdfPreview.tsx`, `GenericPreview.tsx` (the red/cyan/fuchsia rings + "DEBUG" labels). Comments say "Rip this out when done" — still in place.
- **Dead `disabledHint: "Edit handoff not wired yet"` branch** in `preview-actions.ts` — `FilePreview.tsx` always passes a non-null `onEdit`, so the hint never shows.

---

## Priority recommendations

Ordered by user impact:

1. ~~🐛 **HTML rendered preview**~~ ✅ **Shipped.** `HtmlPreview` previewer with sandboxed iframe + Rendered/Source toggle + viewport picker. `previewKind: "html"`. Side-panel falls back to a local toggle in the previewer header.
2. ~~**Image previewer overhaul**~~ ✅ **Shipped on `/files/f/{id}`.** Zoom (slider + ±, 10–800%), rotate (left/right), fit/actual toggle, transparency grid via the left rail. Click-and-drag pan still TODO (overflow scroll handles wheel/trackpad pan). Side panel kept passive — promoting controls into the side panel is a separate decision.
3. **Editor language map parity** — extend `CloudFileInlineEditor.LANGUAGE_BY_EXT` to cover every `previewKind: "code"` extension. Trivial change, large UX win.
4. **CSV / JSON / XML edit** — either add `data` to `EDITABLE_KINDS` for a quick text-edit win, or ship grid editors for CSV/XLSX.
5. **Office (`docx, pptx`) preview** — pick `mammoth.js` for docx text body, accept "no full fidelity" for now.
6. **Jupyter notebook renderer** — cells + outputs renderer for `.ipynb` (image / DataFrame HTML / base64).
7. **PDF Edit tab** — wire the PDF Extractor's edit surface into the Edit tab so users don't have to bounce to a separate route.
8. **Video previewer polish** — playback rate, AB-loop, caption track wiring, "format not supported" branch.
9. **Image / audio / video analysis detectors** — extend the file-analysis pipeline so Analysis isn't PDF-only.
10. **EML parsed view** — headers, HTML body sandbox, attachments list.
11. **Archive browse** — list contents of `zip/tar/gz` without download.
12. **3D model viewer** — Three.js `<Canvas>` with GLTF / STL / OBJ loaders.
13. **Sub-features** that are smaller but quality-of-life: TextPreview encoding detection, syntax highlighting, line numbers, find-in-file; `.diff` viewer; AsciiDoc / reST / Org-mode rendering; MDX runtime; XML tree view; PDF in-toolbar text search.
14. **Cleanup** — remove the DEBUG layer rings and the dead `disabledHint` branch.

---

## Where the registry lives — code-location quick map

| Capability | File / function |
|---|---|
| Extensions, MIME, category, icon, color, `previewKind`, thumbnail strategy | `features/files/utils/file-types.ts` → `FILE_TYPES`, `getFilePreviewProfile()`, `listSupportedTypes()` |
| Preview-tab dispatcher | `features/files/components/core/FilePreview/FilePreview.tsx` |
| Previewer implementations | `features/files/components/core/FilePreview/previewers/<Kind>Preview.tsx` |
| Edit-tab dispatcher | `features/files/components/surfaces/FileTabsBody.tsx` → `EditTabContent` |
| Monaco language map | `features/files/components/core/FileEditor/CloudFileInlineEditor.tsx` → `LANGUAGE_BY_EXT` |
| Action-bar buttons (Edit / Download / Open-in-feature …) | `features/files/components/core/FilePreview/preview-actions.ts` (`EDITABLE_KINDS`) |
| `SingleFileShell` rail dispatcher | `features/files/components/surfaces/single-file/FileViewerControlRail.tsx` |
| Rail-driven shared state | `features/files/components/surfaces/FileViewerControlsContext.tsx` |
| Per-mode rail panels | `features/files/components/surfaces/single-file/<Mode>Controls.tsx` |
| Side-panel viewer (compact) | `features/files/components/surfaces/PreviewPane.tsx` |
| Dedicated full-page viewer | `features/files/components/surfaces/single-file/SingleFileShell.tsx` |
| Inventory (this doc) + per-type wishlists | `features/files/components/surfaces/FILE_TYPE_INVENTORY.md` |
| Workflow skill (how to enhance) | `.cursor/skills/enhance-file-type/SKILL.md` |

Adding support for a new file type or upgrading an existing one is **typically a 1–4 file change** (registry + previewer + maybe Edit dispatch + maybe a rail panel). Bigger changes (new tab, new cross-cutting capability) hit the slots in Groups 5–9.
