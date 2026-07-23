---
status: active
updated: 2026-07-22
repos: [matrx-frontend]
vision: [features/pdf/FEATURE.md]
---

# PDF features — focused fix session WITH Arman

## Vision — Arman's words

- 2026-07-22 (agent.review_queue feedback on the region menu): "These are some of the most important features but none of them are working correctly. We need to have a focused session to go through these and make them work but as it is, it's a mess. I want an agent to go through this with me in detail and fix all of these pdf features that don't work."

This doc is the PREP for that session — the agent running it works interactively with Arman, feature by feature, fixing each one live. Status `blocked` = waiting on Arman to start the session, nothing else.

## Resources

- Where to test (with Arman driving): `/files/f/[fileId]/studio` (Analysis Studio, PDF-only) and `/files/f/[id]` → Edit tab (`PdfEditTab`). Login `/login` admin@admin.com / Password1234#.
- The stack: layer `features/pdf/components/viewer/annotation-layer/PdfAnnotationLayer.tsx` (draw/select/coordinate-mapping — reportedly solid); canvas `features/file-analysis/components/AnnotatablePdfCanvas.tsx` (draw → snapBbox + extractAtBbox → LabelPicker → create); hooks `features/file-analysis/hooks/useAnnotations.ts` (shared cache + realtime on `files.page_annotations`); API `features/file-analysis/api/file-analysis.ts` (annotations CRUD, extract-at-bbox, snap-bbox, promote-to-entity, regions/extract, entities, manifest, label-catalog — all point at aidream).
- NEW and never user-verified: `features/file-analysis/components/RegionContextMenu.tsx` — right-click a drawn region → v3 menu with Extract text / Promote to entity / Redact toggle / Delete (wired 2026-07-21 into StudioShell + PdfEditTab).
- Archaeology (2026-07-21): the annotation build was abandoned mid-flight on 2026-05-11 — the region menu + promote-to-entity + regions/extract had NO callers until now; region resize/move after creation still has NO UI (`useAnnotations.update` exists, nothing calls it with a bbox); `PdfAnnotationLayer`'s `onRegionContextMenu` prop is now intentionally unused (v3 delegation via `data-region-id` instead).
- Docs: `features/pdf/FEATURE.md` (canonical parts table; its "Known gaps" section predates the region menu). There is NO features/file-analysis/FEATURE.md — creating one during the session would be in-scope.

## Session state (2026-07-22, in flight)

- Test surface: real UI on `/files/f/[fileId]` → Edit tab (`PdfEditTab`). Bench `/demos/pdf-processing/components` mounts the same production components (verified) as fallback; StudioShell not in the bench.
- Test file: Bio-Chapter-9.pdf `7e59da76-0548-4f4f-b645-10bb391d48fc` (admin@admin.com). Canva/PowerPoint-style slides with outlined title text — relevant to the text-dup bug below.
- Backend: prod aidream healthy; NEXT_PUBLIC_BACKEND_URL → server.app.matrxserver.com. aidream network calls are cross-origin so they DON'T appear in the browser network panel — verify server results via the DB (`files.page_annotations`) or the rendered preview instead.
- **Dev-env hazards (the session's biggest time sink):** routes cold-compile 3-9 min on this low-RAM machine; the dev server OOM-crashed ~4× under compile load and once left a corrupted `.next-preview` (caused a 1s reload loop on every `/files/*` load — fixed by `pnpm clean:next`). RULE: exactly ONE server (the box crashes with two); pre-warm each route via background `curl` BEFORE driving the UI so no compile happens under interactive load; `curl localhost:3001` before trusting a stuck pane.
- **Verified WORKING** (contradicts "nothing works" — these are solid): draw-to-annotate → snap-bbox → extract-at-bbox → label picker (category chips + search + custom) → Save → persist → renders on page + Notes panel + green thumbnail badge. Full round-trip confirmed against the DB.
- **Automation limit:** the embedded browser can't reliably pop a Radix context menu on a nested region div — region-menu open needs a HUMAN right-click to final-verify.

## Remaining work (the session's agenda — verify each WITH Arman, fix live)

1. **Confirmed bugs still open (fix these first):**
   - **Text extraction duplicates glyphs.** Drawing over "CHAPTER 9" stored `extracted_text = "CHAPTERCHAPTER 99"` in `files.page_annotations`. Almost certainly aidream extract-at-bbox reading an outlined/shadowed text layer twice (Canva/PPT export draws each glyph 2×). Server-side fix (dedup overlapping glyph runs) — write the aidream prompt, don't patch client-side.
   - **Region overlay is nearly invisible.** The `structure` category renders a 1px slate border + 12% slate fill — unreadable over content. Needs stronger default stroke/fill or a per-category high-contrast palette (`features/pdf/components/viewer/annotation-layer/colors.ts`).
   - **Label picker popover clips at viewport bottom.** Anchored at window-center but renders low; on shorter viewports the Save button/list get cut off. Anchor near the drawn rect + flip when it would overflow.
   - **Thumbnails show `p1/p2/p3` text placeholders** for several seconds (sometimes persist) instead of rendered page images (`features/file-analysis/studio/ThumbnailStrip.tsx`).
2. Still UNVERIFIED (test next, WITH Arman): Redact panel + redact flow, Doc Ops, Pages ops, Findings, Search, promote-to-entity result, Analysis tab entities/PII/tables panels, page-jump from thumbnails.
3. Region resize/move after creation — no UI yet; `useAnnotations.update` + bbox ready, layer needs drag handles.
4. When flows work: update `features/pdf/FEATURE.md` gaps section, archive review-queue row `2ea43c94-46fc-4c8a-877d-d1da3e85b44a`, delete this doc.

## Done

- **Region right-click menu was one click behind — FIXED** (`RegionContextMenu.tsx`). The "Region — <label>" section (Extract text / Promote / Redact / Delete) was absent on the FIRST right-click of any region and only appeared on the 2nd — this is why the menu looked dead. Cause: `extraSections` derived from `activeRegion` state set inside `resolveContextOnOpen`, which the v3 menu reads in the same render tick → always stale by one open. Fix: `flushSync(() => setActiveRegion(region))` so the state commits before the menu renders. Safe — every `resolveContextOnOpen` call site in `ContextMenuV3` is an event handler, never render/effect. NEEDS human right-click to final-verify (automation can't pop Radix on nested divs).
- `/files/all` infinite redirect loop (`/files/all/all/all/…`, files list unusable in dev) — self-heal guard added to legacy catch-all `app/(core)/files/[...path]/page.tsx` (strips `all` prefixes, routes static-section heads back to canonical). Also root-caused to a corrupted `.next-preview` cache; `pnpm clean:next` clears it. Verify whether prod ever hit it.
