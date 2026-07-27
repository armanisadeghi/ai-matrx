/**
 * Surface manifest — Document Scanner (`matrx-user/scanner`).
 *
 * Route: `/tools/scanner`. Capture photos (or import images / PDFs) → crop,
 * rotate, enhance, reorder → assemble ONE PDF → hand off to the extractor
 * pipeline and land on `/tools/pdf-extractor/{doc_id}`. Two skins (mobile
 * capture-first, desktop sidebar) over ONE engine — `useScanSession` +
 * `useScanSaveFlow` — so both emit the identical scope.
 *
 * Agents bound here act on the IN-PROGRESS scan (items, labels, upload
 * status) or, after Save, on the pipeline's live progress. Parent:
 * `matrx-user/pdf-extractor`. The parent's document-text vocabulary is
 * inherited but the scanner never loads extracted body text — those keys
 * are re-declared here as `alwaysAvailable: false` so the scope helper
 * cannot promise something this surface can't deliver.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/**
 * The scanner's own sections. Parent group keys are NOT declared here —
 * inherited values auto-collapse into `inherited:matrx-user/pdf-extractor`.
 */
const groups: SurfaceValueGroup[] = [
  { key: "scan_session", label: "Scan session", sortOrder: 100 },
  { key: "scan_pages", label: "Captured pages", sortOrder: 200 },
  { key: "scan_output", label: "Saved output", sortOrder: 300 },
  { key: "scan_pipeline", label: "Processing progress", sortOrder: 400 },
  { key: "scan_unavailable", label: "Not populated here", sortOrder: 700 },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Session (100-199) ────────────────────────────────────────────────
  {
    name: "scan_session_id",
    label: "Scan session ID",
    description:
      "Local id of the scan session. Every captured page uploads under `system-files/scanner/{scan_session_id}`, and the resumable manifest is keyed on it. Always populated — the session id is minted on mount.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "scan_session",
    sortOrder: 100,
  },
  {
    name: "scan_title",
    label: "Scan title",
    description:
      'User-editable title of the scan session, used as the saved PDF\'s name. Empty until the user types one or Save auto-fills the "Scan <date> <time>" default.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    group: "scan_session",
    sortOrder: 110,
  },
  {
    name: "scan_resumable",
    label: "Resumable scan available",
    description:
      "True when an unsaved scan manifest from a previous visit was found in local storage and the resume prompt is offered. False in a fresh session.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "scan_session",
    sortOrder: 120,
  },
  {
    name: "scan_session_summary",
    label: "Scan session summary",
    description:
      "Composite of the whole in-progress scan: `{ scan_session_id, scan_title, page_count, uploading_count, error_count, all_uploaded }`. One binding for everything an agent needs to describe or gate on the session. Always populated.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 220,
    group: "scan_session",
    sortOrder: 130,
  },

  // ── Captured pages (200-299) ─────────────────────────────────────────
  {
    name: "scan_page_count",
    label: "Scan page count",
    description:
      "Number of pages currently in the scan review list (captures + imports). Zero before the user adds anything.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "scan_pages",
    sortOrder: 200,
  },
  {
    name: "scan_uploading_count",
    label: "Pages still uploading",
    description:
      "How many captured pages have an in-flight immediate upload. Zero when every page is durable server-side — Save is blocked while this is non-zero.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "scan_pages",
    sortOrder: 210,
  },
  {
    name: "scan_error_count",
    label: "Pages with upload errors",
    description:
      "How many captured pages failed their upload and are waiting on a retry. Zero in the healthy case; non-zero means the user has visible failures to resolve.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "scan_pages",
    sortOrder: 220,
  },
  {
    name: "scan_all_uploaded",
    label: "All pages uploaded",
    description:
      "True when every page in the session has reached `uploaded` status, i.e. the scan is safe to save. False while anything is uploading or errored.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "scan_pages",
    sortOrder: 230,
  },
  {
    name: "scan_items",
    label: "Captured page list",
    description:
      "Every page in the session, in output order, as `{ index, kind, source, file_name, label, status, cropped, rotation, enhance }`. Empty array before the user captures anything. Bindable only — noisy for automatic context on a long scan.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1600,
    autoContext: false,
    group: "scan_pages",
    sortOrder: 240,
  },
  {
    name: "scan_page_labels",
    label: "Page labels",
    description:
      "The user's per-page display names, in output order. Empty strings for pages they have not renamed; empty array before any capture. This is the user's own description of what each page IS.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 300,
    group: "scan_pages",
    sortOrder: 250,
  },
  {
    name: "scan_source_counts",
    label: "Capture source counts",
    description:
      "How the pages entered the session: `{ camera, file }`. Both zero before any capture. Distinguishes a live phone scan from an import of existing files.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "scan_pages",
    sortOrder: 260,
  },

  // ── Saved output (300-399) ───────────────────────────────────────────
  {
    name: "file_id",
    label: "Saved file ID",
    description:
      "UUID of the `cld_files` row for the assembled PDF. Empty until the save stream returns — i.e. empty for the whole capture/review phase.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "scan_output",
    sortOrder: 300,
  },
  {
    name: "processed_document_id",
    label: "Processed document ID",
    description:
      "UUID of the `processed_documents` derivative created by the extractor pipeline after save. Empty until the pipeline hands it back.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "scan_output",
    sortOrder: 310,
  },
  {
    name: "filename",
    label: "Output filename",
    description:
      "Filename of the saved PDF (derived from `scan_title`). Empty before save completes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    group: "scan_output",
    sortOrder: 320,
  },
  {
    name: "total_pages",
    label: "Output page count",
    description:
      "Page count of the assembled PDF as reported by the save stream. Zero before save — imported multi-page PDFs mean this can exceed `scan_page_count`.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "scan_output",
    sortOrder: 330,
  },

  // ── Processing progress (400-499) ────────────────────────────────────
  {
    name: "scan_processing_stage",
    label: "Processing stage",
    description:
      'Which post-save step is in flight: "build", "ocr", "clean", "entities", or "done". Empty while the user is still capturing/reviewing (nothing has been saved yet).',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "scan_pipeline",
    sortOrder: 400,
  },
  {
    name: "scan_processing_detail",
    label: "Processing detail",
    description:
      'The live status line shown under the current step, e.g. "Read page 3 of 8". Empty when nothing is processing.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "scan_pipeline",
    sortOrder: 410,
  },
  {
    name: "scan_processed_pages",
    label: "Processed page ledger",
    description:
      "Per-page results streamed back during processing as `{ page, chars, method, title, kind, cleaned }` — `method` is `native` or `ocr`. Empty array before/outside a save. The best evidence of whether OCR quality is acceptable.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 900,
    group: "scan_pipeline",
    sortOrder: 420,
  },
  {
    name: "scan_raw_preview",
    label: "Extracted text preview",
    description:
      "First ~220 characters of the extracted text of the saved scan, streamed back as the pipeline runs. Empty before/outside a save. Enough to sanity-check the OCR without loading the document.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 220,
    group: "scan_pipeline",
    sortOrder: 430,
  },

  // ── Inherited keys the scanner genuinely cannot populate ─────────────
  // The parent guarantees these; the scanner has no reader and no
  // extracted text, so re-declaring them `alwaysAvailable: false` keeps
  // the scope helper honest. Generic agents resolve empty, never fail.
  {
    name: "full_document_text",
    label: "Full document text (not loaded here)",
    description:
      "Inherited from PDF Extractor. The scanner assembles a PDF, it never loads the extracted body — always empty here. Use `scan_raw_preview` for a taste, or the extractor surface for the real thing.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 0,
    autoContext: false,
    group: "scan_unavailable",
    sortOrder: 700,
  },
  {
    name: "current_page_text",
    label: "Current page text (not loaded here)",
    description:
      "Inherited from PDF Extractor. There is no text reader in the scanner — always empty here.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 0,
    autoContext: false,
    group: "scan_unavailable",
    sortOrder: 710,
  },
  {
    name: "active_scope_text",
    label: "Selected scope content (not loaded here)",
    description:
      "Inherited from PDF Extractor's scope picker, which does not exist in the scanner — always empty here.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 0,
    autoContext: false,
    group: "scan_unavailable",
    sortOrder: 720,
  },
  {
    name: "current_page",
    label: "Current page number (not applicable here)",
    description:
      "Inherited from PDF Extractor. The scanner has a review grid, not a paged reader — always zero here.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    autoContext: false,
    group: "scan_unavailable",
    sortOrder: 730,
  },
  {
    name: "scope_kind",
    label: "Scope kind (not applicable here)",
    description:
      "Inherited from PDF Extractor. There is no scope picker in the scanner — always empty here.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 0,
    autoContext: false,
    group: "scan_unavailable",
    sortOrder: 740,
  },
  {
    name: "using_clean_text",
    label: "Using AI-cleaned text (not applicable here)",
    description:
      "Inherited from PDF Extractor. The scanner sources no extracted text — always false here.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    autoContext: false,
    group: "scan_unavailable",
    sortOrder: 750,
  },
];

