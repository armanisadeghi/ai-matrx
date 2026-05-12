# FEATURE.md — `page-extraction`

**Status:** `scaffolded`
**Tier:** `1`
**Last updated:** `2026-05-12`

---

## Purpose

Run an AI integration page-by-page (or in small chunks) across a document and persist each structured response anchored to its source page(s). Results conform to a user-defined JSON schema and accumulate into a dataset rendered as a dynamic table. Designed for high-volume document review (medical-legal indexing, entity pulls, classification, citation extraction, etc.) where per-page provenance and chunked execution are critical.

---

## Entry points

**Routes**
- `/tools/pdf-extractor/[id]` — primary surface. The PDF Extractor declares the variable mapping ([features/pdf-extractor/integrations/surface-variables.ts](../pdf-extractor/integrations/surface-variables.ts)) and exposes the `chunked` scope option that runs a Job.

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

Realtime publication enabled on `page_extraction_runs`, `page_extraction_page_runs`, `page_extraction_results`. Migration: [migrations/page_extraction_tables.sql](../../migrations/page_extraction_tables.sql).

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

- **One Job, multiple Runs.** Re-running a Job appends a new Run — old results stay queryable. UI filters to `latest_run_id` by default.
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

## Change Log

- **2026-05-12** — Initial scaffold (Phase 1).
