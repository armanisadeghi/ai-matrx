# RAG Document Library (`/rag/library`)

The visibility surface for processed documents — every `processed_documents`
row owned by the caller, with derived counts and status. The page is the
"where did my content go?" answer for RAG ingestion.

> **Note (2026-05-06)**: this area used to live at `features/library/`; it
> was consolidated into the new `features/rag/` feature. Components moved
> into `features/rag/components/library/`; hooks, api clients, and types
> were hoisted to siblings (`features/rag/hooks/`, `features/rag/api/`,
> `features/rag/types/library.ts`). See [`features/rag/README.md`](../../README.md)
> for the master layout.

## Layout

```
LibraryPage
├── Header (sticky)
│   ├── Title + actions (Upload & process / Jobs / Refresh / Data Stores)
│   ├── Animated KPI rollup ─ AnimatedKpiCard ×7
│   ├── Inline live strip   ─ ActiveJobsStrip
│   └── Filters             ─ search input + animated status pills
├── Document table          ─ unchanged shape; per-row status badge,
│                             pages/chunks/embeddings counts, actions
└── Off-canvas surfaces
    ├── ProcessingProgressSheet  (right side, multi-job)
    ├── LibraryDocDetailSheet    (right side, per-document drilldown)
    └── QuickSearchDialog
```

## Multi-job processing

`useProcessingRunner` tracks any number of concurrent processing jobs
(`stage` runs and full `pipeline` runs). Each job is a `ProcessingJob`
with its own AbortController, streaming frame, persisted per-stage
preview, accumulated stage results, terminal status, and error.

Jobs are appended to `jobs[]` and stay there after they reach a
terminal state (`succeeded` / `failed` / `cancelled`) until explicitly
dismissed — so the user can always look back at what just happened
*including* the streamed text the stages produced.

```ts
const runner = useProcessingRunner();

// Start a stage run (returns the new jobId so the caller can focus the sheet).
const jobId = await runner.runStage(processedDocId, "embed", "MyDoc.pdf");

// Or start the legacy /rag/ingest/stream pipeline against a cld_file.
const jobId = await runner.runForCldFile(cldFileId, fileName, subtitle);

runner.cancel(jobId);    // abort one stream
runner.cancelAll();      // abort every running stream
runner.dismiss(jobId);   // remove a terminal job from the list
runner.dismissAll();     // clear all terminal jobs (running ones stay)
```

### What the runner persists per job

- **`frame`** — latest live progress frame (`activeStage`, `message`,
  `fraction`, `current`, `total`, `lastUpdate`, `latestPreview`).
- **`stagePreviews[stageId]`** — the most recent preview emitted by
  *that* stage. NOT overwritten when the next stage starts. The sheet
  renders these as a column of "stage outputs" cards that stay visible
  for the entire run and after it completes.
- **`byStage[stageId]`** — per-stage one-line result summary.
- **`result`** — final summary on success (used by the green "Done"
  card with the "Open in Library" deep-link).
- **`error`** — error string on failure.

## ProcessingJobView (the rich live visualization)

`<ProcessingJobView/>` is the single, reusable, large-format processing
visualization rendered both:

1. Inline inside `<ProcessingProgressSheet/>` (standalone right-side sheet
   for upload-from-header flows or jobs whose source doc isn't currently
   open in the detail sheet).
2. Inline inside `<LibraryDocDetailSheet/>`'s **Stages tab** when there's
   an active or recently-finished job for the currently-selected doc.

The two surfaces are visually identical — they pass the same
`ProcessingJob` to the same component and the layout fills the available
width. This is intentional: when the user triggers a stage from inside
the detail sheet, the job renders **in the same sheet** instead of
opening a second sheet at a different width (which previously caused a
jarring visual jump).

Layout (top to bottom):

