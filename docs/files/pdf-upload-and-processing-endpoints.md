# PDF Upload & Processing — Frontend Endpoint Map (code-confirmed)

**Purpose:** A single source of truth for every PDF-related backend call the
**matrx-frontend** actually makes, so the server team can converge endpoints,
arguments, and contracts where possible.

**Scope & rules for this doc:**
- **Code-confirmed only.** Every entry below is read from an actual `fetch` /
  client call site in the frontend — not from comments, not from the
  `lib/api/endpoints.ts` constant table, not from `*.md` docs.
- **PDF only.** Image/asset/transcript/etc. upload paths are intentionally out
  of scope.
- **Frontend-truth only.** The Python backend source is **not** in this repo.
  This doc states *what request the frontend sends and where it is wired* — it
  does **not** assert what the server does with it. Where a stream is noted, it
  is because the frontend parses newline-delimited JSON from the response body.
- `{backend}` = the resolved Python base URL (`BACKEND_URLS` in
  `lib/api/endpoints.ts`, env-driven).

_Last verified: 2026-06-14._

---

## 1. PDF upload — there are two distinct paths

### Path A — Cloud Files upload (`/files/upload`)
- **Code:** `features/files/api/files.ts:74` (`uploadFile`) /
  `features/files/api/files.ts:94` (`uploadFileWithProgress`), wrapped by
  `features/files/upload/cloudUpload.ts`.
- **Used by:** the `/files` browser (dropzone, New menu, mobile), and the PDF
  demo source picker (`features/pdf-demo/components/PdfSourcePicker.tsx` uploads
  here, then reuses the returned `file_id` for `/utilities/pdf/*` calls).

```
POST {backend}/files/upload          (multipart/form-data)

fields:
  file            (required)  the bytes
  file_path       (required)  full logical path incl. filename
  visibility      (optional)
  share_with      (optional)  comma-joined user ids
  share_level     (optional)
  change_summary  (optional)
  metadata_json   (optional)  JSON
  options_json    (optional)  JSON — only PDF/RAG-relevant knob seen in code:
                              { "rag": { "trigger_now": true } }
```
- Also sends `X-Request-Id`, reused as the idempotency key.

### Path B — PDF Extractor Studio (`/utilities/pdf/batch-extract`)
- **Code:** `features/pdf-extractor/hooks/usePdfExtractor.ts:413`.
- **This is the only PDF upload that does NOT use `/files/upload`.**

```
POST {backend}/utilities/pdf/batch-extract?max_concurrent=3   (multipart/form-data)

fields:
  files   (required, repeated — one append per file)

headers: auth only. No other form fields are sent by the frontend.
```

> **Convergence note for server team:** Path A sends a single `file` + rich
> metadata; Path B sends repeated `files` + nothing else, and only `?max_concurrent`.
> These are the two shapes to reconcile if we want one upload contract.

---

## 2. PDF processing endpoints actually called by the frontend

Each row is a confirmed call site. "Stream" = the frontend reads NDJSON
(newline-delimited JSON) from the response body.

### 2a. Text / table extraction
| Endpoint | Method / body | Call site |
|---|---|---|
| `/utilities/pdf/extract-text` | multipart `file` | `app/(dev)/demos/api-tests/pdf-extract/PdfExtractClient.tsx:69` |
| `/utilities/pdf/extract-text-remote` | JSON `{ ...source(media.file_id\|url), force_ocr, use_ocr_threshold, include_page_metadata, include_block_metadata, include_word_metadata }` | `app/(dev)/demos/pdf-processing/extract-text/page.tsx:30` |
| `/utilities/pdf/extract-tables` | JSON source + flags | `app/(dev)/demos/pdf-processing/extract-tables/page.tsx:27` |
| `/utilities/pdf/batch-extract` | (Path B upload, §1) | `features/pdf-extractor/hooks/usePdfExtractor.ts:413` |

### 2b. AI processing (all NDJSON streams)
| Endpoint | Method / body | Call site |
|---|---|---|
| `/utilities/pdf/clean-content/{docId}` | `POST`, **no body** | `features/pdf-extractor/service/streamPdf.ts:119` |
| `/utilities/pdf/full-pipeline` | JSON `{ media:{file_id}\|{url}, options:{ include_page_metadata, include_block_metadata, include_word_metadata, include_chunk_metadata, chunk_and_process_with_ai, template_name, force_ocr } }` | `features/pdf-extractor/service/streamPdf.ts:235` |
| `/page-extraction/runs/stream` | JSON `{ job_id, scope_pages?, chunk_size?, max_concurrent?, dry_run? }` | `features/page-extraction/api/stream.ts:36` |
| `/page-extraction/page-runs/{id}/retry` | `POST`, body `{}` | `features/page-extraction/api/stream.ts:79` |
| `/page-extraction/runs/{id}/cancel` | `POST`, body `{}` | `features/page-extraction/api/stream.ts:89` |

