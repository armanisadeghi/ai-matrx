# Sweep: ESLint Bypasses & Dead References (Phase 1 follow-up)

**Date:** 2026-05-13
**Branch:** `file-bypass-sweep` (off `main` at `2d70ae27f`)
**Triggered by:** discovery that `features/whatsapp-clone/ImageBubble.tsx` and `VideoBubble.tsx` survived the 41-site `<InlineMediaRef>` sweep solely because each carried an `// eslint-disable-next-line @next/next/no-img-element` above its `<img>`. The bypass IS the bug.

This sweep audits every comparable bypass / dead-reference category, migrates everything that can move to the canonical handler/`<InlineMediaRef>` without losing behavior, and produces a punch list of the rest.

---

## 1. Scope

Patterns hunted (ripgrep across the full tree, excluding `node_modules`, `.next`, `.claude/worktrees`, `dist`, `build`):

1. `// eslint-disable.*no-img-element` — bypasses of the canonical inline-render rule.
2. `// eslint-disable.*no-restricted-imports` — bypasses of the file-handler import ring-fence.
3. `// eslint-disable.*no-restricted-syntax` — bypasses of the `supabase.storage` ban.
4. `// @ts-ignore` / `// @ts-expect-error` in any file matching `image|file|upload|pdf|media|asset|thumb|preview` — hiding type drift near file handling.
5. Direct `<img src=` in `features/`, `app/`, `components/` outside `components/ui/**` design-system primitives.
6. Direct `supabase.storage.from(...)` outside `features/files/handler/**` and `features/files/**`.
7. Imports of long-deleted hooks (`useSignedUrl`, `useAiImageUrl`, `useFileUploadWithStorage`, `useGuardedFileUpload`, `usePasteImageUpload`, `resolveRenderableImageUrl`).
8. Imports from the abandoned `@/features/file-handler/...` path.

---

## 2. Headline counts (post-sweep)

| Pattern | Count |
|---|---|
| `eslint-disable @next/next/no-img-element` | 40 disables across 35 files |
| `eslint-disable no-restricted-imports` | **0** |
| `eslint-disable no-restricted-syntax` | **0** |
| `supabase.storage.from(...)` outside `features/files/**` | **0** |
| Live imports of `useSignedUrl`/`useAiImageUrl`/`useFileUploadWithStorage`/`useGuardedFileUpload`/`usePasteImageUpload`/`resolveRenderableImageUrl` | **0** |
| Live imports from `@/features/file-handler/...` | **0** |
| `@ts-ignore`/`@ts-expect-error` near file handling that hides real type drift | **0** (the lone hit, `webkitdirectory` on a folder-upload input, is a legitimate non-standard-attribute escape hatch) |

The ESLint ring-fence + deny-paths in `eslint.config.mjs` are doing their job; the remaining work is the 40 `no-img-element` disables, and those break into three clean buckets below.

---

## 3. Migrated this sweep (10 sites, 11 `<img>` removals)

Each site replaced a hand-rolled `<img src=...>` with `<InlineMediaRef ref={...} ... />` and dropped the eslint-disable directive. All are in the **prior 6-commit train** on this branch (`eba8a0e75` → `5ce7d4de0`) — the bypass-sweep work landed inside those commits even though the commit titles framed them as "external-import migration" passes. Listing them here so future agents can audit the actual content rather than guess from titles.

