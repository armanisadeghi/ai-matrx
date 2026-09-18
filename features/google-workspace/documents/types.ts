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

/** `available` | `unavailable` — the CHECK constraint's two words (migration 0766). */
export type GoogleDocumentSyncStatus = "available" | "unavailable";

/** Google's three file kinds behind one record (`mime_kind`). */
export type GoogleDocumentMimeKind = "document" | "spreadsheet" | "other";

/**
 * Mirrors aidream `DocumentRecordResponse` (source named in the header above).
 * Every field is required there, so every field is required here.
 */
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
