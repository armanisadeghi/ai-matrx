# Diff System — Rollout Handoff

**Pick up here.** The shared diff system (`components/diff/`) is solid and
widely adopted. This is the remaining backlog + how to continue. Full state +
change log: [`FEATURE.md`](./FEATURE.md). Compare everything live:
**`/demos/diff-gallery`**. Playground: **`/demos/diff`**.

## State (done)

- **Core:** `DiffViewer` (light/Monaco/auto; split/inline/highlight), `DiffReview`
  (per-hunk pending/applied/rejected merge tool), `InlineTextDiff` (compact),
  `CodeDiff` (Monaco, one `next/dynamic`), `AnimatedDiffReveal`, `DiffBlock`
  (markdown ` ```diff `). Shared colors `text/diffColors.ts`; merge engine
  `text/engine/hunks.ts`.
- **Solidity:** the 8 audit bugs are fixed (engine round-trip incl.
  `ignoreTrailingWhitespace`, OOM size-guards, DiffReview state resets, nav,
  Monaco wrap). Engine invariants covered by `scratchpad/test-engine.mjs`
  (run: `node_modules/.bin/tsx <path>` — 47 assertions). Large files: fold +
  Prev/Next + compute-once.
- **Adopted (~25 surfaces):** clipboard compare; Quick Save Note/Code overwrite;
  RAG raw↔cleaned ×3; transcript CleanupPad + segment rows; SystemPromptOptimizer;
  Context/Artifact/AgentApp version compare; ContextItemForm; TemplateEditor;
  EpisodeContentStudio; NoteConflictWindow (canonical diff + Merge tab); Notes
  Cleanup review (Full-diff toggle); SettingsJsonEditor; ProTextarea AI-action;
  ChangeDiff approval cards. Replaced weak diffs (code-editor DiffView A4/A5,
  RawJsonView, research VersionDiff, CodePreviewCanvas, DiffCanvas) + killed
  `react-diff-viewer-continued`. Admin `LegacyDiffChip` on the coupled renderers.

## Remaining rollout (adversarially verified; loses nothing; do by value/effort)

Each = additive Compare via `useOpenDiffViewerWindow()` (window) or `InlineTextDiff`
(inline) unless noted.

| Item | File | Effort | Note |
|---|---|---|---|
| **File version list Compare** (B1, highest value) | `features/files/components/core/FileVersions/FileVersionsList.tsx:252` | L | Per-row Compare vs current for non-current, text-like mimes. Real work = fetching version bytes + current bytes via `fileHandler` (metadata-only rows); skip binary/image (reuse the guard ~line 60). `engine:'auto'`, language from ext. |
| **Workbook snapshot Compare** (B16) | `features/data-tables/components/WorkbookHistoryViewer.tsx:223` | M | Ghost Compare beside Restore; reuse `handleRestore`'s by-id query (~78-84, `workbench.udt_workbook_snapshots`) to fetch chosen+current; `engine:'monaco', language:'json'`. Share a helper with DocumentHistoryViewer. |
| **Document snapshot Compare** (B16) | `features/data-tables/components/DocumentHistoryViewer.tsx:211` | M | Mirror of Workbook (`workbench.udt_document_snapshots`, ~70-76). Prose → `engine:'light', language:'markdown'`. |
| **Agent-app versions per-row Compare** (B5) | `features/agent-apps/route/AgentAppVersionsContent.tsx:60` | M | Rows are metadata-only; lazy-fetch `getAgentAppVersion(id)` (returns `component_code`) on click → reuse the `VersionCodeCompare` island, `engine:'monaco'`. |
| **Data-table cell edit Compare** | `features/data-tables/components/EditableCell.tsx:233` | M | **Gotcha:** the Textarea commits on `onBlur` — a Compare button next to it must `onMouseDown={e=>e.preventDefault()}` so clicking it doesn't blur-commit and exit edit first. Then compare `stringify(value)` vs `stringify(draft)`; json/array → monaco. |
| **Tool UI Component Generator overwrite** | `features/tool-call-visualization/admin/ToolUiComponentGenerator.tsx:865` | M | `handleSave` overwrites saved code the admin never sees. When `existingId` found, GET its current code and `open({engine:'monaco', language:'typescript', original: existing, modified: generated.code})` before the PUT. |
| **Transcription Cleanup overlay** (B17) | `components/official-candidate/transcription-cleanup/components/TranscriptionCleanup.tsx:405` | S | Older overlay variant of CleanupPad (already done). If still live via the transcription-cleanup overlay: add Compare (`transcript` vs `responseValue`, `engine:'light', highlight`). Confirm it isn't superseded first. |
| **CMS PageEditor** | `features/cms/components/PageEditor.tsx:695` | M · **med-risk** | Per-version Compare-with-current (`engine:'monaco', language:'html'`). Needs a version-content fetch (verify `useCmsPages` exposes it — the risk). **Boy-scout:** `handleRollback` (~243) is a dead stub using **banned `confirm()`** (~246); `handleDiscard` (~238) too — replace with `ConfirmDialog`/`confirm({...})` and wire rollback for real. |
| **Data-table row audit long-value diff** (A17 expand) | `features/data-tables/components/VersionHistoryViewer.tsx:152` | S | Change branch already key-level; for long prev/next strings render `<InlineTextDiff view="inline">` instead of one-line JSON. Keep short-scalar/insert/delete rendering. |

## Known constraints / footguns (don't "fix" without reading)

- **`CodeDiff` (engine="monaco") needs a definite-height parent** — Monaco is
  `height="100%"`; in an auto-height parent it collapses to 0px. Bound the height
  at the callsite (overlay window + shipped callsites already do).
- **Engine size caps:** `computeTextDiff` degrades to a whole-block diff above
  ~8M LCS cells (oldLines×newLines); `computeWordDiff` bails above ~1M token
  cells. Both still round-trip. `DiffViewer` routes >60k combined chars to Monaco.
- **`DiffReview`/hunks merge ignores `ignoreTrailingWhitespace` by design** — the
  merge model always runs on RAW lines so accept-all===modified exactly.
  Whitespace-insensitivity is display-only (TextDiff/InlineTextDiff).
- **Never double-wrap Monaco in `next/dynamic`** — one boundary (`lazyOverlay` for
  the window, or `CodeDiff`'s internal `next/dynamic`). See `code-splitting` skill.

## Expansions (bigger; not yet built)

- **Rolling two-row LCS** in `computeTextDiff`/`computeWordDiff` (O(min(n,m))
  memory) to remove the size wall entirely (today: degrade above the cap).
- **Move detection** (a moved line currently shows as remove+add).
- **3-way / conflict merge** in `DiffReview` (per-conflict pick).
- **since-last-seen** persistence (generalize `useWorkingDocChanges`).
- **`<CompareTwoPicker>`** (pick A / pick B) + a promoted `/compare` route (the
  `/demos/diff` playground is the paste-two compare/merge tool today).

## How to continue

- Re-run the discovery/audit workflow (finds new sites + re-audits):
  `Workflow({scriptPath: ".../workflows/scripts/diff-solidity-and-rollout-*.js"})`.
- Each rollout item is one small additive edit — read the target, add the
  Compare affordance, `pnpm tsc` the file, commit. Verify shared-primitive ones
  (ProTextarea, ChangeDiff, EditableCell) don't regress their host.
