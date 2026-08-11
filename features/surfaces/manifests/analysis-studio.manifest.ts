/**
 * Surface manifest — PDF Analysis Studio (`matrx-user/analysis-studio`).
 *
 * Route: `/files/f/[fileId]/studio`. Three panes — thumbnail strip, the
 * annotatable PDF canvas, and the inspector rail (outline / text / PII /
 * tables / regions / redact / …). Agents bound here act on the open file,
 * the page in view, and the user's annotations — NOT on the extractor's
 * scope picker.
 *
 * Parent: `matrx-user/pdf-extractor` (same document family, so an agent
 * wired to `file_id` / `filename` works on both). The extractor's
 * text-scope vocabulary (`full_document_text`, `active_scope_text`,
 * `scope_kind`, …) is inherited but the studio does NOT load extracted
 * text — those keys are re-declared here as `alwaysAvailable: false` so
 * the scope helper cannot claim a guarantee the studio can't keep.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/**
 * The studio's own sections. Parent group keys (`pdf_document`, `pdf_text`,
 * …) are NOT declared here — inherited values auto-collapse into
 * `inherited:matrx-user/pdf-extractor`.
 */
const groups: SurfaceValueGroup[] = [
  { key: "studio_document", label: "Studio document", sortOrder: 100 },
  { key: "studio_view", label: "Studio view state", sortOrder: 200 },
  { key: "studio_annotations", label: "Annotations", sortOrder: 300 },
  { key: "studio_unavailable", label: "Not populated here", sortOrder: 700 },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Document identity (100-199) ──────────────────────────────────────
  {
    name: "file_id",
    label: "File ID",
    description:
      "UUID of the `cld_files` row open in Analysis Studio. Guaranteed — the studio is a `/files/f/[fileId]/studio` route and the server 404s without a resolvable PDF file.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    group: "studio_document",
    sortOrder: 100,
  },
  {
    name: "filename",
    label: "Document filename",
    description:
      "Display name of the open PDF. Empty for the brief moment before the file record hydrates.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    group: "studio_document",
    sortOrder: 110,
  },
  {
    name: "mime_type",
    label: "File MIME type",
    description:
      'MIME type of the open file — always `"application/pdf"` here, because the route refuses to render the studio for any other type. Empty until the file record hydrates.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    group: "studio_document",
    sortOrder: 120,
  },
  {
    name: "total_pages",
    label: "Total pages",
    description:
      "Number of `file_pages` rows loaded for this document. Zero while pages are still loading.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "studio_document",
    sortOrder: 130,
  },
  {
    name: "active_page_count",
    label: "Active page count",
    description:
      'Pages whose status is `"active"` — i.e. excluded/deleted pages removed. Differs from `total_pages` once the user excludes pages.',
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    group: "studio_document",
    sortOrder: 140,
  },
  {
    name: "document_summary",
    label: "Document summary",
    description:
      "Composite identity object for the open document: `{ file_id, filename, mime_type, total_pages, active_page_count }`. One binding for everything needed to name and re-fetch this document. Always populated.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 200,
    group: "studio_document",
    sortOrder: 150,
  },

  // ── View state (200-299) ─────────────────────────────────────────────
  {
    name: "current_page",
    label: "Current page number",
    description:
      "1-indexed page the user is viewing on the studio canvas. Always populated (defaults to 1, or the `?page=` search param on load).",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "studio_view",
    sortOrder: 200,
  },
  {
    name: "inspector_tab",
    label: "Inspector tab",
    description:
      'Which inspector-rail tab is open — "outline", "text", "pii", "tables", "images", "regions", "duplicates", "classification", "reading-order", "metadata", "annotations", "findings", "redact", "search", "pages", or "docops". Always populated (defaults to "outline"). The single best signal of what the user is doing.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 14,
    group: "studio_view",
    sortOrder: 210,
  },
  {
    name: "canvas_mode",
    label: "Canvas mode",
    description:
      'Annotation-layer mode on the canvas: "view", "draw", or "select". Always populated (defaults to "view"). Tells an agent whether the user is reading or actively marking up the page.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "studio_view",
    sortOrder: 220,
  },
  {
    name: "studio_view_state",
    label: "Studio view summary",
    description:
      "Composite of where the user is: `{ current_page, inspector_tab, canvas_mode, selected_annotation_id }`. Always populated. Pairs with `document_summary` for a complete picture without four bindings.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 140,
    group: "studio_view",
    sortOrder: 230,
  },

  // ── Annotations (300-399) ────────────────────────────────────────────
  {
    name: "selected_annotation_id",
    label: "Selected annotation ID",
    description:
      "UUID of the annotation the user has selected (from the canvas or the `?annotation=` param). Empty when nothing is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "studio_annotations",
    sortOrder: 300,
  },
  {
    name: "annotation_count",
    label: "Active annotation count",
    description:
      "How many active (non-deleted) annotations exist on this document. Zero when the user has not annotated anything yet.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    group: "studio_annotations",
    sortOrder: 310,
  },
  {
    name: "annotation_pages",
    label: "Pages with annotations",
    description:
      "Ascending page numbers that carry at least one active annotation. Empty array when there are none. Lets an agent point the user at work that lives off the current page.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 40,
    group: "studio_annotations",
    sortOrder: 320,
  },
  {
    name: "current_page_annotations",
    label: "Annotations on current page",
    description:
      "Active annotations on the page in view as `{ id, label, label_category, extracted_text }`, in load order. Empty array when the current page is unannotated.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 600,
    group: "studio_annotations",
    sortOrder: 330,
  },
  {
    name: "annotations",
    label: "All annotations",
    description:
      "Every active annotation on the document as `{ id, page_number, label, label_category, extracted_text }`. Can be large on a heavily marked-up document — bindable only, kept out of automatic context.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 6000,
    autoContext: false,
    group: "studio_annotations",
    sortOrder: 340,
  },
  {
    name: "annotation_categories",
    label: "Annotation categories",
    description:
      "Distinct `label_category` values in use on this document with their counts, e.g. `{ pii: 4, table: 2 }`. Empty object when there are no annotations.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 120,
    group: "studio_annotations",
    sortOrder: 350,
  },

  // ── Inherited keys the studio genuinely cannot populate ──────────────
  // The parent guarantees these; Analysis Studio never loads extracted
  // text, so re-declaring them `alwaysAvailable: false` keeps the scope
  // helper honest. Generic agents wired to them resolve empty, never fail.
  {
    name: "processed_document_id",
    label: "Processed document ID",
    description:
      "UUID of the `processed_documents` derivative for this file. NOT loaded by Analysis Studio (which reads `file_pages`, not the extractor tables) — always empty here. Resolve it from `file_id` if you need extractor text.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "studio_unavailable",
    sortOrder: 700,
  },
  {
    name: "full_document_text",
    label: "Full document text (not loaded here)",
    description:
      "Inherited from PDF Extractor. Analysis Studio does not load extracted body text, so this is always empty on this surface. Use the extractor surface, or resolve the text server-side from `file_id`.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 0,
    autoContext: false,
    group: "studio_unavailable",
    sortOrder: 710,
  },
  {
    name: "current_page_text",
    label: "Current page text (not loaded here)",
    description:
      "Inherited from PDF Extractor. Analysis Studio renders the page, it does not load its extracted text — always empty on this surface.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 0,
    autoContext: false,
    group: "studio_unavailable",
    sortOrder: 720,
  },
  {
    name: "active_scope_text",
    label: "Selected scope content (not loaded here)",
    description:
      "Inherited from PDF Extractor's scope picker, which does not exist in Analysis Studio — always empty on this surface.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 0,
    autoContext: false,
    group: "studio_unavailable",
    sortOrder: 730,
  },
  {
    name: "scope_kind",
    label: "Scope kind (not applicable here)",
    description:
      "Inherited from PDF Extractor. There is no scope picker in Analysis Studio — always empty on this surface.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 0,
    autoContext: false,
    group: "studio_unavailable",
    sortOrder: 740,
  },
  {
    name: "using_clean_text",
    label: "Using AI-cleaned text (not applicable here)",
    description:
      "Inherited from PDF Extractor. Analysis Studio sources no extracted text, so this is never meaningful here — always false.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    autoContext: false,
    group: "studio_unavailable",
    sortOrder: 750,
  },
];