| # | File | Notes |
|---|---|---|
| 1 | `components/mardown-display/blocks/artifact/ArtifactBlock.tsx` (line 167) | `case "image"` rendered raw `<img src={content}>`. Replaced. |
| 2 | `components/matrx/Entity/prewired-components/entity-management/parts/EntitySelectVariants.tsx` (line 165) | Entity carousel option image — external URL. |
| 3 | `features/scraper/parts/ScrapedResultDetailTabs.tsx` (line 233) | `selected.mainImage` rendered raw. |
| 4 | `features/agents/components/notifications/ImageArrivalPeek.tsx` (line 172) | The AI-image arrival toast. The site already routed the URL through `useFileAs` for expiry-wheel refresh, so the leftover `<img>` was redundant. |
| 5 | `features/agents/components/messages-display/user/AgentUserMessage.tsx` (line 338) | `ImageBlockModal` body. |
| 6 | `features/rag/components/documents/panes/PdfPane.tsx` (line 55) | Page-image fallback when the source isn't a cld_files PDF. |
| 7 | `features/window-panels/windows/image/ImageViewerWindow.tsx` (line 365) | Thumbnail strip below the viewer. The main viewer (line 207) still uses `<img>` — see §4. |
| 8 | `app/(authenticated)/tests/oauth/components/SlackManager.tsx` (line 337) | Slack avatar render. |
| 9 | `features/workflows/results/registered-components/BraveSearchDisplay.tsx` (lines 579, 600, 639) | Three "no-onError" thumbnail/favicon sites. The other three sites in the file (lines 257, 375, 467) keep `<img>` because they attach an `onError` handler that hides the broken-image element — see §4. |
| 10 | `features/prompt-apps/components/PromptAppEditor.tsx` (line 1023) | App favicon preview in the editor. Prompt-apps is legacy (being replaced by agent-apps), but the bypass is still customer-visible until that migration ships. |
| 11 | `features/image-manager/components/ProfilePhotoTab.tsx` (line 73) | Current-avatar preview. Source is a `currentAvatar` URL string from Redux user metadata. |

**Typecheck result after migrations:** 4 pre-existing errors (the canonical baseline at `app/(dev)/demos/context-menu/lab/page.tsx:513`, `features/files/upload/cloudUpload.ts:540`, `features/page-extraction/services/run-from-draft.ts:116`, `features/pdf-extractor/studio/PdfStudioMobile.tsx:336`). **Zero new errors introduced.**

---

## 4. Punch list — remaining `<img>` sites grouped by reason

The 40 remaining `no-img-element` disables fall into three buckets. None is a bypass-for-its-own-sake; each has a concrete reason `<InlineMediaRef>` won't (yet) cover the case.

### 4a. Needs a feature gap to close in `<InlineMediaRef>` (high-value migration candidates)

These are real `<img>` sites where the only thing blocking migration is a missing prop on the canonical component. Listed by importer count so the gaps can be prioritized.

| Missing capability | `<InlineMediaRef>` gap | Importers that need it (filepath:line) |
|---|---|---|
| **`onError` callback** — caller wants to hide the element / fall back to a sibling when the URL 404s | Component swallows errors and shows its built-in `fallback="icon"|"skeleton"`; no escape hatch for caller logic | `features/agents/components/inputs/input-components/MediaVariableInput.tsx:214` (hides on error), `features/agents/components/builder/message-builders/AddBlockButton.tsx:596` (hides on error), `features/news/components/NewsFloatingWorkspace.tsx:179` (toggles `imgError` state), `features/workflows/results/registered-components/BraveSearchDisplay.tsx:257,375,467` (hides on error), `features/files/components/core/MediaThumbnail/MediaThumbnail.tsx:202` (sets local `errored` to show fallback), `features/files/components/core/FilePreview/previewers/ImagePreview.tsx:58` (sets local `errored`), `features/files/components/core/FilePreview/previewers/SvgPreview.tsx:111` (calls `onError` prop), `components/official/ImageAssetUploader.tsx:621` (hides on error) — **9 sites** |
| **`onLoad` callback** — caller measures the rendered image or fades it in once the bytes arrive | No `onLoad` exposed | `components/mardown-display/blocks/images/ImageOutputBlock.tsx:317` (fade-in transition), `features/image-studio/modes/annotate/AnnotateModeShell.tsx:220` (initializes the annotation canvas overlay) — **2 sites** |
| **`ref` forwarding** — caller needs imperative access to the `<img>` element (e.g. transform calculations, canvas snapshot) | No `forwardRef` wrapper | `features/image-studio/modes/annotate/AnnotateModeShell.tsx:221` (`imgRef` for coordinate translation) — **1 site** |
| **`crossOrigin` attribute** — needed for canvas-based pixel reads | Not exposed | `features/image-studio/modes/annotate/AnnotateModeShell.tsx:225` (canvas annotation requires `crossOrigin="anonymous"`) — **1 site** |
| **Inline `style` prop / arbitrary transforms** — for pan/zoom viewers and rotated PDF pages | Component owns its styles; caller can't inject a `transform: translate3d(...) scale(...)` per-frame | `features/window-panels/windows/image/ImageViewerWindow.tsx:206` (pan/zoom matrix), `features/file-analysis/studio/panels/PagesPanel.tsx:380` (per-page `rotate(...)`) — **2 sites** |

