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
  SurfaceWriteTarget,
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

/**
 * Write half of the 360 loop. This surface spans TWO provider mounts and, like
 * its mirror `matrx-user/workbooks`, they get DIFFERENT postures on purpose:
 * one manifest, one target list, but `listAgentWritableTargets()` only offers a
 * target where that mount actually registered a handler, so per-mount
 * registration is what splits them.
 *
 * **The library route (`app/(core)/documents/page.tsx`) registers NOTHING —
 * deliberately.** It is a roster of N documents with no open record, and a
 * write target carries ONE value with no entity selector: "set the
 * description" there has no addressable subject. Its only mutations are create
 * (a creation action, not a field write), import (needs a `File` an agent
 * cannot supply) and delete (destructive, human-only). Read-only is the correct
 * posture for that mount, not an oversight. This matches the deliberate
 * per-mount split already shipped on `workbooks`, `schedules`, `shapes`,
 * `marketing-crawls` and `tool-registry`.
 *
 * **The editor route (`app/(core)/documents/[id]/page.tsx`) owns both targets**
 * — `document_name` and `document_description`, the pair of human-authored
 * fields on `udt_documents`. They are SEPARATE targets rather than one
 * composite object because they are independent decisions edited in different
 * places: the name is the always-visible header field a user retitles on its
 * own, while the description is the library blurb, set at import/create and
 * otherwise rarely touched. Nothing in this app edits the two together, so a
 * composite would force an agent to resend a field it was not asked to change.
 * (Contrast `page_meta_tags`, one object because the meta pair IS authored in
 * one gesture.)
 *
 * Both persist immediately through the canonical `document-service` setters
 * (`renameDocument` / `updateDocumentDescription`) — never a direct
 * `.from("udt_documents")` write. `updateDocumentDescription` was added by this
 * adoption, exactly as `updateWorkbookDescription` was added by the workbooks
 * one; keeping the two services symmetric is `document-service`'s standing
 * contract.
 *
 * **`mode: "entity"` is a truth claim here, not a shortcut.** This route has no
 * Save bar for metadata: the header rename field commits on blur/Enter and the
 * description has no inline editor at all. `draft`'s confirm prose — "staged
 * for you to review — nothing is saved until you save" — would be a LIE in a
 * dialog with nothing to save, and a staged name would sit in an input the user
 * may never focus and be lost on navigation. The write must land or not happen
 * at all. Same reasoning as `workbook_name`, `schedule_title`, `mermaid-editor`
 * and `scratchpad`. (The editor's own Save button belongs to the Univer
 * snapshot — the document BODY — which is a different thing entirely and is not
 * declared on this surface.)
 *
 * Both are `applyPolicy: "ask"` — a document is the user's own writing, so
 * every agent-originated change is confirmed in place.
 *
 * Deliberately NOT agent-writable on this surface:
 *   - `document_summary` — it LOOKS like the jackpot target ("summarize this
 *     document") and it is not. There is no summary column on `udt_documents`;
 *     this value is the composite READ-TWIN of the identity group
 *     (`{ id, name, description, source, version, is_public, created_at,
 *     updated_at, owner_id, organization_id, original_file_id }`). Writing it
 *     would mean writing eleven other fields at once, nine of which are on the
 *     NO list below. It is the evidence loop, not a write path: it moves on its
 *     own when `document_name` / `document_description` land. An agent that
 *     wants to summarize the document writes that prose INTO
 *     `document_description`.
 *   - `document_id`, `document_owner_id`, `document_organization_id` —
 *     identity and ownership. Re-pointing a document at another owner or org is
 *     not authoring; it is a permissions move with its own human gesture.
 *   - `document_version` — the monotonic concurrency counter. Writing it would
 *     forge the very fact other code trusts to detect a conflicting edit; the
 *     `scratchpad` adopter refused its `document_version` for the same reason.
 *     It is a fact ABOUT the row, not content in it.
 *   - `document_source`, `document_original_file_id` — provenance. Where a
 *     document CAME from ("imported_docx", and the durable file id of the
 *     bytes) is a historical fact the import flow recorded. An agent rewriting
 *     it would be falsifying the record, and `original_file_id` is the ONLY
 *     reference to those bytes (see the FILE DOCTRINE note at the top).
 *   - `document_created_at`, `document_updated_at` — timestamps, maintained by
 *     the service on every write. An agent setting them by hand desynchronizes
 *     them from the writes they describe.
 *   - `documents_view` — which of the two views a human is looking at is the
 *     human's, and it is derived from the route besides.
 *   - `document_is_public`, `document_can_edit`, `document_is_owner` — sharing
 *     and permissions. Flipping a document public is a disclosure decision;
 *     `workbooks` ruled out its twin for the same reason.
 *   - the library values (`library_*`, `visible_documents`) — the search box,
 *     sort and view mode are the human's browsing state, and they belong to the
 *     mount that registers nothing anyway.
 *   - the document BODY, its save status and collab presence — the Univer
 *     editor owns the document model and nothing lifts it to the route, so it
 *     is not even a declared READ value (see the manifest header). A target
 *     whose handler cannot reach a canonical write path is a loud runtime
 *     defect by design; this one has no path to reach.
 *   - deleting a document — destructive, stays human.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "document_name",
    label: "Document name",
    description:
      "Renames the document open at /documents/[id] and saves it immediately through the canonical rename path; the header name field updates in place. Plain text string, not JSON and not JSON-encoded, 1-200 characters, replacing the whole name — read document_name first if you mean to extend it rather than replace it. Renames only the document; it does not touch a single word of the document's body text. Refused when the user only has viewer access.",
    valueType: "string",
    updatesValue: "document_name",
    mode: "entity",
    applyPolicy: "ask",
    group: "document_identity",
    sortOrder: 315,
  },
  {
    name: "document_description",
    label: "Document description",
    description:
      "Rewrites the open document's description and saves it immediately through the canonical update path — this is the blurb shown under the document's name in the /documents library, and the natural home for a short summary of what the document contains. Plain text string, not JSON and not JSON-encoded, up to 2000 characters; replaces the FULL text, so read document_description first if you mean to extend it, and pass an empty string to clear it. Writing it does not change the document's body. Refused when the user only has viewer access.",
    valueType: "string",
    updatesValue: "document_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "document_identity",
    sortOrder: 320,
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
  writeTargets,
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
