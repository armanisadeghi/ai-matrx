# P4 — Document Intelligence Expansion

> 2026-07-07 · Wave 2, Tier 2 · Master plan: [`README.md`](./README.md) · Delivers the
> "never-built roadmap" of `features/pdf/FEATURE.md` (vision docs lineage).
> WHY: extraction today reads text only — figures vanish, scanned output stays a dumb image
> PDF, and the platform can analyze documents but not produce them.

## Objective

Teach the pipeline to understand and produce more than text: **figure/image extraction with
RAG tokens** (a chart in a scanned report becomes retrievable, citable content),
**OCRmyPDF-style searchable PDFs** (the scanner's output gains an invisible text layer —
select/search/copy in any PDF viewer), and **`pdf/generate`** (structured content → PDF —
the missing write-side of the domain). Cloud-OCR / ML-layout providers ride along only where
the `pdf/ml` / `cloud_ocr` stubs make it cheap.

## Current state (verified 2026-07-07)

- `features/pdf/FEATURE.md` §Known gaps, "Never-built roadmap": figure/image extraction with
  RAG tokens; OCRmyPDF searchable-PDF; cloud-OCR + ML layout providers (`pdf/ml`, `cloud_ocr`
  stubs exist in aidream); `pdf/generate`.
- Extraction pipeline: `/utilities/pdf/*` (typed `usePdfClient`), per-page truth in
  `docproc.processed_document_pages` (blocks/words columns exist — the fidelity-rich page
  table), OCR via Tesseract at pixel-exact DPI (scanner wave 2026-07-07).
- RAG is live (chunks, retrieval, Source Inspector renders `PdfPreview` at cited pages);
  images flow through `fileHandler` / `NormalizedFile` with durability doctrine.
- No figure detection, no text-layer PDF output, no generation endpoint anywhere.

## Scope

**IN**
- **Figures first (default order — master-plan flag F4):** detect figure/image/table-image
  regions per page (extend extraction; the `blocks` data + existing region machinery are your
  raw material) → crop each region to a stored image via the canonical file pipeline → emit a
  RAG token/chunk carrying caption + page anchor so retrieval returns the figure; Source
  Inspector shows it at the cited page.
- **Searchable PDF:** an OCRmyPDF-equivalent output for scanned docs — original pixels +
  invisible text layer — as a derivative (`saveDerivative`, never mutating the source), plus a
  scanner option/extractor action to produce it.
- **`pdf/generate`:** structured content in (start with the platform's markdown/Content-IR
  shapes) → styled PDF out, exposed via `usePdfClient` and one FE action surface.
- Cloud-OCR / ML-layout provider wiring ONLY if the stubs make a provider a config away —
  otherwise document what it would take and stop.
- All long ops ride **C3** (P3's resumable job envelope).

**OUT**
- Job-envelope/checkpoint machinery itself — **P3** owns it; you adopt.
- Reader render internals — **P3** (your figure overlays enter via the annotation layer +
  registry, additively).
- Thumbnails — **P2** (different artifact; don't unify prematurely).
- Redaction escrow — [`W2-redaction-escrow.md`](./W2-redaction-escrow.md) (KMS-gated).

## Deliverables / Definition of done

1. A scanned report with charts: each figure extracted as a stored image (durable ref, never a
   signed URL persisted), retrievable via RAG (query returns the figure with page citation;
   Source Inspector renders it).
2. Searchable-PDF derivative downloads from a scan-born doc; text selectable in Preview/macOS
   Preview; source file byte-identical (lineage via `saveDerivative`).
3. `pdf/generate` produces a real PDF from structured input, reachable from one FE surface;
   round-trip demo: generate → scan-pipeline extract → contents match.
4. Long ops resumable via C3 (kill/resume demonstrated once).
5. `features/pdf/FEATURE.md`: parts table + change log updated; "never-built" lines removed.

## Surfaces touched

- aidream: extraction pipeline extensions, searchable-PDF op, generate endpoint, provider
  stubs.
- `features/pdf/` (client, hooks, annotation layer, registry entries), RAG chunk writers
  (`rag.*` — coordinate with RAG feature doc), `features/files` handler consumption.
- DB: figure/chunk rows in existing `docproc`/`rag` tables where they fit; DDL via `db-change`.

## Dependencies & contracts

- **Consumes C3** (stub doc exists day 1 — code against it; don't wait for P3 to finish).
- Honors C2 (additive panes/overlays only). Nothing published.

## Build guidance

- Skills: `db-change`, `type-safety`, `shape-system` (generate's input should speak
  Content-IR kinds — check the kind registry before inventing an input schema), `verify`,
  `finalize-and-ship`.
- Sources through `buildPdfSource` (`media:{file_id}`) — the raw-literal bug class broke the
  platform once.
- `persist_output=true` flips binary endpoints to JSON envelopes — `postPdfBlob` guards this;
  keep the contract.
- Figures are files: through `fileHandler` only; durable refs; captions come from the clean
  pipeline's section context, not a separate LLM pass if avoidable.

## Verification

Real scanned documents with real figures (scan a magazine page). RAG queries executed live;
PDFs opened in an external viewer. Hand Arman routes + one wow-demo script (scan a chart →
ask about it → get the figure back).

## Open questions

- F4 (master plan): figures-first vs searchable-PDF-first — default figures-first unless Arman
  flips it.
- `pdf/generate` template scope (one house style vs template registry) — start with one house
  style; registry is a follow-up.
