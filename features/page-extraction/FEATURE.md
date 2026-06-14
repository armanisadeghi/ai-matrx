# FEATURE.md — `page-extraction`

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-05-23`

> **Two surfaces, two pickers.** The PDF Studio runs a one-shot agent surface (`matrx-user/pdf-widgets`) in the right-rail Widgets tab AND the chunked-run surface (`matrx-user/content-extractor`) in the Chunked Runs tab. The chunked surface inherits every value from the widget surface verbatim (so an agent wired to `full_document_text` works on both) and adds the chunk-only values (`clean_text`, `raw_text`, `pdf_page`, `chunk_index`, `chunk_count`, `job_id`, `run_id`). The Extractions data pane uses an independent `viewedJobByFile` pointer so the user can browse past run data without dragging the sidebar template selection along, with an explicit `EXTRACTIONS_ALL_VIEW` sentinel for the cross-template aggregate view.

---

## Purpose

Run an AI integration page-by-page (or in small chunks) across a document and persist each structured response anchored to its source page(s). Results conform to a user-defined JSON schema and accumulate into a dataset rendered as a dynamic table. Designed for high-volume document review (medical-legal indexing, entity pulls, classification, citation extraction, etc.) where per-page provenance and chunked execution are critical.

---

## Entry points

**Routes**
- `/tools/pdf-extractor/[id]` — primary *setup* surface. The PDF Extractor declares the variable mapping ([features/pdf-extractor/integrations/surface-variables.ts](../pdf-extractor/integrations/surface-variables.ts)) and exposes the `chunked` scope option that runs a Job. The inline Extractions pane has a "Full view" link out to the workspace below.
- `/knowledge/extractions` — **Extraction Data workspace catalog.** Global list of every dataset across all source documents — search, sort, context-filter, per-row context status, "Open" into the grid. The savior list entry (you're not trapped in a single PDF's tab). Client: [data-review/ExtractionCatalogClient.tsx](data-review/ExtractionCatalogClient.tsx).
- `/knowledge/extractions/[id]` — **single-dataset management grid.** Search, sort, column visibility, pagination, merge duplicates, inline-edit manual columns, per-row + bulk delete, run history (retry/cancel), context tagging, export (CSV/XLSX/JSON/copy), push to workbook / data table, jump back to the source PDF. Client: [data-review/ExtractionDatasetClient.tsx](data-review/ExtractionDatasetClient.tsx).
- `/knowledge/extractions/admin` — per-feature admin map ([app/(core)/knowledge/extractions/admin/page.tsx](../../app/(core)/knowledge/extractions/admin/page.tsx)).

**Hooks**
- `useExtractionJob(jobId)` — single Job + its latest Run, with Realtime updates
- `useExtractionResults(jobId, opts)` — Results filtered/sliced for the table
- `useExtractionStream()` — drive an active Run via NDJSON SSE
- `useExtractionLiveResults(fileId)` — Realtime subscriber for every result on a file

**Services**
- `features/page-extraction/api/stream.ts` — NDJSON SSE client to aidream
- `features/page-extraction/api/jobs.ts` — Supabase CRUD on jobs
- `features/page-extraction/api/runs.ts` — Supabase reads + retry/cancel calls

**API endpoints** (aidream)
- `POST /page-extraction/runs/stream` — NDJSON SSE fan-out across pages
- `POST /page-extraction/page-runs/{id}/retry` — retry one chunk
- `POST /page-extraction/runs/{id}/cancel` — cancel an in-flight run

**Redux slice**
- `features/page-extraction/redux/pageExtractionSlice.ts` — jobs cache, active run + page-run statuses, live results buffer

---

## Data model

**Database tables** (Supabase)
- `page_extraction_jobs` — reusable config (agent/shortcut, schema, chunk size, scope, variable mapping). RLS: owner full, org members read. **One mutation path.**
- `page_extraction_runs` — one execution lifecycle. Rollup counters maintained by trigger.
- `page_extraction_page_runs` — one agent call per chunk. Carries `raw_response`, `parsed_payload`, parse + execution errors.
- `page_extraction_results` — one row per item in the parsed array. Carries `(file_id, source_pages[], canonical_page)` for cross-surface lookup.

Realtime publication enabled on `page_extraction_jobs`, `page_extraction_runs`, `page_extraction_page_runs`, `page_extraction_results`. Migration: [migrations/page_extraction_tables.sql](../../migrations/page_extraction_tables.sql). The jobs table was added to the publication via [`migrations/add_page_extraction_jobs_to_realtime`](../../migrations/) so the sidebar/picker cache (`features/page-extraction/hooks/useExtractionJobs.ts`) auto-refreshes when a row is created, renamed, or archived — previously the cache only refreshed on a full page reload, which made newly-saved templates appear nameless mid-run.

**Key types**
- `PageExtractionJob`, `PageExtractionRun`, `PageExtractionPageRun`, `PageExtractionResult` (from `types.ts` — wire-aligned with Supabase rows)
- `SurfaceChunkVariables` — the canonical chunk-variable contract surfaces fulfill
- `ExtractionStreamEvent` — discriminated union of NDJSON SSE events
- `JobOutputSchema` — flat JSON Schema (Phase 1; nested support later)

---

## Key flows

### 1. User clicks "Run extraction" in PDF Extractor

1. `AiActionsPanel` ([features/pdf-extractor/studio/PdfStudioInspector.tsx](../pdf-extractor/studio/PdfStudioInspector.tsx)) — scope set to `chunked`, Job picked.
2. `runExtractionStream(jobId, opts)` ([api/stream.ts](api/stream.ts)) opens `POST /page-extraction/runs/stream` with the user's JWT.
3. Backend creates the `page_extraction_runs` row and starts fanning out.
4. Frontend receives `run.started` → updates Redux active-run state.
5. For each chunk: backend emits `page_run.started` → `page_run.completed | page_run.failed`. The UI's `RunProgressBar` ticks. The Realtime subscriber on `page_extraction_results` adds new rows to the `ResultsTable` independently of the SSE stream — that's how progress survives navigation.
6. `run.completed` fires; the Job's `latest_run_id` gets bumped server-side.

### 2. User clicks a row in the ResultsTable

1. `ResultsTable` row click → `onJumpToPage(canonical_page)`.
2. `PdfStudioShell` updates `activePage`; existing sync logic scrolls all panes to that page.

### 3. Mid-run navigation away and back

1. SSE stream is aborted when the component unmounts.
2. Server keeps fanning out and writing rows.
3. User returns. `useExtractionJob` reads the latest run from Supabase; `useExtractionLiveResults` subscribes via Realtime and catches new rows as they're inserted.
4. UI displays current state without replay.

### 4. Failed chunk → retry

1. Click "Retry" on a failed page_run.
2. `POST /page-extraction/page-runs/{id}/retry` — backend re-runs the same chunk with the same variables and replaces the existing `page_extraction_page_runs` row + its `page_extraction_results`.
3. Realtime delivers the update.

---

## Invariants & gotchas

- **One Job, multiple Runs.** Re-running a Job appends a new Run — old results stay queryable. The Results table shows **every** run's rows for the Job (it no longer filters to `latest_run_id`).
- **Re-runs are gated, never silent.** A template that has run before (persisted `latest_run_id` OR an in-memory active run) cannot be re-run without a choice: **Replace** (clear the template's results via `page_extraction_clear_job_results`, then run again) or **Run as new** (clone the template as `<name> (2)` and run that, leaving the original run intact). All run buttons funnel through the single `useExtractionRunLauncher` hook + `RerunPromptDialog` — there is no other path that calls `useExtractionStream().start` for a template run. First runs stream immediately with no prompt.
- **Page anchoring uses `page_number` (1-based)**, NOT `page_id`. This is the lowest-common-denominator key that works across `processed_document_pages` and `file_pages`. `page_ids[]` on a page_run is opportunistic — populated when `file_pages` rows exist, NULL otherwise. **Never** assume `page_ids` is present.
- **Variable mapping is authoritative.** Surfaces produce `SurfaceChunkVariables`; the Job's `variable_mapping` translates them to whatever the agent expects. Adding a new surface variable means: (a) update `SurfaceChunkVariables` in `types.ts`, (b) have the surface populate it, (c) jobs that want to use it add a mapping.
- **All writes flow through aidream**, not the browser. The browser only reads via Supabase + Realtime. RLS allows direct writes only for the job owner, but the convention is: aidream owns the write path so we have one place to enforce concurrency caps, schema validation, and lifecycle transitions.
- **Parse failures don't kill a run.** A chunk that returns non-JSON text records `parse_error` and produces zero `page_extraction_results`. The run continues. The UI shows the chunk as "parse failed — retry".
- **Don't dedupe results in SQL.** Same finding reported by two chunks (overlap) shows up twice on purpose. Deduplication is a downstream concern.

---

## Related features

- Depends on: [features/agents/](../agents/) (shortcut execution path), [features/files/](../files/) (`cld_files` and the auth + base-URL plumbing in `api/client.ts`), [features/pdf-extractor/](../pdf-extractor/) (the primary surface today)
- Depended on by: future Analysis Studio integration ([features/file-analysis/](../file-analysis/)), future RAG viewer badges
- Cross-links: [features/agents/FEATURE.md](../agents/FEATURE.md), [features/rag/FEATURE.md](../rag/FEATURE.md), [features/file-analysis/FEATURE.md](../file-analysis/FEATURE.md), [features/pdf-extractor/FEATURE.md](../pdf-extractor/FEATURE.md)

---

## Current work / migration state

**Phase 1 (this scaffold):**
- ✅ Storage tables + RLS + Realtime publication
- ✅ aidream `POST /page-extraction/runs/stream` endpoint
- ✅ Frontend feature scaffold + PDF Extractor surface variable mapping + `chunked` scope + `extractions` pane

Subsequent phases (see plan): Job editor + schema builder (Phase 2), resilience/retry UX (Phase 3), scheduled background runs (Phase 4), cross-surface unification (Phase 5), tool-using agent mode (Phase 6).

---

## Phase 2 — user-driven chunking (this revision)

Phase 1 hardcoded chunk size and assumed a Job picker. Phase 2 fixes that:

- **`ChunkingConfigForm`** ([components/ChunkingConfigForm.tsx](components/ChunkingConfigForm.tsx)) lives in the PDF Extractor's inspector when scope = `chunked`. Required fields: agent, page range, chunk size, source variations. No silent defaults — the Run button is disabled until each is set explicitly.
- **`AgentListDropdown`** (reused from `features/agents/...`) replaces the hardcoded shortcut list. The user picks from their own agents (and shared / builtin agents).
- **`SourceVariation`** — a Job can request multiple inputs per chunk: `clean_text`, `raw_text`, `pdf_page` (Phase 3). Each variation gets its own surface-variables key so the Job's `variable_mapping` can route each to a specific agent variable.
- **`ChunksTab`** ([components/ChunksTab.tsx](components/ChunksTab.tsx)) — Extractions pane is now tabbed (`Chunks` | `Results`). The Chunks tab visualizes every chunk as a card with page range, char count, per-variation breakdown, and expandable preview content. Aggregate stats: total chunks, total chars, avg / longest / shortest, empty count. Live, updates as the user edits.
- **`is_saved`** column on jobs distinguishes user-named Jobs (visible in the picker) from ephemeral ones created automatically by the Run form. Ad-hoc runs default to `is_saved=false`; the user opts in to saving by ticking "Save as named Job".
- **Per-file in-memory draft** lives in the `pageExtraction` slice under `draftsByFile[fileId]`. The inspector form and the Chunks tab both read it so they stay in sync.

Schema additions in [`migrations/page_extraction_variations_and_strategy.sql`](../../migrations/page_extraction_variations_and_strategy.sql):
- `page_extraction_jobs.source_variations jsonb` (default `["clean_text"]`)
- `page_extraction_jobs.chunking_strategy text` (default `"pages"`, check-constrained to extension list)
- `page_extraction_jobs.is_saved boolean` (default `true` so existing rows stay in the picker)

Python side ([`aidream/api/routers/page_extraction.py`](../../../aidream/aidream/api/routers/page_extraction.py)):
- `_load_page_text` now returns `{ page_number: { 'clean_text': '…', 'raw_text': '…' } }` so a single Job can request multiple variations without re-querying.
- `_build_surface_vars` populates a per-variation key for each requested kind. Legacy `selection` / `content` are kept populated with the first non-empty variation so pre-Phase-2 Jobs keep working.

## Roadmap (deferred from this commit)

- **Document Types** — user-defined doc types with default agents and chunk configs. Auto-applies when a doc is tagged with a type.
- **Saved chunking presets** distinct from Jobs (reusable chunking config that's agent-agnostic).
- **Section / keyword / manual chunking strategies** — the `chunking_strategy` enum is in place; the strategies need implementations.

## PDF page attachments (`pdf_page` source variation)

When a template's `source_variations` includes `pdf_page`, the aidream backend (`aidream/api/routers/page_extraction.py`) slices the actual PDF page(s) for each chunk and attaches them to the agent call as native `document` content parts so a PDF-capable model (Gemini) reads the pages directly instead of OCR text.

- Per-page slices and the optional combined-chunk slice are produced + cached by `aidream/services/documents/page_pdf_attachments.py` (`get_or_create_page_pdf` / `get_or_create_chunk_pdf`). The cache is the `cld_files` derivative tree itself — each slice is a child of the source PDF with `derivation_kind` `page_pdf` / `chunk_pdf` and a `page_number` / `page_numbers` anchor in `derivation_metadata`. No new table; second runs reuse the existing slice.
- The agent turn interleaves a `--- Page N ---` text marker before each page attachment so per-page provenance survives inside a multi-page chunk. When `attach_combined_pdf` is on (DB column added by `migrations/page_extraction_jobs_attach_combined_pdf.sql`) and the chunk spans >1 page, a combined PDF is appended last behind a `--- Full chunk (pages A-B) ---` marker.
- Attachments are resolved via `normalize_request_body(agent.config)` BEFORE `agent.execute()` — without that boundary normalisation step the provider silently drops the file refs. Per-page slice failures degrade gracefully (the chunk's text variations still go through).

## Change Log

- **2026-06-14** — Delete-a-run + clearer "Full view" link. **(1)** Added a true per-run delete (`deleteRun` in [api/runs.ts](api/runs.ts)) — a single owner-RLS delete of the `page_extraction_runs` row that cascades to its `page_extraction_page_runs` + `page_extraction_results` (FK `ON DELETE CASCADE`) and self-clears `latest_run_id` (FK `ON DELETE SET NULL`; `getLatestRunId` falls back to the newest remaining run). Surfaced as a trash button on the inline `RunProgressBar` (terminal runs only; confirm dialog; on success dispatches `clearRun` to hide the bar / clear the Chunks overlay + `invalidateResults`) and per-run in the data-review `RunsPopover`. This is the missing middle ground between **Clear data** (wipes ALL runs for the template via `page_extraction_clear_job_results`) and **Delete template** (archives the job, keeps data queryable). New slice field `resultsRefreshNonce` + `invalidateResults` action + `selectResultsRefreshNonce`: the results tables watch it and refetch, because Realtime only reliably delivers INSERT/UPDATE (a DELETE carries just the PK under the default replica identity). **(2)** The inline "Full view" affordance now opens `/knowledge/extractions` in a **new tab** (`<a target="_blank">` + `ArrowUpRight` icon) instead of a same-tab `next/link` with a maximize icon, which read as "expand in place."
- **2026-06-14** — Workspace grid: editable cells + discoverable push + open-chooser. Three follow-ups from live review of the dataset grid. **(1) Editing.** Cell editing was effectively invisible (only `manual` columns, behind an unmarked double-click). `COLUMN_SOURCE_META` now marks `agent` + `validation` editable too (system/page-anchor stays read-only) — this is the *shared* rule, so the inline PDF-Studio Results table gains the same human-override capability. New `editKeyFor(col)` in [utils/columns.ts](utils/columns.ts) resolves the correct payload write-key per source (agent writes `agentField ?? key`, matching `cellValueFor`'s read) so overriding an agent column actually persists. The grid shows a hover-pencil + "Double-click to edit" affordance on every editable cell and a header pencil per editable column. **(2) Push discoverability.** Pushing to other Matrx systems was buried inside the Export download dropdown's "Send to" section — users couldn't find it. Split into a dedicated, labeled **`SendToMenu`** header button (Workbook / Data table); `ExportMenu` is now downloads + copy only. **(3) Open chooser.** New reusable **`OpenDestinationDialog`** — after any create we ask *how* to open it instead of silently navigating: **Open here** / **Open in new tab** / **Open as window** (the last only for targets with a window-panel surface). Data tables offer all three (window via `openOverlay({ overlayId: "quickDataWindow", data: { selectedTable } })` — the same path `SaveTableModal` uses); workbooks are routing-only (Here / New tab), matching how each system actually works. `pushToWorkbook` / `pushToDataset` now return the created `id` so the window option can target it. Responsive (Drawer on mobile, Dialog on desktop).
- **2026-06-14** — Re-run guard + Chunks-after-reload + default-to-All view. Three follow-ups from live testing: **(1)** Re-running a template no longer silently clobbers/muddles the prior run. All run triggers (`SavedJobsList` rows, `TemplateReadOnlyView`'s Run button via `ChunkingConfigForm`) now funnel through one new primitive — [useExtractionRunLauncher.tsx](hooks/useExtractionRunLauncher.tsx) — which detects a prior run (DB `latest_run_id` or an in-memory active run) and opens [RerunPromptDialog.tsx](components/RerunPromptDialog.tsx): **Replace** (clear results, re-run same template) or **Run as new** (clone as `<name> (2)` via new `cloneJobWithName` in [api/jobs.ts](api/jobs.ts), run the clone, view it). First runs stream with no prompt. **(2)** The Chunks tab now computes its chunk preview from the **viewed job's persisted config** (new `configOverride` on [useChunkPreview.ts](hooks/useChunkPreview.ts)) instead of the inspector draft, which is empty after reload — so chunks (and their hydrated per-chunk Agent-output overlay) actually render for a saved job after a page refresh. **(3)** `selectViewedJobForFile` now defaults to the All-extractions view instead of an empty "pick a job" state, so the pane lands somewhere useful on load.
- **2026-06-14** — **Extraction Data workspace** (`/knowledge/extractions`). The inline PDF-Studio "Extractions" tab was never enough for managing or reviewing accumulated datasets, so extraction data now has a dedicated home built on the same parsing rules. New [data-review/](data-review/) module: **`ExtractionCatalogClient`** (global catalog — every dataset across all docs, with result counts, latest run status, search/sort, context filter + per-row context status) and **`ExtractionDatasetClient`** (the full single-dataset grid: search, sort, column visibility, pagination, merge-duplicates toggle, inline-edit of `manual` columns, per-row + bulk delete, rename/duplicate/archive/clear, run history via **`RunsPopover`** with retry/cancel, and a jump-to-source-PDF link). **Export** is consolidated in **`ExportMenu`** — download CSV / XLSX (SheetJS) / JSON, copy as table or AI-friendly Markdown, and **Send to** a new udt_workbook (Univer snapshot via [data-review/export-targets.ts](data-review/export-targets.ts)) or a typed udt_dataset. **Context integration:** datasets are first-class taggable entities — added `"page_extraction_job"` to `ScopeAssignmentEntityType` ([features/scopes/types.ts](../scopes/types.ts); no migration — `set_entity_scopes` doesn't whitelist entity_type and `ctx_scope_assignments.entity_type` has no CHECK), so the catalog filters by context and both surfaces show status via `ContextStatusButton` / `ContextAssignmentField`. The inline `ExtractionsPane` gained a "Full view" link out to the workspace. Per-feature admin map at `/knowledge/extractions/admin`. Data layer: [data-review/data.ts](data-review/data.ts) (`listExtractionCatalog`, `deleteResultRows`, `duplicateJob`).
- **2026-06-14** — Results freshness + Chunks-tab reload hydration. Three fixes prompted by live testing: **(1)** the Results table no longer needs a manual reload to show rows from a just-finished run — `SingleJobResultsTable` now refetches on the run-progress signal (per-chunk completion + terminal `completed` status from the `pageExtraction` slice), closing the race where a fast run finishes before the Realtime channel finishes subscribing. **(2)** Added an explicit **Refresh** button to both the single-template and All-extractions Results headers ([ResultsTable.tsx](components/ResultsTable.tsx)). **(3)** The Chunks tab lost its per-chunk *Agent output* overlay after a page reload because that state was only ever mirrored into Redux live (`usePageRunsRealtime` needs an in-memory `activeRunId`). The data was never lost — `page_extraction_page_runs` durably stores `raw_response` + `parsed_payload` + `page_numbers`, and every `page_extraction_results` row carries `page_run_id` + `source_pages` + `canonical_page` linking each extracted row back to the exact chunk/pages the agent saw. New [usePersistedRunHydration.ts](hooks/usePersistedRunHydration.ts) (mounted in `ExtractionsPane` beside `usePageRunsRealtime`) replays the viewed job's latest persisted run through the same slice actions the stream uses, so the input↔output↔source view reappears after reload without clobbering a live run.
- **2026-06-14** — Unified the list-wrapping rule across surfaces + made the Results table self-healing. LLM providers disagree on whether a list comes back bare (`[ … ]`) or wrapped under one key (`{ "items": [ … ] }`). The agent's `_coerce_to_row_list` (aidream) already normalizes both before persisting, and the template editor's column import (`findItemProperties`) already understood the wrapped schema — but the Results display had **no rule of its own**, so it was entirely at the mercy of the backend. Centralized the data-side rule as `coerceToRowList` in [utils/columns.ts](utils/columns.ts) (the documented frontend twin of the backend `_coerce_to_row_list`), alongside the schema-side `findItemProperties`, plus shared `normalizeResultRows` / `inferColumnsFromRows` helpers. `ResultsTable` (single-template AND All-extractions views) now runs every row through `normalizeResultRows`: with today's backend this is a no-op (verified — zero wrapper rows exist in `page_extraction_results`), but if a wrapper ever reaches storage (a backend regression, a different extraction microservice) it's unwrapped via the shared rule and surfaced **loudly** (console.error + an amber recovery banner) instead of silently rendering blank cells. `api/stream.ts` no longer drops a non-array `parsed_payload` (the inline Chunks preview) — it routes through `coerceToRowList` too. Net: the two UI areas can never disagree about what a row is, and the "results never show in the table" failure class is structurally impossible on the display side.
- **2026-05-12** — Phase 1 scaffold (storage + minimal fan-out + first PDF Extractor wiring).
- **2026-05-12** — Phase 2 rework: user-driven config, source variations, live chunk preview, tabbed Extractions pane, removed all hardcoded defaults. Migration `page_extraction_variations_and_strategy.sql` adds `source_variations`, `chunking_strategy`, `is_saved`.
- **2026-05-13** — Surface integration:
  - Declared `matrx-user/content-extractor` surface ([content-extractor.manifest.ts](../surfaces/manifests/content-extractor.manifest.ts)) with 16 SurfaceValues — 11 surface-specific (`filename`, `page_numbers`, `clean_text`, `raw_text`, `pdf_page`, `chunk_index`, `chunk_count`, `file_id`, `processed_document_id`, `job_id`, `run_id`) + 5 baseline values (`selection`, `content`, `text_before`, `text_after`, `context`) for cross-surface consistency. The baseline values are kept under "Show advanced" in the mapping picker because chunked runs have no selection concept — they're emitted as legacy aliases for `clean_text` (back-compat with Phase-1 Jobs) but new mappings should target `clean_text` / `raw_text` / `pdf_page` directly. The three chunk-content values use `"Chunk text (cleaned)" / "Chunk text (raw OCR)" / "Chunk pages (PDF)"` labels so the user reads them as "the chunk's content in this format" rather than four independent text variables. Seeded `ui_surface` row + synced values to `ui_surface_value`.
  - Replaced the read-only `VariableMappingPreview` with a true `VariableMappingEditor` ([components/VariableMappingEditor.tsx](components/VariableMappingEditor.tsx)) — one dropdown per agent variable, populated directly from the manifest registry. The dropdown has TWO tiers:
    - **Primary** (always visible) — `Chunk content (the agent's input)`, `Chunk location`, `Document`, `Run`, `Other`. These are the values that meaningfully exist for a chunked run.
    - **Advanced** (collapsed behind "Show advanced") — `selection`, `content`, `text_before`, `text_after`. These are baseline standards used by widget-style surfaces (notes editor, code editor, context menus) but conceptually mismatched with chunked runs. They're kept in the manifest for system consistency and auto-expand if any current mapping uses them.
  - Items render single-line as `Label  snake_case_name`. Items gated by an inactive variation (e.g. `clean_text` when "Cleaned text" is unticked below) render muted, and any agent variable mapped to one shows an inline warning. Already-claimed surface keys are disabled in other rows to prevent double-binding. `deriveVariableMapping` is opt-in via an "Auto-suggest" button — never auto-applied.
  - Refactored [`ChunkingConfigForm`](components/ChunkingConfigForm.tsx) into three states:
    1. **List-only** — no template selected → header + `SavedJobsList` + "New" button.
    2. **Read-only** — saved template selected → header + `SavedJobsList` + `TemplateReadOnlyView` ([components/TemplateReadOnlyView.tsx](components/TemplateReadOnlyView.tsx)) with Edit + Run buttons.
    3. **Editing** — full form (only rendered when the user clicked Edit or New). Saved state lives in Redux (`pageExtraction.editingByFile`).
  - `pageExtractionSlice` adds `editingByFile: Record<string, boolean>` + `setEditing` action; `selectors.ts` exposes `selectIsEditingForFile`.
- **2026-05-13** — Two-surface split + chunked-runs UX overhaul:
  - **New surface** `matrx-user/pdf-widgets` ([pdf-widgets.manifest.ts](../surfaces/manifests/pdf-widgets.manifest.ts)) for the right-rail Widgets tab (one-shot agents over a doc / page / range / selection). Exposes five explicit scope-text variables (`full_document_text`, `current_page_text`, `page_range_text`, `selected_text`, plus picker-following `active_scope_text`) so an agent author can pick "always run on the full doc" or "follow the picker" without rewriting the surface. Document metadata + runtime state round it out (18 SurfaceValues). The PDF Studio inspector's Widgets tab now emits the full `createPdfWidgetsScope` payload and tags runs with `runtime.surfaceName = "matrx-user/pdf-widgets"`. Existing widget shortcuts wired to `selection` / `content` keep working — the runtime duplicates `active_scope_text` and `full_document_text` into those baseline aliases.
  - **Content-extractor inherits from pdf-widgets.** `matrx-user/content-extractor` now declares 25 SurfaceValues — the same 18 from pdf-widgets PLUS 7 chunk-only ones (`clean_text`, `raw_text`, `pdf_page`, `chunk_index`, `chunk_count`, `job_id`, `run_id`). Chunk-only values sort first (50-99) so the binding editor surfaces them at the top; widget-inherited values follow with `current_page` and `page_numbers` re-described to match chunk semantics ("First page of current chunk" / "Chunk page range"). Agent variables can now wire to any whole-doc value from a chunked run — "give me the full doc as context alongside the current chunk" is a one-click bind.
  - **Implicit `source_variations`.** The form's three-checkbox section (clean / raw / pdf-page) is gone. The save path now derives `source_variations` from the variable mapping at write time (`deriveSourceVariations` in [services/run-from-draft.ts](services/run-from-draft.ts)) — picking "N clean-text chunks" in any variable's dropdown is the signal to request `clean_text` from the backend. Empty mappings fall back to `["clean_text"]` so the backend never sees an empty list. `validateDraft` now requires `≥1` mapped variable rather than `≥1` ticked checkbox.
  - **`VariableMappingEditor` rewrite.** New dropdown order: **Dynamic chunks** (live counts — "58 clean-text chunks") → **Extra inputs** (named result rows from other templates, each becomes its own option) → **Document** → **Scope text** (whole-doc, inherited) → **Runtime** → **Advanced** (legacy aliases behind "Show more"). The standalone `ExtraInputsEditor` section is gone — extra inputs are managed inline at the bottom of the wiring panel and the named entries appear in every variable's dropdown.
  - **`ChunkingConfigForm` reorder.** New section order: **Name → Pages → Chunk size/overlap → Agent + Variable Wiring → RAG boost**. Every section's hint copy has been pared down from sentences to fragments — no more novelistic explanations.
  - **PDF Studio Widgets tab — "Attach an agent" affordance.** Replaces the dead-end "two hardcoded shortcuts" view with a `+ Attach one of your agents` link pointing at `/agents/shortcuts/shortcuts` (full shortcut admin). The two existing PDF shortcuts still render at the top.
  - **Data-view ↔ template selection decoupled.** Added `viewedJobByFile` to `pageExtractionSlice`. The main extractions pane (JobPicker, RunProgressBar, ResultsTable, ChunksTab activeRun overlay) reads `selectViewedJobForFile` (falling back to selectedJob); the right inspector (`ChunkingConfigForm`, `SavedJobsList`) reads `selectSelectedJobForFile`. The sidebar's `selectJobForFile` action propagates downward to viewedJob (natural "click template → see its data") but the new `viewJobForFile` action does NOT promote upward. Result: user can browse past run data via the JobPicker dropdown while creating a brand-new template in the sidebar — no more snap-back. Bonus: deleting the viewed template also clears the viewed pointer.
- **2026-05-13** — Picker freshness + cross-template "All extractions" view:
  - **Realtime on `page_extraction_jobs`.** The shared jobs cache in [`hooks/useExtractionJobs.ts`](hooks/useExtractionJobs.ts) was subscribing to `postgres_changes` on a table that wasn't actually in the `supabase_realtime` publication — so newly-created templates never invalidated the cache and the JobPicker dropdown showed a blank placeholder until a full page reload. Migration `add_page_extraction_jobs_to_realtime` adds the table to the publication; the cache now refreshes on every INSERT/UPDATE/DELETE.
  - **Optimistic cache fast-path.** Added a `setKey` primitive to [`shared-cache.ts`](../file-analysis/hooks/shared-cache.ts) and exported `upsertJobInCache(fileId, job)` / `removeJobFromCache(fileId, jobId)` from `useExtractionJobs`. The save handler in `ChunkingConfigForm.handleSave` now pushes the freshly-saved row into the cache *before* dispatching `selectJobForFile`, so the JobPicker shows the name instantly even before the Realtime event arrives. The same path runs on soft-delete in `SavedJobsList.handleDelete`.
  - **"All extractions" view.** New `EXTRACTIONS_ALL_VIEW` sentinel exported from `pageExtractionSlice` plus an `isAllJobsView()` type guard. When the JobPicker is set to the sentinel, the Results tab renders a cross-template aggregate (new `useExtractionResultsForFile` hook + `listResultsForFile` API; per-row `Template` column derived from `useExtractionJobs(fileId)`; union of payload keys across every job's results). The Chunks tab shows a "chunks are per-template" hint and the RunProgressBar hides itself (run progress is per-template too — pick a specific template to see it). `usePageRunsRealtime` early-returns when the sentinel is active so it doesn't try to mirror a non-existent job-run. The cross-template results hook subscribes directly to `page_extraction_results` by `file_id`, so concurrent runs against multiple templates all stream into the All view live.
- **2026-05-23** — Output table (per-column source) + validation/dedup stage:
  - **Template owns the output table.** `page_extraction_jobs.output_schema` can now hold a column list (`{ kind:"extraction_columns", columns:[{ key, label, type, description, source, agentField }] }`). Each column declares its `source`: `agent` (mapped from the agent's output via `agentField`), `manual` (human-editable cell in Results), `validation` (filled by a validation pass), or `system` (page anchor). `SchemaEditor` ([components/SchemaEditor.tsx](components/SchemaEditor.tsx)) seeds via "Import columns from agent" (parses the agent's structured `output_schema`) then add/remove/reorder + retag sources. Empty list → inherit the agent's schema at run time (no double entry). `ResultsTable` renders from the column schema when present (ordered, labeled, source-aware; manual cells write back to `payload[key]` via `updateResultPayloadField`), else infers from data. Column helpers in [utils/columns.ts](utils/columns.ts).
  - **Validation template kind.** `page_extraction_jobs.kind` (`extraction` | `validation`) + `validates_job_id` (migration `page_extraction_jobs_validation_kind.sql`). The template form has a Type switch; validation hides pages/chunking and shows a "Validates template" picker. Backend `_run_validation` loads the validated template's rows, injects them as `validated_rows` (1-based `__row` ordinals, honoring `variable_mapping`), runs the agent once, parses per-row judgments, and MERGES validation fields into each row's payload via the manager (read-modify-write) — never inserts, never deletes. `canonical_entry` is resolved from a `__row` index to the real result id. Wrapped in the persistence Session + error-capture patterns; emits a typed `ValidationCompleted` event. Agent judgment shape: `[{ "__row": 1, "is_duplicate": false }, { "__row": 4, "is_duplicate": true, "canonical_entry": 1 }]`.
  - **Soft-flag + merge view.** Duplicates are never deleted — flagged `payload.is_duplicate=true` + `canonical_entry`. `ResultsTable` defaults to a MERGE view (`buildMergedDuplicateView` in utils/columns.ts): each duplicate is absorbed into its canonical row, back-filling fields the canonical is missing (the "take the complete copy's details" behavior), with a `+N merged` badge. Toggle flips between merge view and raw rows. `useExtractionResults` now subscribes to UPDATE as well as INSERT so validation write-backs surface live. `stream.ts` maps `page_extraction.validation_completed` → run.completed so the progress bar finishes.
  - **Known follow-ups:** validation runs in a single agent call (batching for very large result sets is noted in the backend as a future optimization); `report_complete` is just an extraction-side `agent` column the user adds (no extra code).
- **2026-05-20** — PDF page attachments wired (`pdf_page` source variation, backend). New aidream service `aidream/services/documents/page_pdf_attachments.py` (`get_or_create_page_pdf` / `get_or_create_chunk_pdf`) slices source PDF pages and caches each slice as a `cld_files` derivative (`derivation_kind` `page_pdf` / `chunk_pdf`, page anchor in `derivation_metadata`) — no new table; mirrors `page_image.py`. `page_extraction.py` now builds an interleaved agent `user_input` (`--- Page N ---` text marker before each page `document` part; optional combined-chunk PDF appended last behind a `--- Full chunk (pages A-B) ---` marker when `attach_combined_pdf` is on and the chunk spans >1 page), calls `normalize_request_body(agent.config)` before `agent.execute()` so the cloud-files refs resolve (without it the provider drops them), and reads `attach_combined_pdf` (DB column from `migrations/page_extraction_jobs_attach_combined_pdf.sql`) via the ORM's captured-extra-columns since the generated model isn't regenerated yet. Added a `PDF_PAGE_PDFS` system folder in matrx-utils `file_handling/system_paths.py`. Per-page slice failures degrade gracefully (text variations still sent). Text-only runs (no `pdf_page`) are unchanged.
