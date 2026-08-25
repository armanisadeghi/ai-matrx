# Knowledge Library UI — local mechanics

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/knowledge/rag/STATE.md — read it before touching this feature in ANY repo.

What the Library is, what it is for, and where it sits in the product live there. Feature-wide
layout and conventions are in [`features/rag/FEATURE.md`](../../FEATURE.md). This file is only the
directory's own traps and file map.

## Gotchas that have bitten

- **Do not call `useLibrary` more than once in the same component** — derive `pollMs` from a state
  flag updated post-fetch (the `hasNonTerminalDocs` pattern in `LibraryPage`).
- **Deep-linking via `?doc_id=<uuid>` is intentionally one-shot** — selection is *not* mirrored
  back to the URL, or App Router's `router.replace` loops forever.
- **Import `motion/react`, never `framer-motion` directly.**
- **Never animate to/from `currentColor`** — `motion/react` cannot tween it and logs
  `value-not-animatable` every frame. Stack an opacity overlay instead (`<CountUp/>` in
  `AnimatedKpiCard.tsx`).
- **Don't open the standalone sheet for a job whose doc is already selected.**
  `LibraryPage.handleRequestStageRun` checks `selectedDocId` and skips `setSheetOpen(true)`; the
  inline `<ProcessingJobView/>` in the Stages tab covers it. Otherwise two sheets stack.
- The `useEffect` watching `runner.jobs` relies on the runner emitting a new array reference only
  when state actually changes; the terminal-count ref guard stops `refreshKey` bumping on every
  progress frame.
- **`MatrxDynamicPanel` limits `user-select: none` to its resize handle — never reapply it to the
  panel group or content body.** Every detail tab's text must stay selectable.
- **`ProcessingProgressDialog.tsx` is legacy**, retained only for `IngestProgressDialog` / the
  Files surface. **Do not extend it.**
- Terminal jobs stay in `jobs[]` until dismissed and `stagePreviews[stageId]` is never overwritten
  when the next stage starts — the streamed text must stay inspectable. Don't "clean up" either.
- Sheet width is locked to `min(100vw, 900px)` to match `LibraryDocDetailSheet`; changing one
  without the other reintroduces the width jump.
- Polling is 4s while a job runs or a doc is non-terminal, paused on a hidden tab (Page Visibility
  API), off when everything is terminal.
- UUIDs render with `MatrxUuidCell`; referenced cloud files must offer BOTH the File Preview window
  and a real `/files/f/<id>` new tab.

## Files

Paths relative to `features/rag/`.

| File | Role |
| --- | --- |
| `components/library/LibraryPage.tsx` | Top-level page; consumes everything below. |
| `components/library/ProcessingJobView.tsx` | Reusable rich live-job visualization (both surfaces). |
| `components/library/StageAnimations.tsx` | Per-stage animated heroes + `STAGE_META`. |
| `components/library/ProcessingProgressSheet.tsx` | Right-side multi-job sheet. |
| `components/library/ActiveJobsStrip.tsx` | Inline strip of running jobs. |
| `components/library/AnimatedKpiCard.tsx` | Animated rollup tile. |
| `components/library/StatusBadge.tsx` · `StageStatusPills.tsx` | Status pill · stage pills. |
| `components/library/LibraryDocDetailSheet.tsx` | Per-doc drilldown; renders `<ProcessingJobView/>` inline in Stages. |
| `components/library/LibraryPreviewPage.tsx` | Full-screen single-doc preview. |
| `components/library/KnowledgeAssetPanel.tsx` · `knowledgeAssetStatus.ts` | Derivation rollup + Build/Resume/Rebuild resolver. |
| `components/library/QuickSearchDialog.tsx` | Search-inside-doc dialog. |
| `components/library/IngestProgressDialog.tsx` | Files-side ingest dialog (`useFileIngest`). |
| `hooks/useProcessingRunner.ts` · `useLibrary.ts` · `useStagesStatus.ts` · `useStageAction.ts` | Multi-job runner · list+summary · per-doc stage status · single-stage stream. |
| `api/stages.ts` · `types/library.ts` | Streaming stage client · wire types. |
