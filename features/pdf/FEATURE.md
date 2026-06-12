# PDF — the document domain feature

**Status:** Active consolidation (2026-06). One canonical home for every PDF concept; the studios are surfaces, not features.
**The rule that created this feature:** `features/pdf-extractor`, `features/pdf-demo`, and the PDF parts of `features/file-analysis` were never features — they are *surfaces* of this one domain. New PDF capability lands HERE; surfaces compose it. Never add a sibling `features/pdf-*`.

## Canonical parts (use these; never re-create)

| Need | Use | Path |
|---|---|---|
| Call any `/utilities/pdf/*` endpoint | `usePdfClient` (typed; 422-aware errors; blob/JSON content-type guard) | `api/client.ts` |
| Build a request source | `buildPdfSource` / `buildSecondSource` — **`media:{file_id}`, never `cld_id`** (the keystone bug class) | `utils/source.ts` |
| Parse "1,3-5" page ranges | `parsePagesInput` | `utils/pages.ts` |
| Render a PDF | `PdfDocumentRenderer` (THE viewer) / `PdfPreview` wrapper | `components/viewer/` |
| Region overlays on a page | annotation layer (all 4 rotations verified) | `components/viewer/annotation-layer/` |
| Jump between surfaces | `PdfSurfaceSwitcher` + registry (add a surface = one registry entry, every menu updates) | `components/PdfSurfaceSwitcher.tsx`, `surfaces/registry.ts` |
| Resolve fileId ↔ processedDocumentId | `usePdfSurfaceLinks` (bridge-backed, cached) | `hooks/usePdfSurfaceLinks.ts` |
| Download a result blob | `useDownloadBlob` (tracked URLs, unmount revocation) | `hooks/useDownloadBlob.ts` |
| Persist a derived PDF with lineage | `saveDerivative` (fileHandler upload + `processed_documents` row) | `services/saveDerivative.ts` |
| Studio preset catalog UI | `PdfPresetPicker` (catalog from `GET studio/presets`; ids are backend-owned) | `components/PdfPresetPicker.tsx` |
| Compress with metadata | `usePdfOptimize` | `hooks/usePdfOptimize.ts` |
| Tokened inline URL for a cld PDF | `usePdfRemoteSource` | `hooks/usePdfRemoteSource.ts` |

Old import paths under `features/files/**` and `features/pdf-demo/**` are transitional re-export shims — replace opportunistically, never add new consumers.

## Data model — the bridge (2026-06-11)

One physical PDF = `cld_files` row. Two derived families, now sharing identity:
- **Extractor:** `processed_documents` (clean_content, lineage via `parent_processed_id`) → `processed_document_pages` (raw/clean text, blocks/words, `is_continuation`, sections — the fidelity-rich canonical page table).
- **Analysis:** `file_pages` (user decisions: exclude/rotate/override, thumbnails) → `file_analysis_result`, `file_page_annotations`.
- **The bridge:** `cld_files.canonical_processed_document_id` (backfilled 27/27; trigger-maintained: new docs fill empty bridges, new pages auto-link `file_pages.processed_document_page_id`, new file_pages self-resolve). **One read perspective:** `public.pdf_unified_pages` (security-invoker view).
- **Redaction compliance:** every redaction writes `pdf_redaction_audits` (applied + wired 2026-06-11); reversible spans in `redaction_mapping` (client-held AES keys); `pdf_redaction_key_escrow` is the org-recovery data model — **write path intentionally unwired pending the security team's KMS interface** (keys must be wrapped, never raw).

## Surfaces (consumers of this feature)

`/tools/pdf-extractor[/[id]]` (extractor studio + window-panel) · `/files/f/[id]` (viewer tabs) · `/files/f/[id]/studio` (Analysis Studio; mobile = stacked layout) · `/demos/ssr/pdf-processing/*` (27 live API test pages) · RAG `PdfPane` · code-editor preview · public-chat optimize prompt. All reachable from each other via `PdfSurfaceSwitcher`.

## Invariants

- Sources go through `buildPdfSource` — raw `media`/`cld_id` literals are the bug class that broke the platform (Pydantic silently drops unknown fields; `extra="allow"`).
- Pages are 1-based everywhere on the wire.
- `persist_output=true` switches binary endpoints to a JSON envelope — `usePdfClient.postPdfBlob` guards content-type so an envelope/error can't masquerade as a PDF.
- Derivative ops NEVER mutate the source file; UIs must say so (ConfirmDialog + note pattern, see ManipulationPanel/PagesPanel).
- In-place page ops (`rotate/exclude/include` via file_analysis router) are metadata-only on `file_pages`; callers refetch after success.
- Uploads only via `fileHandler`; no `supabase.storage` here.
- Backend preset/pattern/region ids are stable contract strings — never hardcode FE copies.

## Known gaps / roadmap (audit 2026-06-11, plan: `~/.claude/plans/feature-deep-dive-audit-rustling-hare.md`)

- W5-L: reader virtualization (500-page docs mount all blocks); streamed ZIPs for render-all/split; **resumable per-page job model** for AI clean/extract >200pp (resume-from-last-page preserving overlap — the Operational Default).
- W4 remainder: reading-order viewer tab; per-pattern `substitute_formats` overrides.
- Never-built roadmap (vision docs): figure/image extraction with RAG tokens, OCRmyPDF searchable-PDF, cloud-OCR + ML layout providers (`pdf/ml`, `cloud_ocr` stubs), `pdf/generate`.
- Verify aidream variant pipeline renders PDF page-1 thumbnails (FE grid path already prefers `thumbnailUrl`).

## Change Log
- 2026-06-11 — **Missing-source hardening.** `usePdfRemoteSource` now does a single PK health probe on `cld_files` and returns `sourceMissing` when the row is absent or soft-deleted (the failure class introduced by the 2026-05 AWS migration, which trashed original binaries while leaving extracted text intact). Both the app-wide `PdfPreview` and the PDF-Studio `cld_file` viewer render the new `PdfSourceUnavailable` panel instead of pdfjs's raw "Failed to fetch" card. PDF-Studio list (`usePdfStudioDocs`) and legacy workspace (`usePdfExtractor.loadHistory`) now exclude `archived_at` docs and the studio sidebar flags any remaining `sourceMissing` doc ("Original file removed · text only"). Data: the 10 dangling Studio docs for the affected owner were archived (reversible, text preserved) rather than deleted.
- 2026-06-11 — Feature created from the consolidation build: keystone `cld_id`→`file_id` fix; canonical client/source/pages/download/saveDerivative parts; viewer family moved in from features/files; surface switcher + registry; W2 bridge + unified view + redaction audits/escrow migrations; detect→redact one-flow; preset picker; detector prefs end-to-end; deep-link self-heal; mobile Analysis Studio; reliability floor (stream cancellation, abort/timeout, transactional clears, per-doc locks, resource bounds).
