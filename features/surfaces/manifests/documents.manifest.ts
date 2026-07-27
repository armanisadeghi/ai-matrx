/**
 * Surface manifest — Documents (`matrx-user/documents`).
 *
 * The cloud-documents feature (`udt_documents` + Univer docs editor):
 *   - `/documents`      — the library: every document the user can access,
 *                         searchable, sortable, in card or table view.
 *   - `/documents/[id]` — one document open in the Univer rich-text editor,
 *                         with realtime collaboration and snapshot history.
 *
 * One surface covers both because `route-to-surface.ts` maps the whole
 * `/documents` prefix here and the same agents belong in both places
 * (summarize / draft / organize). `documents_view` tells the agent which of
 * the two it is standing in — every other value is populated on exactly one
 * of them.
 *
 * NOTE — this manifest was rewritten on 2026-07-27. It previously described a
 * RAG document VIEWER at `/rag/viewer/[id]` (pages, extracted text, RAG
 * chunks). No such component was ever wired to this surface; every one of
 * those values was fictional. See the Change Log entry below.
 *
 * Emitters:
 *   - `app/(core)/documents/page.tsx`      → library values
 *   - `app/(core)/documents/[id]/page.tsx` → document values
 * both via `buildDocumentsContextData` in
 * `features/data-tables/agent-context/buildDocumentsContextData.ts`.
 *
 * FILE DOCTRINE (features/files/handler/FEATURE.md): `document_original_file_id`
 * is a DURABLE `files.files` id — the only way this surface ever refers to an
 * imported source file. No signed URL, no S3 `storage_uri`, ever.
 *
 * DELIBERATELY NOT DECLARED: the document's body text, save status, and
 * collaboration presence. Those live inside the dynamically-imported
 * `DocumentEditor` (Univer owns the document model) and nothing lifts them to
 * the route today — declaring them would be declaring what nothing emits.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "documents_location",
    label: "Where the user is",
    sortOrder: 100,
    description:
      "Which half of the Documents feature is mounted — the library or one open document.",
  },
  {
    key: "document_identity",
    label: "Open document",
    sortOrder: 200,
    description:
      "The `udt_documents` record open in the editor. Empty in the library.",
  },
  {
    key: "document_access",
    label: "Document access",
    sortOrder: 300,
    description: "What the current user is allowed to do with the document.",
  },
  {
    key: "document_library",
    label: "Document library",
    sortOrder: 400,
    description:
      "The list of accessible documents and the query shaping it. Empty inside a single document.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Where the user is (300-309) ───────────────────────────────────────
  {
    name: "documents_view",
    label: "Documents view",
    description:
      '"library" when the user is on the `/documents` list, "document" when one document is open at `/documents/[id]`. Always present — it tells you which of the other groups carry values.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "documents_location",
    sortOrder: 300,
  },

  // ── Open document (310-359) ───────────────────────────────────────────
  {
    name: "document_id",
    label: "Document ID",
    description:
      "UUID of the `udt_documents` row open in the editor. Empty in the library view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "document_identity",
    sortOrder: 310,
  },
  {
    name: "document_name",
    label: "Document name",
    description:
      'User-editable title of the open document (defaults to "Untitled document"). Empty in the library view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "document_identity",
    sortOrder: 315,
  },
  {
    name: "document_description",
    label: "Document description",
    description:
      "Optional free-text description stored on the document row. Empty when the user never set one, and in the library view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "document_identity",
    sortOrder: 320,
  },
  {
    name: "document_source",
    label: "Document source",
    description:
      'How the document came to exist: "created", "imported_docx", "imported_md", or "imported_txt". Empty in the library view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 14,
    group: "document_identity",
    sortOrder: 325,
  },
  {
    name: "document_original_file_id",
    label: "Imported source file ID",
    description:
      "Durable `files.files` UUID of the file this document was imported from. Empty for documents created in-app and in the library view. This id is the ONLY reference to those bytes — resolve them through the file handler, never a URL.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "document_identity",
    sortOrder: 330,
  },
  {
    name: "document_version",
    label: "Document version",
    description:
      "Monotonic version counter on the document row. Absent in the library view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "document_identity",
    sortOrder: 335,
  },
  {
    name: "document_created_at",
    label: "Document created at",
    description:
      "ISO-8601 creation timestamp of the open document. Empty in the library view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "document_identity",
    sortOrder: 340,
  },
  {
    name: "document_updated_at",
    label: "Document updated at",
    description:
      "ISO-8601 timestamp of the last saved change to the open document. Empty in the library view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "document_identity",
    sortOrder: 345,
  },
  {
    name: "document_owner_id",
    label: "Document owner ID",
    description:
      "User UUID that owns the open document. Empty in the library view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "document_identity",
    sortOrder: 350,
  },
  {
    name: "document_organization_id",
    label: "Document organization ID",
    description:
      "Organization UUID the document belongs to. Empty for personal documents and in the library view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "document_identity",
    sortOrder: 355,
  },
  {
    name: "document_summary",
    label: "Document summary",
    description:
      "Composite object for the open document: `{ id, name, description, source, version, is_public, created_at, updated_at, owner_id, organization_id, original_file_id }`. Absent in the library view.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 450,
    group: "document_identity",
    sortOrder: 358,
  },

  // ── Document access (360-379) ─────────────────────────────────────────
  {
    name: "document_is_public",
    label: "Document is public",
    description:
      "True when the open document is flagged public. Absent in the library view.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "document_access",
    sortOrder: 360,
  },
  {
    name: "document_can_edit",
    label: "User can edit",
    description:
      "True when the current user may edit the open document — owner, or an editor-level grant from `has_permission`. False mounts the editor read-only. Absent in the library view.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "document_access",
    sortOrder: 365,
  },
  {
    name: "document_is_owner",
    label: "User is owner",
    description:
      "True when the current user owns the open document (controls sharing). Absent in the library view.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "document_access",
    sortOrder: 370,
  },

  // ── Document library (380-429) ────────────────────────────────────────
  {
    name: "library_document_count",
    label: "Accessible document count",
    description:
      "Total number of documents loaded for the library — everything the user owns or has been granted. Absent inside a single document.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "document_library",
    sortOrder: 380,
  },
  {
    name: "library_visible_count",
    label: "Visible document count",
    description:
      "Number of documents left after the search box is applied. Equals `library_document_count` when not searching. Absent inside a single document.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "document_library",
    sortOrder: 385,
  },
  {
    name: "library_search_query",
    label: "Library search query",
    description:
      "Text in the library search box (matches document name and description). Empty when not searching, and inside a single document.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    group: "document_library",
    sortOrder: 390,
  },
  {
    name: "library_sort_key",
    label: "Library sort",
    description:
      '"updated", "created", "name", or "source" — how the library list is ordered. Empty inside a single document.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    group: "document_library",
    sortOrder: 395,
  },
  {
    name: "library_view_mode",
    label: "Library view mode",
    description:
      '"cards" or "table" — how the library renders its rows (persisted per browser). Empty inside a single document.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6,
    group: "document_library",
    sortOrder: 400,
  },
  {
    name: "library_status",
    label: "Library load status",
    description:
      '"loading", "loaded", "error", or "empty" — the state of the library list. Empty inside a single document.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 7,
    group: "document_library",
    sortOrder: 405,
  },
  {
    name: "visible_documents",
    label: "Visible documents",
    description:
      "Array of `{ id, name, description, source, updated_at, created_at, is_public }` for the documents currently listed, in display order, capped at 200 entries. Empty array when the library is empty or nothing matches the search. Absent inside a single document.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    group: "document_library",
    sortOrder: 410,
  },
  {
    name: "library_query_summary",
    label: "Library query summary",
    description:
      "Composite object of what shapes the visible library list: `{ search_query, sort_key, view_mode, total, visible, status }`. Absent inside a single document.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "document_library",
    sortOrder: 415,
  },
];

export const documentsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/documents",
  readiness: "partial",
  readinessNote:
    "Manifest rewritten against the real /documents routes and both emitters are wired; not yet DB-synced and no live binding test run. The Univer editor's body text, save status, and collab presence stay undeclared until the editor lifts them to the route.",
  label: "Documents",
  urlPattern: "/documents/[id]",
  intro: `<surface_intro>
This is the Matrx cloud-documents feature — rich-text documents the user owns or
was granted, edited in a collaborative editor and stored as append-only
snapshots.

The surface has two faces; read documents_view FIRST:
  - "library"  — the user is browsing /documents. The document_* values are
                 empty; work from visible_documents, library_search_query and
                 library_sort_key. A request like "find my Q3 memo" is answered
                 from this list.
  - "document" — one document is open. The document_* values describe it;
                 document_can_edit says whether the user may change it, and
                 document_is_owner whether they may share it. The library
                 values are empty.

The document BODY is not part of this surface's values — the editor owns the
document model. Ask for text through the user's selection (the selection
baseline), or read the document by document_id.

document_original_file_id is a durable file id for documents imported from a
DOCX/MD/TXT file. Resolve those bytes through the platform file handler by id;
this surface never emits a URL of any kind.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export interface DocumentSummaryValue {
  id: string;
  name: string;
  description: string | null;
  source: string;
  version?: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  owner_id?: string;
  organization_id?: string | null;
  original_file_id?: string | null;
}

/**
 * Scope builder for `matrx-user/documents`.
 *
 * Only `documents_view` is guaranteed — everything else belongs to exactly one
 * of the two views, so it is optional by construction.
 */
export function createDocumentsScope(values: {
  selection?: string;
  context?: Record<string, unknown>;

  documents_view: string;

  // Open document
  document_id?: string;
  document_name?: string;
  document_description?: string;
  document_source?: string;
  document_original_file_id?: string;
  document_version?: number;
  document_created_at?: string;
  document_updated_at?: string;
  document_owner_id?: string;
  document_organization_id?: string;
  document_summary?: DocumentSummaryValue;

  // Access
  document_is_public?: boolean;
  document_can_edit?: boolean;
  document_is_owner?: boolean;

  // Library
  library_document_count?: number;
  library_visible_count?: number;
  library_search_query?: string;
  library_sort_key?: string;
  library_view_mode?: string;
  library_status?: string;
  visible_documents?: DocumentSummaryValue[];
  library_query_summary?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
