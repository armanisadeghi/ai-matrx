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
import type { components } from "@/types/python-generated/api-types";

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
 * THE DAY THE HEADER PROMISED ARRIVED (check:generated-contracts, 2026-09-22).
 * Both of these were hand-typed stand-ins because the google_sync routes were
 * not yet in `types/python-generated/api-types.ts`. They are now, so the
 * stand-ins are DELETED and the generated contracts imported, exactly as the
 * header above says to do. The local names keep their `Google` prefix — a bare
 * `DocumentRecordResponse` says nothing in a feature that also has library
 * documents — but the SHAPE is the server's.
 *
 * Read one difference the stand-ins hid: a refresh response's `sync_status` is
 * only `available | unavailable`. `detached` is terminal and is never a
 * provider answer — it is what the person chose when they pressed "Keep as AI
 * Matrx data" — so it appears on the detach/archive response and on the ROW,
 * not on a refresh receipt.
 */
export type GoogleSyncedRecordResponse =
  components["schemas"]["SyncedRecordResponse"];

export type GoogleDocumentRecordResponse =
  components["schemas"]["DocumentRecordResponse"];
