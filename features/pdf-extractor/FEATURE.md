# features/pdf-extractor — PDF Extractor studio (a SURFACE of the PDF domain)

**This is a surface, not a standalone feature.** The canonical PDF *domain* — the
renderer, page spine, ops, extraction, viewers — lives in
[`features/pdf/FEATURE.md`](../pdf/FEATURE.md). `pdf-extractor` **composes** those
primitives (`PdfDocumentRenderer`, `buildPdfSource`, `FileContextMenu`,
`saveDerivative`, `MarkdownStream`) into the extractor studio + floating workspace
(`/tools/pdf-extractor`, `pdfExtractorWindow`; `SourceFeature = "pdf-extractor"`).
New PDF *capability* lands in `features/pdf/`, never here.

## What it is
Upload/select a PDF → render + extract text **page by page** → view/clean/save.
The "extract pages individually" flow builds job variables from
`docproc.processed_document_pages` (`integrations/surface-variables.ts`) and feeds
`features/page-extraction`; per-page image/vision is the agent-side
`document_content representation="pdf"` path.

## Packaged with the attached-documents system (verified 2026-07-15)
A document produced here is a real `docproc.processed_documents` row on the shared
page spine, so it plugs straight into the attach → resolve → agent-tools system
built this session — **not** a separate silo:
- **Same page spine.** `batch-extract` / `full-pipeline` persist through the ONE
  writer (`aidream/services/documents/persistence.py`) → every page in
  `docproc.processed_document_pages` (the sacred page spine).
- **Same page-image renderer.** Reads `image_cld_file_id`; the canonical
  `render_page_image` (aidream) is the only spine-image cache — no fork here.
- **Attachable + resolvable.** Studio sidebar attaches via the canonical
  `FileContextMenu` → `attach-resource.ts` (`processed_document` token) → a
  `platform.associations` edge → `ProcessedDocumentResolver`
  (`aidream/services/documents/context_source_resolver.py`). The agent then sees
  it via `context` + `document_content` / `document_search` / `doc_verify`.
- Contextual access (chat-share = read-only) is governed by
  [`aidream/docs/access/CONTEXTUAL_ACCESS.md`](../../../aidream/docs/access/CONTEXTUAL_ACCESS.md).

## DB access
Always through the typed `docprocDb(supabase)` helper (`utils/supabase/docprocDb.ts`)
— never `(supabase as any).schema("docproc")` (removed 2026-07-15, commit
`e82fb6d74`; keeps generated-type safety on every docproc read/write).

## Known doc drift (follow-up)
`API.md`'s "List/Get Document" sections describe the RETIRED flat schema
(`content`/`clean_content`/`source`) and present REST GETs as the fetch path; the
live FE reads `processed_documents` directly from Supabase via `docprocDb` +
`PROCESSED_DOCUMENTS_COLUMNS`. The streaming section is accurate. Correct those two
sections when next in here.

## Change Log
- 2026-07-15 — Verified packaged with the attached-documents system (page spine ·
  canonical renderer · attach/resolve · agent tools); typed `docprocDb` conversion
  (`e82fb6d74`); this FEATURE.md pointer added.
