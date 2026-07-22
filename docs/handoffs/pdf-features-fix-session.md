---
status: blocked
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

## Remaining work (the session's agenda — verify each WITH Arman, fix live)

1. Ask Arman to demonstrate each broken flow on the Studio, in his order — capture the exact failure (console, network, server response) per feature before fixing. Candidates from his "none working" report: draw-to-annotate, label picker, extract-at-bbox, region right-click actions (extract / promote / redact / delete), annotations panel, thumbnails/page jumps, redact flow, entities panel.
2. Server-side suspects live in aidream (extract/snap/promote endpoints) — if a failure is a 4xx/5xx from `server.app.matrxserver.com`, write the exact repro + hand Arman the prompt for the aidream agent rather than patching around it client-side.
3. Region resize/move after creation — likely wanted; `useAnnotations.update` + bbox is ready, the layer needs drag handles.
4. When flows work: update `features/pdf/FEATURE.md` gaps section, archive the review-queue row `2ea43c94-46fc-4c8a-877d-d1da3e85b44a`, and delete this doc.

## Done

- Region right-click menu built on v3 with the 4 backend actions (2026-07-21) — unverified by Arman; treat as suspect until the session proves it.