```
┌──────────────────────────────────────────────────────────────┐
│ Stepper (4 stage cells, animated active ring)                │
├────────────────────────────┬─────────────────────────────────┤
│ <StageHero/> animation     │ <LiveOutputPanel/> live preview │
│   - unique per stage:      │   - large scrolling text panel  │
│     · Extract = page scan  │   - char counter + section pill │
│     · Clean   = wand polish│   - shimmer progress at bottom  │
│     · Chunk   = doc slicer │                                 │
│     · Embed   = vector grid│                                 │
├────────────────────────────┴─────────────────────────────────┤
│ MetricsRail (Elapsed · items/sec · ETA · Stage)              │
├──────────────────────────────────────────────────────────────┤
│ Persisted stage outputs (collapsible accordion of finished   │
│ stages — never disappears)                                   │
├──────────────────────────────────────────────────────────────┤
│ Result / Error panel (terminal states only)                  │
├──────────────────────────────────────────────────────────────┤
│ Actions (cancel / dismiss)                                   │
└──────────────────────────────────────────────────────────────┘
```

`compact` prop tightens the metrics rail to two cells (used inside the
multi-job stack in the standalone sheet).

## StageAnimations — unique per-stage hero visuals

Replaces the "everything is a spinner" pattern. Each stage gets its own
animated panel that *represents the actual work*:

- **Extract** — a stack of pages with a sweeping scan bar over the top
  page; stage label, page counter, and most-recently-extracted text are
  composited on top.
- **Clean** — raw text on the left, cleaned text on the right, an
  animated wand traveling between them with a sparkle trail; the cleaned
  panel shimmers as it's polished.
- **Chunk** — a long document strip with horizontal "knife" slices
  sweeping down; chunks (with token counts) fly out and stack to the
  side as each cut completes.
- **Embed** — a 18×7 grid of dots that light up wave-by-wave as
  embeddings stream in; a "vector packet" zooms across the panel.

A `<Heartbeat/>` pip in the bottom-right turns amber if the server hasn't
emitted an update in >10s — confirms the stream is alive without showing
a generic spinner.

## ProcessingProgressSheet (standalone)

Right-side `Sheet` locked to **`min(100vw, 900px)`** — same width as
`LibraryDocDetailSheet` so transitions between the two never visually
jump. Replaces the legacy full-screen `ProcessingProgressDialog` for the
library surface (the dialog is still used by `features/files/.../DocumentTab.tsx`).

- **Single-job mode**: full-bleed `<ProcessingJobView/>` with the doc
  name in the sheet header.
- **Multi-job mode**: vertical stack of compact cards. Each card has a
  header strip (always visible) and expands to render
  `<ProcessingJobView compact/>` when focused.
- Smooth `motion/react` animations on add / remove / expand / status
  transitions.

## ActiveJobsStrip

Inline horizontal-grid strip rendered in the page header between the
KPI grid and the filters. Compact "live job" chip per job (filename,
stage chip, mini animated progress bar, percent, stop/dismiss). Click
opens the sheet focused on that job. Doesn't touch or restyle the
document table.

Recently-completed jobs linger 8 seconds in the strip then auto-dismiss;
failed jobs stay until the user dismisses them.

## Live polling

`useLibrary({ pollMs })` and `useLibrarySummary({ pollMs })` accept a
poll cadence. Polling is paused when the tab is hidden (Page Visibility
API) and re-fires immediately on resume. The `LibraryPage` enables
polling at **4 seconds** when:

- any `runner.jobs` entry is `running`, OR
- any visible doc has a non-terminal status
  (`embedding` / `chunking` / `extracted` / `pending`).

Polling auto-disables once everything is in a terminal state, so an
idle library page is silent.

A small "Live" pill next to the page title indicates polling is on.

## Animated KPI cards (`AnimatedKpiCard`)

- Count-up tween (~600ms cubic-out) when the value changes.
- Brief emerald flash when the value increases — great signal during
  live polling: "Embedding count just bumped."
- Tone-coloured glow blob in the corner.
- Skeleton on first load.

## Row pulse

When auto-poll discovers a doc whose `status` changed (e.g.
`embedding → ready`), the `LibraryPage` flags that row id in a
`pulsedRows` set; `DocRow` renders a fading emerald wash via
`AnimatePresence` for ~1.6 seconds so the user notices the transition.

## Document detail interaction contract

- Text in every detail tab is selectable. The shared `MatrxDynamicPanel`
  limits `user-select: none` to its resize handle; never reapply it to the
  panel group or content body.
