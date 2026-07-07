// app/(core)/tools/pdf-extractor/admin/page.tsx
//
// Per-feature admin map for the PDF domain (`features/pdf/` — the one
// canonical home; extractor / analysis / scanner / demos are surfaces of
// it, never sibling features). Renders via the platform primitive
// `<FeatureAdminPage>` (admin-gated, utilitarian). The config below is
// the single source of truth for every PDF resource: studio + scanner
// routes, the Analysis Studio under `/files/f/`, the extractor window
// panel, the canonical parts (client / source builder / viewer /
// switcher / saveDerivative / scanner), the 27 endpoint test pages under
// `(dev)/demos/pdf-processing/`, and the Python `/utilities/pdf/*` +
// `/images/detect-document` endpoint surface. When you add a PDF route /
// panel / component / endpoint, update this file — the drift warnings on
// the rendered page surface anything missed.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const PDF_ADMIN_MAP: FeatureAdminMap = {
  name: "PDF",
  slug: "pdf",
  baseUrl: "/tools/pdf-extractor",
  description:
    "The document domain: viewing, extraction, AI cleaning, page ops, layout analysis, redaction, phone scanning, and derivative lineage. One canonical home (features/pdf/) — the Extractor Studio, Analysis Studio, phone scanner, file-viewer tabs, RAG Source Inspector, and demo pages are all surfaces composing the same parts, cross-linked via PdfSurfaceSwitcher. All /utilities/pdf/* and /images/* endpoints below live on the Python backend (server.app.matrxserver.com), not Next.js routes; the FE contract is ENDPOINTS.pdf in lib/api/endpoints.ts, transported by usePdfClient.",
  docs: [
    { label: "PDF FEATURE.md", href: "/features/pdf/FEATURE.md" },
    { label: "Extractor API.md", href: "/features/pdf-extractor/API.md" },
    {
      label: "File handler FEATURE.md (uploads)",
      href: "/features/files/handler/FEATURE.md",
    },
  ],
  routeScanPath: "app/(core)/tools/pdf-extractor",

  routes: [
    {
      url: "/tools/pdf-extractor",
      label: "Extractor Studio (list + upload)",
      description:
        "Doc list sidebar + upload hero. Batch extraction, AI clean, full pipeline. Routes to the first finished doc mid-stream.",
      filePath: "app/(core)/tools/pdf-extractor/page.tsx",
      status: "Live",
    },
    {
      url: "/tools/pdf-extractor/<id>",
      label: "Extractor Studio — reader",
      description:
        "Per-document reader: raw/clean panes, page nav, AI clean streaming, pipeline re-runs, rename, file menus.",
      filePath: "app/(core)/tools/pdf-extractor/[id]/page.tsx",
      status: "Live",
    },
    {
      url: "/tools/scanner",
      label: "Phone scanner",
      description:
        "Camera / library / file picks → immediate durable uploads → QuadEditor crop → one PDF via POST /utilities/pdf/from-images → extraction pipeline.",
      filePath: "app/(core)/tools/scanner/page.tsx",
      status: "Live",
      notes: [
        "Every add uploads immediately to system-files/scanner/{sessionId}",
        "localStorage manifest + Resume banner; Save blocked until all uploaded",
        "Crop quads applied server-side at build time; originals never mutated",
      ],
    },
    {
      url: "/files/f/<fileId>/studio",
      label: "Analysis Studio",
      description:
        "Per-file workbench on the files route tree: pages grid, detectors, annotations, redaction, doc ops. Mobile = stacked layout.",
      filePath: "app/(core)/files/f/[fileId]/studio/page.tsx",
      status: "Live",
    },
    {
      url: "/files/f/<fileId>",
      label: "File viewer (PDF tabs)",
      description:
        "The general file viewer — PDF files get preview / edit / analysis / knowledge tabs composing the same canonical parts.",
      filePath: "app/(core)/files/f/[fileId]/page.tsx",
      status: "Live",
    },
    {
      url: "/tools/pdf-extractor/admin",
      label: "Admin map (this page)",
      description: "Admin index of every PDF resource.",
      filePath: "app/(core)/tools/pdf-extractor/admin/page.tsx",
      status: "Live",
    },
  ],

  windowPanels: [
    {
      overlayId: "pdfExtractorWindow",
      description:
        "Floating-window extractor workspace (PdfExtractorWorkspace) — same pipeline as /tools/pdf-extractor, draggable / resizable / persistable.",
    },
    {
      overlayId: "sourceInspectorWindow",
      description:
        "RAG-owned citation surface (features/rag/components/source-inspector/) — renders PdfPreview at the cited page beside the page's extraction + matched chunk. Composes PDF parts, never forks them.",
    },
  ],

  components: [
    {
      name: "usePdfClient",
      filePath: "features/pdf/api/client.ts",
      description:
        "THE typed transport for every /utilities/pdf/* call — 422-aware errors, Content-Disposition filename parse, JSON-vs-blob content-type guard.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "buildPdfSource / buildSecondSource",
      filePath: "features/pdf/utils/source.ts",
      description:
        "The ONLY way to build a request source (media.file_id, never cld_id — the keystone bug class).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "parsePagesInput",
      filePath: "features/pdf/utils/pages.ts",
      description: "Parses '1,3-5' page-range strings (1-based on the wire).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "PdfDocumentRenderer",
      filePath: "features/pdf/components/viewer/PdfDocumentRenderer.tsx",
      description: "THE PDF viewer. Every surface renders through it.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "PdfPreview",
      filePath: "features/pdf/components/viewer/PdfPreview.tsx",
      description:
        "App-wide preview wrapper over PdfDocumentRenderer (controlled pageNumber, missing-source panel).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "Annotation layer",
      filePath: "features/pdf/components/viewer/annotation-layer/",
      description:
        "Region overlays on a rendered page — all 4 rotations verified.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "PdfSourceUnavailable",
      filePath: "features/pdf/components/viewer/PdfSourceUnavailable.tsx",
      description:
        "Missing/deleted-source panel (the 2026-05 AWS-migration failure class) instead of pdfjs's raw fetch error.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "PdfSurfaceSwitcher + surfaces registry",
      filePath: "features/pdf/components/PdfSurfaceSwitcher.tsx",
      description:
        "Jump between surfaces (file viewer / Analysis Studio / extractor / RAG library). Add a surface = one entry in surfaces/registry.ts; every menu updates.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "usePdfSurfaceLinks",
      filePath: "features/pdf/hooks/usePdfSurfaceLinks.ts",
      description:
        "Resolves fileId ↔ processedDocumentId via the cld_files.canonical_processed_document_id bridge (cached).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "useDownloadBlob",
      filePath: "features/pdf/hooks/useDownloadBlob.ts",
      description:
        "Download a result blob — tracked object URLs, unmount revocation.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "usePdfOptimize",
      filePath: "features/pdf/hooks/usePdfOptimize.ts",
      description: "Compress with metadata (level tiers + size cap headers).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "usePdfRemoteSource",
      filePath: "features/pdf/hooks/usePdfRemoteSource.ts",
      description:
        "Tokened inline URL for a cld PDF + single PK health probe → sourceMissing when the row is gone.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "saveDerivative",
      filePath: "features/pdf/services/saveDerivative.ts",
      description:
        "Persist a derived PDF with lineage — fileHandler upload + processed_documents row. Also backs the reader's crop/reorder saves.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "PdfPresetPicker",
      filePath: "features/pdf/components/PdfPresetPicker.tsx",
      description:
        "Studio preset catalog UI (GET studio/presets; ids are backend-owned contract strings).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "useScanSession",
      filePath: "features/pdf/scanner/useScanSession.ts",
      description:
        "Phone-scanner session: immediate-upload durability, resume manifest, reorder, per-item crops.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "QuadEditor",
      filePath: "features/pdf/scanner/components/QuadEditor.tsx",
      description:
        "4-corner perspective-crop overlay — natural-pixel quads in post-EXIF-transpose space.",
      status: "Live",
      tier: "internal",
    },
    {
      name: "ScannerSurface",
      filePath: "features/pdf/scanner/components/ScannerSurface.tsx",
      description:
        "The scan route body: capture / review / crop / save flow (CaptureView, ReviewList, CropSheet, SaveSheet).",
      status: "Live",
      tier: "internal",
    },
    {
      name: "PdfAiContent",
      filePath: "features/pdf-extractor/components/PdfAiContent.tsx",
      description:
        "Renders AI output (clean / pipeline, streaming + final) through MarkdownStream with ThinkingTrace — never raw <pre>.",
      status: "Live",
      tier: "internal",
    },
  ],

  apiRoutes: [
    // ── Lifecycle ──────────────────────────────────────────────────────────
    {
      url: "/utilities/pdf/compress",
      method: "POST",
      description:
        "Compress (multipart; level 1-5 + optional max_size_mb cap; X-Compression-* result headers).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/extract-text",
      method: "POST",
      description: "Single-file stateless text extraction (legacy multipart).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/batch-extract",
      method: "POST",
      description:
        "Batch extraction, NDJSON streaming — saves processed_documents + pages.",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/from-images",
      method: "POST",
      description:
        "Phone-scanner assembly (NDJSON): ordered photos + quads → ONE user PDF in Scans/ → extraction → {file_id, doc_id}.",
      filePath: "lib/api/endpoints.ts",
    },
    // ── MediaRef JSON ops ──────────────────────────────────────────────────
    {
      url: "/utilities/pdf/extract-text-remote",
      method: "POST",
      description: "Text extraction from a remote source (MediaRef / url).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/extract-tables",
      method: "POST",
      description: "Table extraction.",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/extract-pages",
      method: "POST",
      description: "Extract pages into a new PDF (blob).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/crop-pages",
      method: "POST",
      description: "Crop pages by crop_box (blob).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/rotate-pages",
      method: "POST",
      description: "Rotate pages (blob).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/delete-pages",
      method: "POST",
      description: "Delete pages (blob).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/merge",
      method: "POST",
      description: "Merge multiple PDFs (blob).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/split",
      method: "POST",
      description: "Split into parts (ZIP blob).",
      filePath: "lib/api/endpoints.ts",
    },
    // ── AI pipelines (streaming JSONL) ─────────────────────────────────────
    {
      url: "/utilities/pdf/process-with-ai",
      method: "POST",
      description:
        "AI processing (single-pass / chunk / reassembly), streams JSONL.",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/full-pipeline",
      method: "POST",
      description: "Extract → chunk → AI → reassembly, streams JSONL.",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/clean-content/<docId>",
      method: "POST",
      description:
        "AI content cleaning on an already-extracted doc (NDJSON streaming).",
      filePath: "lib/api/endpoints.ts",
    },
    // ── Document management (deprecated — read Supabase directly) ─────────
    {
      url: "/utilities/pdf/documents",
      method: "GET",
      description:
        "DEPRECATED list — the workspace reads processed_documents directly from Supabase.",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/documents/<docId>",
      method: "GET",
      description: "DEPRECATED detail — read Supabase directly.",
      filePath: "lib/api/endpoints.ts",
    },
    // ── Render & advanced page ops ─────────────────────────────────────────
    {
      url: "/utilities/pdf/render-page",
      method: "POST",
      description: "Render one page to an image blob (PNG/JPEG/WebP/TIFF).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/render-all",
      method: "POST",
      description: "Render every page (ZIP of per-page images).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/render-thumbnail",
      method: "POST",
      description: "Cover thumbnail at max_side px.",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/reorder-pages",
      method: "POST",
      description: "Reorder pages by new_order (blob).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/insert-pages",
      method: "POST",
      description: "Insert pages from a second source (blob).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/duplicate-pages",
      method: "POST",
      description: "Duplicate pages inline, count copies (blob).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/studio/presets",
      method: "GET",
      description: "Studio preset catalog (backend-owned preset ids).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/studio/render",
      method: "POST",
      description: "Studio dispatcher — image blob or ZIP depending on preset.",
      filePath: "lib/api/endpoints.ts",
    },
    // ── Layout analysis ────────────────────────────────────────────────────
    {
      url: "/utilities/pdf/detect-repeated-regions",
      method: "POST",
      description: "Detect headers / footers / watermarks / recurring notes.",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/strip-repeated-regions",
      method: "POST",
      description: "Detect + strip repeated regions from per-page text.",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/classify-pages",
      method: "POST",
      description:
        "Classify every page (cover / TOC / body / exhibit / signature / billing / ...).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/extract-reading-order",
      method: "POST",
      description: "Multi-column → linear reading order.",
      filePath: "lib/api/endpoints.ts",
    },
    // ── Redaction & privacy ────────────────────────────────────────────────
    {
      url: "/utilities/pdf/redact/patterns",
      method: "GET",
      description:
        "Builtin redaction pattern catalog (SSN / email / phone / MRN / ...).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/redact-regions",
      method: "POST",
      description:
        "Redact page-anchored rectangles. Every redaction writes pdf_redaction_audits.",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/redact-pattern",
      method: "POST",
      description: "Redact every regex match (builtin id or raw pattern).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/redact-repeated-regions",
      method: "POST",
      description: "Detect repeated regions then redact selected/all.",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/strip-metadata",
      method: "POST",
      description: "Wipe /Info + XMP metadata + thumbnails.",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/scrub",
      method: "POST",
      description:
        "Granular composite scrub (metadata / attachments / JS / flatten).",
      filePath: "lib/api/endpoints.ts",
    },
    {
      url: "/utilities/pdf/flatten-annotations",
      method: "POST",
      description: "Bake annotations + widgets into page content.",
      filePath: "lib/api/endpoints.ts",
    },
    // ── Images (scanner) ───────────────────────────────────────────────────
    {
      url: "/images/detect-document",
      method: "POST",
      description:
        "cv2 document-boundary detection for the phone scanner — returns the quad drawn by QuadEditor.",
      filePath: "features/pdf/scanner/api.ts",
    },
  ],

  reduxSlices: [
    {
      name: "pdfStudioSlice",
      filePath: "features/pdf-extractor/state/pdfStudioSlice.ts",
      description:
        "Extractor studio UI state: active doc + page, scroll sync source, per-doc pane prefs (view/edit mode, sidebar view), chunk rows. Persistence + thunks live beside it in state/.",
    },
  ],

  demoRoutes: [
    {
      url: "/demos/pdf-processing",
      label: "PDF processing index",
      description: "Auto-discovered index of every endpoint test page below.",
      filePath: "app/(dev)/demos/pdf-processing/page.tsx",
    },
    {
      url: "/demos/pdf-processing/components",
      label: "Canonical components bench",
      description:
        "Unit-test bench mounting THE production components (PdfPreview, edit/knowledge/analysis tabs, switcher, preset picker) against one picked PDF.",
      filePath: "app/(dev)/demos/pdf-processing/components/page.tsx",
    },
    {
      url: "/demos/pdf-processing/studio",
      label: "Studio presets",
      description: "studio/presets catalog + studio/render dispatcher test.",
      filePath: "app/(dev)/demos/pdf-processing/studio/page.tsx",
    },
    {
      url: "/demos/pdf-processing/compress",
      label: "Compress",
      description: "Level tiers + size-cap compression test.",
      filePath: "app/(dev)/demos/pdf-processing/compress/page.tsx",
    },
    {
      url: "/demos/pdf-processing/extract-text",
      label: "Extract text",
      description: "extract-text-remote test.",
      filePath: "app/(dev)/demos/pdf-processing/extract-text/page.tsx",
    },
    {
      url: "/demos/pdf-processing/extract-tables",
      label: "Extract tables",
      description: "Table extraction test.",
      filePath: "app/(dev)/demos/pdf-processing/extract-tables/page.tsx",
    },
    {
      url: "/demos/pdf-processing/extract-pages",
      label: "Extract pages",
      description: "Page-subset → new PDF test.",
      filePath: "app/(dev)/demos/pdf-processing/extract-pages/page.tsx",
    },
    {
      url: "/demos/pdf-processing/crop-pages",
      label: "Crop pages",
      description: "crop_box test.",
      filePath: "app/(dev)/demos/pdf-processing/crop-pages/page.tsx",
    },
    {
      url: "/demos/pdf-processing/rotate-pages",
      label: "Rotate pages",
      description: "Rotation test.",
      filePath: "app/(dev)/demos/pdf-processing/rotate-pages/page.tsx",
    },
    {
      url: "/demos/pdf-processing/delete-pages",
      label: "Delete pages",
      description: "Page deletion test.",
      filePath: "app/(dev)/demos/pdf-processing/delete-pages/page.tsx",
    },
    {
      url: "/demos/pdf-processing/merge",
      label: "Merge",
      description: "Multi-PDF merge test.",
      filePath: "app/(dev)/demos/pdf-processing/merge/page.tsx",
    },
    {
      url: "/demos/pdf-processing/split",
      label: "Split",
      description: "Split-to-ZIP test.",
      filePath: "app/(dev)/demos/pdf-processing/split/page.tsx",
    },
    {
      url: "/demos/pdf-processing/reorder-pages",
      label: "Reorder pages",
      description: "new_order test.",
      filePath: "app/(dev)/demos/pdf-processing/reorder-pages/page.tsx",
    },
    {
      url: "/demos/pdf-processing/insert-pages",
      label: "Insert pages",
      description: "Second-source insert test.",
      filePath: "app/(dev)/demos/pdf-processing/insert-pages/page.tsx",
    },
    {
      url: "/demos/pdf-processing/duplicate-pages",
      label: "Duplicate pages",
      description: "Inline duplication test.",
      filePath: "app/(dev)/demos/pdf-processing/duplicate-pages/page.tsx",
    },
    {
      url: "/demos/pdf-processing/render-page",
      label: "Render page",
      description: "Single-page image render test.",
      filePath: "app/(dev)/demos/pdf-processing/render-page/page.tsx",
    },
    {
      url: "/demos/pdf-processing/render-all",
      label: "Render all",
      description: "All-pages ZIP render test.",
      filePath: "app/(dev)/demos/pdf-processing/render-all/page.tsx",
    },
    {
      url: "/demos/pdf-processing/render-thumbnail",
      label: "Render thumbnail",
      description: "Cover thumbnail test.",
      filePath: "app/(dev)/demos/pdf-processing/render-thumbnail/page.tsx",
    },
    {
      url: "/demos/pdf-processing/classify-pages",
      label: "Classify pages",
      description: "Layout classification test.",
      filePath: "app/(dev)/demos/pdf-processing/classify-pages/page.tsx",
    },
    {
      url: "/demos/pdf-processing/extract-reading-order",
      label: "Extract reading order",
      description: "Multi-column linearization test.",
      filePath: "app/(dev)/demos/pdf-processing/extract-reading-order/page.tsx",
    },
    {
      url: "/demos/pdf-processing/detect-repeated-regions",
      label: "Detect repeated regions",
      description: "Header / footer / watermark detection test.",
      filePath:
        "app/(dev)/demos/pdf-processing/detect-repeated-regions/page.tsx",
    },
    {
      url: "/demos/pdf-processing/strip-repeated-regions",
      label: "Strip repeated regions",
      description: "Detect + strip from per-page text test.",
      filePath:
        "app/(dev)/demos/pdf-processing/strip-repeated-regions/page.tsx",
    },
    {
      url: "/demos/pdf-processing/redact-regions",
      label: "Redact regions",
      description: "Rectangle redaction test.",
      filePath: "app/(dev)/demos/pdf-processing/redact-regions/page.tsx",
    },
    {
      url: "/demos/pdf-processing/redact-pattern",
      label: "Redact pattern",
      description: "Regex / builtin-pattern redaction test.",
      filePath: "app/(dev)/demos/pdf-processing/redact-pattern/page.tsx",
    },
    {
      url: "/demos/pdf-processing/redact-repeated-regions",
      label: "Redact repeated regions",
      description: "Detect-then-redact test.",
      filePath:
        "app/(dev)/demos/pdf-processing/redact-repeated-regions/page.tsx",
    },
    {
      url: "/demos/pdf-processing/strip-metadata",
      label: "Strip metadata",
      description: "/Info + XMP wipe test.",
      filePath: "app/(dev)/demos/pdf-processing/strip-metadata/page.tsx",
    },
    {
      url: "/demos/pdf-processing/scrub",
      label: "Scrub",
      description: "Composite scrub test.",
      filePath: "app/(dev)/demos/pdf-processing/scrub/page.tsx",
    },
    {
      url: "/demos/pdf-processing/flatten-annotations",
      label: "Flatten annotations",
      description: "Annotation / widget baking test.",
      filePath: "app/(dev)/demos/pdf-processing/flatten-annotations/page.tsx",
    },
  ],

  relatedFeatures: [
    {
      name: "Files",
      description:
        "cld_files owns the physical PDFs; uploads go through fileHandler; the viewer + Analysis Studio live on the /files/f/ route tree.",
    },
    {
      name: "RAG / Knowledge",
      description:
        "Extracted pages feed chunking + data stores; the Source Inspector and rag-library surface land on cited pages via the bridge.",
    },
    {
      name: "Page extraction",
      adminUrl: "/knowledge/extractions/admin",
      description:
        "Per-page AI fan-out over processed_documents — persists structured results anchored to source pages.",
    },
  ],
};

export default function PdfAdminPage() {
  return <FeatureAdminPage map={PDF_ADMIN_MAP} />;
}