**Recommendation, priority-ranked:**

1. **Ship `onError` first** (9 importers, simple pass-through). Probably as `onError?: (event: SyntheticEvent<HTMLImageElement>) => void` that forwards from the underlying `<img>` and bails the next/image branch (or just always use `<img>` when `onError` is supplied — `next/image`'s own error story is busted on signed URLs anyway).
2. **Ship `onLoad` next** (2 importers, also pass-through). Same gating as `onError`.
3. **`forwardRef`** (1 importer). Lower priority — `AnnotateModeShell` is the only consumer and could keep its raw `<img>`.
4. **`crossOrigin`** (1 importer). Same as above.
5. **Transform/style escape hatch** (2 importers). Trickier — `<InlineMediaRef>` deliberately owns layout. The pan/zoom case is unlikely to ever fit cleanly; keep `<img>` there. The PDF-rotation case could move to an `as="img"` + inline-style prop if the gap closes.

### 4b. Genuine `<img>` cases (out of scope for migration)

These render content that is **not** a file in the `cld_files` sense — transient blob URLs, base64 data URLs from in-memory tools, layout-bypass decorative elements, design-system primitives. Routing them through `useFileSrc` / `<InlineMediaRef>` would force the universal handler to babysit a `data:` URL with no fileId and no expiry. Leave them alone.

| File | Reason |
|---|---|
| `app/(a)/podcast/PodcastGrid.tsx:31` | Blurred backdrop layer behind an `<InlineMediaRef>` sibling — comment explicitly notes "stays as plain img so it stays layout-agnostic". |
| `app/(dev)/demos/screen-capture/_components/FloatingCaptureDemo.tsx:117` | `result.dataUrl` — in-memory screen-capture blob URL. |
| `app/(dev)/demos/screen-capture/_components/ScreenCaptureDemo.tsx:26` | Same pattern. |
| `app/(public)/demos/local-tools/files/page.tsx:269`, `system/page.tsx:368,395`, `_lib/ResultPanel.tsx:50` | `data:${mediaType};base64,${base64}` from on-device tool results. |
| `components/ssr/RouteIndexPage.tsx:79`, `components/ssr/route-display/GroupedCardsDisplay.tsx:40,90` | Favicon `data:` URIs synthesized at build time. |
| `components/official/icons/IconResolver.tsx:530` | Static public SVG asset — design-system primitive. |
| `components/ui/file-upload/ImageUploadField.tsx:107` | Design-system primitive — does its own preview. |
| `features/window-panels/WindowTray/TrayChipPreview.tsx:148` | Data URL from a captured tray-chip screenshot. Comment confirms intent. |
| `features/image-studio/components/*` (CropPreview, StudioVariantTile, StudioFileCard, EmbeddedImageStudio ×4, Base64DecoderShell, CropStudioWindow) | Image Studio operates on in-memory `File` objects + `objectUrl` blob URLs **before** they hit cld_files. By design these are not files yet. |
| `features/file-analysis/**` (BboxPreview, ImagesContent, RepeatedRegionsContent, ThumbnailStrip, PagesPanel) | Base64 PNG bytes returned by the PDF page-analysis backend. Not registered files. |
| `features/pdf-demo/components/PdfBinaryResult.tsx:98`, `RegionOverlayPreview.tsx:249` | Demo binary previews — object URLs / Python-returned URLs that are demo-only artifacts. |
| `components/mardown-display/blocks/images/ImageOutputBlock.tsx:317,452` | See §4a — `onLoad` for fade-in, used by the lightbox modal in the same component. |
| `features/files/components/inline/InlineMediaRef.tsx:309` | The canonical implementation itself. Self-bypass. |
| `features/files/components/core/MediaThumbnail/MediaThumbnail.tsx:201`, `FilePreview/previewers/SvgPreview.tsx:110`, `FilePreview/previewers/ImagePreview.tsx:57` | Lower-level previewer primitives inside `features/files/**`. They sit underneath `<InlineMediaRef>` — calling it from inside would be circular. |

### 4c. Migrate-able, just not done yet (low priority — same pattern as §3, no behavioral risk)

Surfacing for completeness — these would migrate cleanly **once** §4a's `onError` gap closes (none of them need anything more):

- `features/agents/components/inputs/input-components/MediaVariableInput.tsx:214`
- `features/agents/components/builder/message-builders/AddBlockButton.tsx:596`
- `features/news/components/NewsFloatingWorkspace.tsx:179`
- `features/workflows/results/registered-components/BraveSearchDisplay.tsx:257`, `:375`, `:467`
- `components/official/ImageAssetUploader.tsx:621`

(`MediaThumbnail`, `ImagePreview`, `SvgPreview` are intentionally below the `<InlineMediaRef>` layer and don't migrate even when `onError` ships — they are what `<InlineMediaRef>` builds on.)

---

## 5. Dead-reference audit — clean slate

All four "stale import" categories return **zero live consumers** outside docs/comments and the ESLint deny-paths themselves:

- `useSignedUrl` — deleted in `6979ac7ab`. Deny-path live at `eslint.config.mjs:107-110`. No imports.
- `useAiImageUrl` — deleted in `905684c2f`. Deny-path live at `eslint.config.mjs:117-119`. No imports.
- `useFileUploadWithStorage` — deleted in `6ef28e3b1`. Deny-path live at `eslint.config.mjs:122-125`. No imports. (`components/ui/file-upload/FileUploadWithStorage.tsx` is a **component** of the same family; the **hook** is what was removed.)
- `useGuardedFileUpload` — deleted in `6ef28e3b1`. Deny-path live at `eslint.config.mjs:112-115`. No imports.
- `usePasteImageUpload` — deleted in `6ef28e3b1`. Deny-path live at `eslint.config.mjs:127-130`. No imports.
- `resolveRenderableImageUrl` — no occurrences anywhere except in commit-history docs.
- `resolveCloudFileUrl` (the **old** one, before the universal-handler delegation) — only the **new** wrapper at `components/image/cloud/resolveCloudFileUrl.ts` exists today, and it delegates to `fileHandler.use(...).as({kind:"html_src"})`. Not the stale shim.
- `@/features/file-handler/...` — **zero** live imports. The directory was folded into `features/files/handler/...` and the surface index re-exports the canonical APIs. All references that remain are inside doc files describing what was migrated.

The doc files (`docs/SWEEP_LEFTOVER_REFERENCES.md`, `features/files/UPLOAD_TROUBLESHOOTING.md`, `features/files/handler/FEATURE.md`, etc.) still mention the old paths in **prose**. That's intentional history for future agents; not a code dependency. Leave as-is unless an agent starts copy-pasting them as import statements.

---

## 6. `supabase.storage` audit

**Zero live `supabase.storage.from(...)` callsites** outside `features/files/handler/**` and `features/files/**`. The `no-restricted-syntax` rule in `eslint.config.mjs:152+` would catch any new ones. The pattern is fully contained.

---

## 7. Why this matters

The whole point of this sweep is that "harmless little eslint-disable" is exactly what kept `ImageBubble`/`VideoBubble` rendering through 41 other site migrations. Two more bypasses survive in the same way today (in `MediaVariableInput` and `AddBlockButton`), but both have a concrete reason: they need `onError` on `<InlineMediaRef>`. Once that prop ships, both — plus the six BraveSearchDisplay/NewsFloatingWorkspace/ImageAssetUploader sites — become 8 mechanical migrations. **Do not** add new `// eslint-disable-next-line @next/next/no-img-element` comments in the meantime; the deny-paths in eslint.config catch the imports, but the per-line disable defeats the whole rule.

---

## 8. Recommended next steps

1. **Extend `<InlineMediaRef>` props** (one PR, no behavior change for existing callers):
   - `onError?: (event: SyntheticEvent<HTMLImageElement>) => void`
   - `onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void`
   - Gating: when either is supplied, fall through to the `<img>` branch unconditionally (skip `next/image` so the handlers fire as authored).
2. **Migrate the 8 §4c sites** in a follow-up sweep titled "phase 1.s.2: clear `onError`-blocked `<img>` bypasses".
3. **Leave the §4b sites** as documented escape hatches. Tag each one with a comment explaining `why` so future sweepers don't re-flag them: e.g. `eslint-disable-next-line @next/next/no-img-element — data: URL, no file row`.
4. **Add a `no-new-eslint-disables` CI guard** (optional): a script that diffs the count of `eslint-disable.*no-img-element` between PR head and base; PRs that increase the count fail unless the disable line has a `-- <reason>` comment.

---

## 9. Change log

- **2026-05-13** — initial audit + 10-site migration round (this doc).