- The header copies either a readable document summary or the complete
  XML-ish `Copy for AI` payload. Page text and segment bodies provide the same
  pair at their own scope.
- UUIDs render with `MatrxUuidCell`: shortened head/tail, full value on hover,
  and an adjacent full-ID copy action.
- Referenced cloud files provide both navigation paths: File Preview window
  for in-app continuity and a real `/files/f/<id>` new-tab link. Right-clicking
  the source identity opens the shared file actions menu.

## Files

Paths are relative to `features/rag/`.

| File | Role |
| --- | --- |
| `components/library/LibraryPage.tsx` | Top-level page; consumes everything below. |
| `components/library/ProcessingJobView.tsx` | Reusable rich live-job visualization (used by both surfaces). |
| `components/library/StageAnimations.tsx` | Per-stage animated heroes + stage metadata (`STAGE_META`). |
| `components/library/ProcessingProgressSheet.tsx` | Right-side multi-job sheet (900px wide). |
| `components/library/ActiveJobsStrip.tsx` | Inline strip of running jobs. |
| `components/library/AnimatedKpiCard.tsx` | Animated rollup tile (count-up + tone). |
| `components/library/StatusBadge.tsx` | Status pill (unchanged). |
| `components/library/StageStatusPills.tsx` | 6-stage pills used in `LibraryDocDetailSheet`. |
| `components/library/LibraryDocDetailSheet.tsx` | Per-doc drilldown sheet; renders `<ProcessingJobView/>` inline in its Stages tab when there's an active job for the open doc. |
| `components/library/LibraryPreviewPage.tsx` | Full-screen single-doc preview at `/rag/library/[id]/preview` and `/rag/viewer/[id]`. |
| `components/library/QuickSearchDialog.tsx` | Search-inside-doc dialog. |
| `components/library/ProcessingProgressDialog.tsx` | **Legacy** full-screen dialog. Retained for `IngestProgressDialog` / Files surface. Do not extend. |
| `components/library/IngestProgressDialog.tsx` | Files-side ingest dialog (uses `useFileIngest` from the rag feature). |
| `hooks/useProcessingRunner.ts` | Multi-job streaming runner. |
| `hooks/useLibrary.ts` | List + summary fetch with optional polling. |
| `hooks/useStagesStatus.ts` | Per-doc 6-stage status (used by detail sheet pills). |
| `hooks/useStageAction.ts` | Single-stage stream consumer for the inline pill popover. |
| `api/stages.ts` | Streaming client for `/rag/library/{id}/{stage}` and `/rag/library/{id}/stages`. |
| `types/library.ts` | `LibraryDocSummary`, `LibraryDocDetail`, `LibrarySummary`, `DocStatus`. |

## Conventions / gotchas

- **Do not** call `useLibrary` more than once in the same component —
  derive `pollMs` from a state flag updated post-fetch (see the
  `hasNonTerminalDocs` pattern in `LibraryPage`).
- The `useEffect` watching `runner.jobs` for terminal-count changes
  relies on the runner only emitting new array references when state
  actually changes. The terminal-count ref guard prevents redundant
  `refreshKey` bumps on every progress frame.
- Deep-linking via `?doc_id=<uuid>` is intentionally one-shot — selection
  is *not* mirrored back to the URL to avoid an App Router
  `router.replace` infinite loop.
- `framer-motion` is imported as `motion/react` (the new package name);
  do not pull `framer-motion` directly.
- **Don't open the standalone sheet for jobs whose doc is currently
  selected.** `LibraryPage.handleRequestStageRun` checks `selectedDocId`
  and skips `setSheetOpen(true)` when the job's doc is already open in
  `<LibraryDocDetailSheet/>` — the inline `<ProcessingJobView/>` in the
  Stages tab covers it. Otherwise the user sees two sheets stacked.
- **Don't animate to/from `currentColor`.** `motion/react` can't tween it
  (logs a `value-not-animatable` warning every frame). Use a stacked
  overlay layer with opacity instead — see `<CountUp/>` in
  `AnimatedKpiCard.tsx`.