### 2c. Layout analysis
| Endpoint | Method / body | Call site |
|---|---|---|
| `/utilities/pdf/classify-pages` | JSON source | `app/(dev)/demos/pdf-processing/classify-pages/page.tsx:25` |
| `/utilities/pdf/detect-repeated-regions` | JSON source | `app/(dev)/demos/pdf-processing/detect-repeated-regions/page.tsx:35`, `features/file-analysis/studio/panels/RedactPanel.tsx:140` |
| `/utilities/pdf/extract-reading-order` | JSON source | `app/(dev)/demos/pdf-processing/extract-reading-order/page.tsx:25` |

### 2d. File-analysis / entities (PDF studio at `/files/f/{id}/studio`)
| Endpoint | Method / body | Call site |
|---|---|---|
| `/files/{id}/analysis/refresh` | JSON `{ force, only_stale, detectors, confidence_tiers }` | `features/file-analysis/tab/AnalysisTab.tsx:168` |
| `/files/{id}/analysis` | `GET` | `features/file-analysis/hooks/useFileAnalysis.ts:35` |
| `/files/{id}/entities` | `GET` | `features/file-analysis/content/EntitiesContent.tsx:49` |
| `/files/{id}/key-findings` | `GET` | `features/file-analysis/hooks/useKeyFindings.ts:39` |

> Many more file-analysis client wrappers exist in
> `features/file-analysis/api/file-analysis.ts` (annotations, regions, search,
> redaction, entity CRUD, find-similar, promote-to-entity). They are listed here
> only when a confirmed UI call site was found. The four above are the confirmed
> read/refresh calls.

### 2e. RAG (operates on a `cld_file` id — a PDF is just a file id here)
| Endpoint | Method / body | Call site |
|---|---|---|
| `/rag/ingest` | JSON `{ source_kind:"cld_file", source_id, force }` | `features/rag/api/ingest.ts:62` |
| `/rag/ingest/stream` | same body (NDJSON stream) | `features/rag/api/ingest.ts:128` |
| `/files/{id}/ingest` | JSON `{ force }` | `features/rag/api/rag-jobs.ts:79` |
| `/files/{id}/refresh` | `POST`, body `{}` | `features/rag/api/rag-jobs.ts:89` |
| `/files/{id}/rag-status` | `GET` | `features/rag/api/rag-jobs.ts:67` |

The `/utilities/pdf/extract-text-remote`, `extract-tables`, `classify-pages`,
`detect-repeated-regions`, and `extract-reading-order` JSON bodies share a
common `source` fragment built by `features/pdf/utils/source.ts` →
`{ media: { file_id } }` (or `{ url }`).

---

## 3. Defined but NOT called by the frontend
Present as a string constant in `lib/api/endpoints.ts` with **no call site
found** in the frontend:
- `/utilities/pdf/process-with-ai` (`endpoints.ts:223`)

(Other `ENDPOINTS.pdf.*` constants exist for page manipulation — crop, rotate,
delete, merge, split, reorder, insert, duplicate, render, scrub, strip-metadata,
redact-*, flatten-annotations — but those are out of scope for this doc.)

---

## 4. Open questions / convergence candidates for the server team
1. **Two upload contracts.** `/files/upload` (single `file` + metadata +
   `options_json`) vs `/utilities/pdf/batch-extract` (repeated `files`, no
   metadata). Can the extractor upload reuse `/files/upload` (so PDFs from the
   extractor land in the `/files` tree with the same metadata + RAG hooks), or
   should `batch-extract` accept the same metadata fields?
2. **`source` shape.** The `/utilities/pdf/*` JSON endpoints take
   `{ media: { file_id | url } }`. Confirm this is the single accepted source
   shape (an older `{ cld_id }` shape is noted in code comments as having been
   dropped — verify on the server).
3. **Two RAG entry points.** `/rag/ingest(+/stream)` (generic `source_kind`)
   vs `/files/{id}/ingest`/`/refresh`/`/rag-status` (file-scoped). Confirm which
   is canonical for a PDF `cld_file`.
4. **`process-with-ai`** — is this endpoint live? It has no frontend caller; if
   deprecated, we can drop the constant.
