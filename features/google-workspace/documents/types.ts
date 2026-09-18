/**
 * Docs Plane C — the Linked document's shapes on the client.
 *
 * TWO shapes, and they are not the same thing:
 *
 *  1. `GoogleDocumentRow` — the row in `workbench.google_document`, read
 *     straight from the generated database types. This is what the Detail
 *     primitive loads and renders.
 *  2. `GoogleDocumentRecordResponse` — what `POST /google-sync/documents/refresh`
 *     answers. HAND-TYPED from the ONE generator's source, aidream's
 *     `DocumentRecordResponse` in `aidream/api/routers/google_sync.py`, because
 *     the google_sync routes are NOT in `types/python-generated/api-types.ts`
 *     yet (`pnpm sync-types` needs the aidream checkout's DB environment, which
 *     this box does not hold). When that contract is regenerated this interface
 *     is DELETED and the generated one imported — it is a stand-in that names
 *     its source, never a second contract.
 *
 * THE RESPONSE IS NOT THE ROW. The response omits `body_text` (it reports
 * `body_chars`) and carries `export_mime`, which no column holds. So a refresh
 * updates the record and the detail re-reads the row — the response is a
 * receipt, never the thing rendered.
 */

import type { Database } from "@/types/database.types";

export type GoogleDocumentRow =
  Database["workbench"]["Tables"]["google_document"]["Row"];

/**
 * The CHECK constraint's words — two from migration 0766, the third from 0881.
 *
 * `detached` is TERMINAL and is never a provider answer: it is what the person
 * chose when they pressed "Keep as AI Matrx data". A detached record keeps
 * everything it had and never refreshes from Google again.
 */
export type GoogleDocumentSyncStatus = "available" | "unavailable" | "detached";

/** Google's three file kinds behind one record (`mime_kind`). */
export type GoogleDocumentMimeKind = "document" | "spreadsheet" | "other";

/**
 * Mirrors aidream `DocumentRecordResponse` (source named in the header above).
 * Every field is required there, so every field is required here.
 */
/**
 * Mirrors aidream `SyncedRecordResponse` — what
 * `POST /google-sync/records/{table}/{id}/detach` and `.../archive` answer.
 * Hand-typed from the same source and for the same reason as the interface
 * below; deleted the day `pnpm sync-types` covers these routes.
 */
export interface GoogleSyncedRecordResponse {
  id: string;
  /** The schema-qualified table, echoed from the server's DECLARED set. */
  table: string;
  entity_token: string;
  organization_id: string;
  label: string | null;
  /** null on a table that carries no sync vocabulary (a Tag Manager snapshot). */
  sync_status: GoogleDocumentSyncStatus | null;
  sync_status_reason: string | null;
  archived: boolean;
  /** False when the server found the record already in that state. */
  changed: boolean;
}

export interface GoogleDocumentRecordResponse {
  id: string;
  organization_id: string;
  resource_id: string;
  external_id: string;
  title: string;
  mime_kind: GoogleDocumentMimeKind;
  external_url: string | null;
  owner_email: string | null;
  external_modified_at: string | null;
  body_chars: number;
  synced_at: string | null;
  sync_status: GoogleDocumentSyncStatus;
  sync_status_reason: string | null;
  export_mime: string | null;
}