export const scannerManifest: SurfaceManifest = {
  surfaceName: "matrx-user/scanner",
  readiness: "verified",
  inheritsFrom: "matrx-user/pdf-extractor",
  label: "Scanner",
  urlPattern: "/tools/scanner",
  intro: `<surface_intro>
The Scanner is the phone-and-desktop on-ramp to the PDF pipeline. The user
photographs pages (or imports images and PDFs), crops/rotates/enhances each one,
reorders and labels them, then saves the lot as ONE PDF that runs straight into
the extractor.

There are two moments here, and the values tell you which one you are in. BEFORE
save, \`scan_session_summary\`, \`scan_items\`, and \`scan_page_labels\` describe an
in-progress capture — \`scan_all_uploaded\` is the readiness gate, and a non-zero
\`scan_error_count\` means the user has failed uploads to fix. AFTER save,
\`file_id\` / \`filename\` / \`total_pages\` name the assembled PDF and
\`scan_processing_stage\` plus \`scan_processed_pages\` track OCR and cleanup live.

This surface never loads extracted document text; the inherited PDF Extractor
text values are always empty here. \`scan_raw_preview\` is the only text it sees.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline(
      "selection",
      "content",
      "text_before",
      "text_after",
      "context",
    ),
    [
      ...surfaceSpecific,
      {
        name: "content",
        label: "Document text (not loaded here)",
        description:
          "Inherited legacy alias of `full_document_text`. The scanner loads no body text — always empty on this surface.",
        valueType: "string",
        alwaysAvailable: false,
        typicalCharCount: 0,
        autoContext: false,
        group: "scan_unavailable",
        sortOrder: 760,
      },
      {
        name: "selection",
        label: "Current selection (not applicable here)",
        description:
          "Inherited legacy alias. The scanner is a capture/review surface with no text to select — always empty here.",
        valueType: "string",
        alwaysAvailable: false,
        typicalCharCount: 0,
        autoContext: false,
        group: "scan_unavailable",
        sortOrder: 770,
      },
    ],
  ),
};

/**
 * Type-safe payload helper for the scanner scope.
 *
 * Required keys (no `?`) mirror every `alwaysAvailable: true` value —
 * including the inherited-and-then-narrowed ones. Every parent key the
 * scanner cannot guarantee is re-declared above as `alwaysAvailable: false`,
 * so it is optional here by design rather than by omission.
 */
export function createScannerScope(values: {
  // alwaysAvailable: true → required
  scan_session_id: string;
  scan_resumable: boolean;
  scan_session_summary: {
    scan_session_id: string;
    scan_title: string;
    page_count: number;
    uploading_count: number;
    error_count: number;
    all_uploaded: boolean;
  };
  scan_page_count: number;
  scan_uploading_count: number;
  scan_error_count: number;
  scan_all_uploaded: boolean;
  scan_items: Array<{
    index: number;
    kind: string;
    source: string;
    file_name: string;
    label: string;
    status: string;
    cropped: boolean;
    rotation: number;
    enhance: string;
  }>;
  scan_page_labels: string[];
  scan_source_counts: { camera: number; file: number };
  total_pages: number;
  scan_processed_pages: Array<{
    page: number;
    chars: number;
    method: string;
    title: string;
    kind: string;
    cleaned: boolean;
  }>;
  // alwaysAvailable: false → optional
  scan_title?: string;
  file_id?: string;
  processed_document_id?: string;
  filename?: string;
  scan_processing_stage?: string;
  scan_processing_detail?: string;
  scan_raw_preview?: string;
  full_document_text?: string;
  current_page_text?: string;
  active_scope_text?: string;
  current_page?: number;
  scope_kind?: string;
  using_clean_text?: boolean;
  selection?: string;
  content?: string;
  text_before?: string;
  text_after?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
