---
status: blocked
updated: 2026-07-28
repos: [matrx-frontend, aidream]
vision: [features/pdf/FEATURE.md]
---

# PDF annotation features — focused fix session WITH Arman

Blocked on one thing only: Arman starting the session. Everything below is prep.

## Vision — Arman's words

> "These are some of the most important features but none of them are working correctly. We need
> to have a focused session to go through these and make them work but as it is, it's a mess. I
> want an agent to go through this with me in detail and fix all of these pdf features that don't
> work." — 2026-07-22, `agent.review_queue` feedback on the region menu (row
> `2ea43c94-46fc-4c8a-877d-d1da3e85b44a`, still `pending` as of 2026-07-28).

The agent running this works **interactively with Arman**, feature by feature, fixing each live.

## Resources

- **Test surface:** `/files/f/[fileId]` → Edit tab (`PdfEditTab`) and `/files/f/[fileId]/studio`
  (Analysis Studio, PDF-only). Login `/login`, admin@admin.com / Password1234#.
  Fallback bench `/demos/pdf-processing/components` mounts the same production components
  (StudioShell is not in the bench).
- **Test file:** Bio-Chapter-9.pdf `7e59da76-0548-4f4f-b645-10bb391d48fc` — Canva/PowerPoint-style
  slides with outlined title text, which is what triggers the glyph-duplication bug.
- **The stack:** layer `features/pdf/components/viewer/annotation-layer/PdfAnnotationLayer.tsx`
  (draw/select/coordinate-mapping — solid) · canvas
  `features/file-analysis/components/AnnotatablePdfCanvas.tsx` (draw → snapBbox → extractAtBbox →
  LabelPicker → create) · hooks `features/file-analysis/hooks/useAnnotations.ts` (shared cache +
  realtime on `files.page_annotations`) · API `features/file-analysis/api/file-analysis.ts` (all
  CRUD points at aidream) · colors
  `features/pdf/components/viewer/annotation-layer/colors.ts` · menu
  `features/file-analysis/components/RegionContextMenu.tsx`.
- **Server:** `aidream/services/file_annotations/service.py` +
  `packages/matrx-files/matrx_files/specific_handlers/pdf/extract/{bbox,region}.py`.
- **Docs:** `features/pdf/FEATURE.md` (canonical parts table; its "Known gaps" section predates
  the region menu). There is still **no** `features/file-analysis/FEATURE.md` — creating one during
  the session is in scope.
- **Archaeology:** the annotation build was abandoned mid-flight on 2026-05-11 — the region menu,
  promote-to-entity, and regions/extract had NO callers until 2026-07-21. `PdfAnnotationLayer`'s
  `onRegionContextMenu` prop is intentionally unused (v3 delegates via `data-region-id`).

## Environment traps (the session's biggest time sink)

- Routes cold-compile 3-9 min on this machine; the dev server OOM-crashed ~4× under compile load.
  **Run exactly ONE server**, and pre-warm each route with a background `curl` BEFORE driving the
  UI so no compile happens under interactive load. `curl localhost:3001` before trusting a stuck pane.
- A corrupted `.next-preview` caused a 1s reload loop on every `/files/*` load — `pnpm clean:next`.
- aidream calls are cross-origin so they do **not** appear in the browser network panel — verify
  server results against `files.page_annotations` or the rendered preview.
- The embedded browser cannot reliably pop a Radix context menu on a nested region div. Region-menu
  open needs a **human** right-click to final-verify.

## Remaining work

1. **Fix the four confirmed bugs first** (all re-verified still open 2026-07-28; no `features/pdf`
   or `features/file-analysis` fix has landed since 2026-07-22):
   - **Text extraction duplicates glyphs.** Drawing over "CHAPTER 9" stored
     `extracted_text = "CHAPTERCHAPTER 99"`. Canva/PPT exports draw each glyph twice (outline +
     fill) and the bbox extractor reads both. **Server-side fix** — dedup overlapping glyph runs in
     `packages/matrx-files/matrx_files/specific_handlers/pdf/extract/bbox.py`; there is no dedup
     logic there today. Write the aidream work order, do not patch client-side.
   - **Region overlay is nearly invisible.** `colors.ts:18` — `structure` is a 1px slate stroke +
     12% slate fill, unreadable over content. Needs a stronger default or a per-category
     high-contrast palette.
   - **Label picker popover clips at the viewport bottom.** Anchored at window-center; on short
     viewports the Save button and list get cut off. Anchor near the drawn rect and flip on overflow.
   - **Thumbnails show `p1/p2/p3` text placeholders** for several seconds, sometimes permanently,
     instead of rendered page images — `features/file-analysis/studio/ThumbnailStrip.tsx`.
2. **Still UNVERIFIED — test WITH Arman:** Redact panel + redact flow, Doc Ops, Pages ops, Findings,
   Search, promote-to-entity result, Analysis tab entities/PII/tables panels, page-jump from
   thumbnails, and a human right-click on the region menu.
3. **Region resize/move after creation — no UI at all.** `useAnnotations.update` + bbox are ready;
   `PdfAnnotationLayer` needs drag handles.
4. **When the flows work:** update the `features/pdf/FEATURE.md` gaps section, create
   `features/file-analysis/FEATURE.md`, archive review-queue row
   `2ea43c94-46fc-4c8a-877d-d1da3e85b44a`, delete this doc.

## Done

- Region right-click menu was one click behind — fixed with
  `flushSync(() => setActiveRegion(region))` in `RegionContextMenu.tsx:218` (state committed before
  the v3 menu reads it). **Still needs a human right-click to final-verify.**
- `/files/all` infinite redirect loop — self-heal guard in `app/(core)/files/[...path]/page.tsx`
  strips accumulated `all` prefixes. Whether prod ever hit it is unconfirmed.
- Draw-to-annotate → snap-bbox → extract-at-bbox → label picker → Save → persist → renders on page
  + Notes panel + green thumbnail badge: full round-trip confirmed against the DB. This contradicts
  "nothing works" — the core loop is solid; the four bugs above are what make it feel broken.