/**
 * Write targets — the agent-writable half of Analysis Studio.
 *
 * What an agent can honestly author here is the CONTENT of a region the
 * human already drew: what that region is (its label) and what it says (its
 * extracted text). Both land through `useAnnotations(fileId).update` — the
 * exact function the region context menu writes `extracted_text` with and the
 * canvas writes a dragged `bbox` with — so an agent write and a user click
 * share one path to `PUT /files/{id}/annotations/{aid}`. The studio has NO
 * staging buffer for an existing annotation (the label picker's draft state
 * exists only while CREATING one), so every content target is `mode: "entity"`
 * and says so; `applyPolicy: "ask"` is what keeps a human in the loop.
 *
 * Deliberately NOT declared, and why:
 *  - `bbox` / any geometry — where a rectangle belongs on the page is a
 *    pointer gesture against a rendered document. An agent cannot see the
 *    page; a "corrected" bbox would be a guess that silently re-points the
 *    region at different text.
 *  - `redact` — marking a region for redaction is a disclosure decision, not
 *    a copy edit. It stays on the human's context menu.
 *  - delete / `status` — destructive, and the panel already asks.
 *  - annotation ids, `file_id`, page identity — identity, never authored.
 *  - `document_summary` — derived output (`{file_id, filename, mime_type,
 *    total_pages, active_page_count}` composed by the emitter). The studio
 *    has no write path for any of it: filename is renamed on the file record,
 *    the counts are `file_pages` facts. A "write" here would have to invent a
 *    parallel path, which is exactly what this seam exists to prevent.
 *  - `notes` / `normalized_value` — writable on the API body, but the studio
 *    offers no editor for them on an EXISTING annotation and neither has a
 *    read twin on this surface, so an agent would be writing into something
 *    the page can never show back. No evidence loop, no target.
 *  - `inspector_tab` / `canvas_mode` — pure chrome an agent has no business
 *    driving. The one view-state target below is `studio_focus_annotation`,
 *    and it earns its place because "the thing I am telling you about is that
 *    rectangle, on page 7" is otherwise unsayable: it does exactly what the
 *    user's own click on an Annotations-panel row does (select + jump to the
 *    annotation's page) and persists nothing.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "annotation_label",
    label: "Annotation label",
    description:
      'Re-label ONE existing annotation — the region named by `annotation_id`, or the selected one when you omit it. Value: `{ label: string, annotation_id?: string, label_category?: string }`. `label` is a label-catalog id (the raw `label` in the annotations value, e.g. "invoice_number"); when it names a catalog entry the category is taken FROM the catalog, and passing a `label_category` that disagrees is rejected. A label that is not in the catalog is a custom label and then `label_category` is REQUIRED and must be a catalog category key or "custom". Saved immediately through the same annotation update the label picker and region menu use — there is no draft to save afterwards. Rejected when nothing is selected and you passed no id, when the id is not an active annotation on this document, or while another annotation write is still in flight.',
    valueType: "object",
    updatesValue: "annotations",
    mode: "entity",
    applyPolicy: "ask",
    group: "studio_annotations",
    sortOrder: 300,
  },
  {
    name: "annotation_extracted_text",
    label: "Annotation text",
    description:
      "Set the extracted text stored on ONE existing annotation — the region named by `annotation_id`, or the selected one when you omit it. Value: `{ text: string, annotation_id?: string }`. The text REPLACES the region's current `extracted_text` in full (there is no append) — this is for transcribing or cleaning up what a region says, so send the corrected text for that region alone, never the whole page. Saved immediately through the same annotation update the region menu's \"Extract text here\" writes with — there is no draft to save afterwards. Rejected when the text is empty, when nothing is selected and you passed no id, when the id is not an active annotation on this document, or while another annotation write is still in flight.",
    valueType: "object",
    updatesValue: "annotations",
    mode: "entity",
    applyPolicy: "ask",
    group: "studio_annotations",
    sortOrder: 310,
  },
  {
    name: "studio_focus_annotation",
    label: "Focused annotation",
    description:
      "Point the user at ONE annotation: select it on the canvas and jump the studio to its page — the same thing their own click on an Annotations-panel row does. Value: `{ annotation_id: string }`, required, and it must be an active annotation on this document. View state only: nothing is written to the document and there is nothing to save.",
    valueType: "object",
    updatesValue: "studio_view_state",
    mode: "ui",
    applyPolicy: "ask",
    group: "studio_view",
    sortOrder: 250,
  },
];

export const analysisStudioManifest: SurfaceManifest = {
  surfaceName: "matrx-user/analysis-studio",
  readiness: "verified",
  inheritsFrom: "matrx-user/pdf-extractor",
  label: "Analysis Studio",
  urlPattern: "/files/f/[fileId]/studio",
  intro: `<surface_intro>
Analysis Studio is the page-by-page workbench for ONE PDF: thumbnail strip on the
left, an annotatable page canvas in the middle, and an inspector rail on the right
covering outline, text, PII, tables, images, regions, duplicates, classification,
reading order, metadata, annotations, findings, redaction, search, pages, and doc ops.

Read \`document_summary\` for which file is open (\`file_id\` is guaranteed — it is
the route), \`studio_view_state\` for where the user is (page, inspector tab,
canvas mode), and the annotation values for the marks they have made. The user's
open inspector tab is the strongest signal of intent: "redact" means they are
removing sensitive content, "pii" means they are hunting for it.

This surface does NOT load extracted document text. The inherited PDF Extractor
text values are always empty here — work from \`file_id\` and the annotations, or
send the user to the extractor studio.
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
        name: "selection",
        label: "Current selection",
        description:
          "Text the user has highlighted on the studio canvas (browser text selection). Empty when nothing is selected.",
        valueType: "string",
        alwaysAvailable: false,
        typicalCharCount: 200,
        group: "studio_view",
        sortOrder: 240,
      },
      {
        name: "content",
        label: "Document text (not loaded here)",
        description:
          "Inherited legacy alias of `full_document_text`. Analysis Studio loads no body text — always empty on this surface.",
        valueType: "string",
        alwaysAvailable: false,
        typicalCharCount: 0,
        autoContext: false,
        group: "studio_unavailable",
        sortOrder: 760,
      },
    ],
  ),
  writeTargets,
};

/**
 * Type-safe payload helper for the Analysis Studio scope.
 *
 * Required keys (no `?`) mirror every `alwaysAvailable: true` value —
 * including the inherited-and-then-narrowed ones. Every parent key this
 * surface cannot guarantee is re-declared above as `alwaysAvailable: false`,
 * so it is optional here by design rather than by omission.
 */
export function createAnalysisStudioScope(values: {
  // alwaysAvailable: true → required
  file_id: string;
  total_pages: number;
  active_page_count: number;
  document_summary: {
    file_id: string;
    filename: string;
    mime_type: string;
    total_pages: number;
    active_page_count: number;
  };
  current_page: number;
  inspector_tab: string;
  canvas_mode: string;
  studio_view_state: {
    current_page: number;
    inspector_tab: string;
    canvas_mode: string;
    selected_annotation_id: string;
  };
  annotation_count: number;
  annotation_pages: number[];
  current_page_annotations: Array<{
    id: string;
    label: string;
    label_category: string;
    extracted_text: string;
  }>;
  annotations: Array<{
    id: string;
    page_number: number;
    label: string;
    label_category: string;
    extracted_text: string;
  }>;
  annotation_categories: Record<string, number>;
  // alwaysAvailable: false → optional
  filename?: string;
  mime_type?: string;
  selected_annotation_id?: string;
  processed_document_id?: string;
  full_document_text?: string;
  current_page_text?: string;
  active_scope_text?: string;
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
