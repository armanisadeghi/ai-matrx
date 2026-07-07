# P3 — Large-Document Scale Program (CONTRACT OWNER: C3 job envelope — publish day 1)

> 2026-07-07 · Wave 1, Tier 2 · Master plan: [`README.md`](./README.md) · Delivers
> `features/pdf/FEATURE.md` roadmap items W5-L + the W4 remainder.
> WHY: the pipeline is correct but collapses at size — the reader mounts every block of a
> 500-page doc, and AI clean/extract of >200pp dies unresumably, losing the whole run.

## Objective

Make the document pipeline indifferent to size. A 500-page scanned contract renders instantly,
extracts and AI-cleans as a **resumable per-page job** (a crash resumes from the last page,
preserving overlap — the Operational Default), bulk outputs stream as ZIPs instead of
buffering, and the reading-order work already computed server-side becomes a viewer tab.

## Current state (verified 2026-07-07)

- Roadmap source: `features/pdf/FEATURE.md` §Known gaps — "W5-L: reader virtualization
  (500-page docs mount all blocks); streamed ZIPs for render-all/split; resumable per-page job
  model for AI clean/extract >200pp (resume-from-last-page preserving overlap)". W4 remainder:
  "reading-order viewer tab; per-pattern `substitute_formats` overrides."
- Reader: `features/pdf/components/viewer/` (`PdfDocumentRenderer` is THE viewer); extractor
  text panes render all page blocks eagerly.
- Extraction events already stream (`pdf_extract_started` / `pdf_page_extracted`, NDJSON via
  `postNdjson` / `drainPdfStream` in `features/pdf/api/streamDrain.tsx`) — but the *clean*
  pipeline is a detached fire-and-forget with no checkpoint/resume.
- Page truth lives in `docproc.processed_document_pages` (per-page `cleaned_char_count`,
  `section_title/kind`, `used_ocr` — all verified live); scanner + extractor poll it directly.
- Reading order: `extract-reading-order` endpoint exists (demo at
  `(dev)/demos/pdf-processing/extract-reading-order`), no viewer tab.

## Scope

**IN**
- **C3 day 1:** publish the resumable job envelope (event names + payload shapes:
  `job_started`, `job_page_done`, `job_checkpoint`, terminal + error) as a stub doc in
  `features/pdf/docs/JOB_ENVELOPE.md` so P4 codes against it immediately.
- **Resumable per-page job model (aidream):** AI clean/extract runs page-windowed with
  persisted checkpoints; a killed run resumes from last checkpoint preserving chunk overlap;
  status readable from the existing `processed_document_pages` columns (the FE polls you get
  for free). Wire the scanner ProcessingView + extractor progress onto it (no new poll paths).
- **Reader virtualization:** windowed rendering in the extractor text/preview panes and
  `PdfDocumentRenderer` consumers — 500-page docs mount O(viewport) blocks. You own the
  page-render layer (contract C2).
- **Streamed ZIPs** for render-all / split outputs (aidream streaming response + FE
  `useDownloadBlob` path).
- **Reading-order viewer tab** (additive `PdfSurfaceSwitcher`/pane-registry entry) +
  per-pattern `substitute_formats` overrides.

**OUT**
- Thumbnails/recents/Ask — **P2** (they add panes additively; you own render internals).
- Device certification — **P1**.
- New extraction *capabilities* (figures, searchable PDF) — **P4**; they ADOPT your C3
  envelope — design it for them, don't build their ops.

## Deliverables / Definition of done

1. C3 stub doc published day 1 (own commit); real generated types follow the aidream deploy +
   `pnpm sync-types`.
2. A >200-page document: kill the clean run mid-flight (server restart), it resumes and
   completes from the checkpoint — shown with page-ledger timestamps, no page re-cleaned from
   zero except the overlap window.
3. A 500-page doc opens in the extractor with first-paint page blocks < 1s and smooth scroll
   (measure; state numbers in the report).
4. Render-all/split of a big doc downloads as a stream (no server-side buffer spike; verify
   memory behavior server-side).
5. Reading-order tab live on the extractor via the registry; `substitute_formats` per-pattern
   overrides honored end-to-end.
6. `features/pdf/FEATURE.md` roadmap lines W5-L/W4 moved to the change log as shipped.

## Surfaces touched

- `features/pdf/components/viewer/**`, extractor panes, `surfaces/registry.ts`,
  `api/streamDrain.tsx`.
- aidream: clean-pipeline job model + checkpoints, ZIP streaming, reading-order/format
  endpoints.
- DB: checkpoint state (prefer existing `docproc` tables/columns; any DDL via `db-change` +
  Supabase MCP + ledger + `pnpm db-types`).

## Dependencies & contracts

- **Publishes C3**; **owns the reader-internals side of C2** (P2 adds panes additively — never
  block them, never let them fork the renderer).

## Build guidance

- Skills: `db-change` family for any DDL, `type-safety`, `code-splitting` (virtualized panes
  stay out of server chunks), `verify`, `finalize-and-ship`.
- Reuse the NDJSON spine: `postNdjson` + `drainPdfStream` — no new stream client.
- Gotcha: `cleaned_text` is NOT NULL DEFAULT `''` — progress checks must use
  `cleaned_char_count > 0` (an `is not null` check counts everything instantly; this bug
  already happened once).
- Gotcha: `pdf_pipeline_result` terminal event carries only `file_id` — don't expect pages on
  the terminal payload.

## Verification

Real big documents (generate a 500-page scan-like PDF if none exists), real kills, real
timings. No mocked streams. Hand Arman routes + the measured before/after numbers.

## Open questions

- Checkpoint granularity (per page vs per N-page window) — pick per-window matching the
  clean-overlap size; note the choice in C3.
