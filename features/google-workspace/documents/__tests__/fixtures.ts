/**
 * ONE row shape, TYPED BY THE DATABASE, shared by every suite here.
 *
 * 🚨 WHY IT IS HAND-BUILT AND WHAT KEEPS IT HONEST. `workbench.google_document`
 * held ZERO rows on 2026-09-18 (`select count(*)` through the Supabase MCP on
 * project brsgrqvjdzwihsvnfqkf), so there is no live row to copy: nobody has
 * picked a Doc since the table went live on 2026-09-17. What stops this from
 * being a shape of our own invention is the type — `GoogleDocumentRow` IS
 * `Database["workbench"]["Tables"]["google_document"]["Row"]`, generated from the
 * live table by `pnpm db-types`, so a column the server adds, renames or makes
 * non-null fails these files at the type gate. Every value below is also what
 * aidream's `DocumentRecordResponse` reports for the same record.
 *
 * 🚨 EVERY TIME IN HERE IS RELATIVE TO NOW. `GoogleDocumentPanel` refreshes on
 * open when `synced_at` is older than `google.refresh.on_open_min_age_seconds`,
 * measured against `new Date()`. With the absolute `2026-09-18T14:30:00Z` this
 * fixture shipped with, every suite that mounted the panel spent a real refresh
 * call from the morning of 2026-09-19 onward — `the-last-two-actions-are-real`
 * then read that call as the one its confirm dialog had just made and failed on
 * all three of its action assertions. A test that only passes on one calendar
 * day is not a test. A suite that WANTS a stale record overrides `synced_at` by
 * name. Guard: `google-workspace/__tests__/the-fixtures-are-not-time-bombs.test.ts`.
 */

import type { GoogleDocumentRow } from "../types";

/** Minutes/hours/days from now, as the ISO string a row column holds. */
function fromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DOC_ID = "11111111-2222-3333-4444-555555555555";
export const RESOURCE_ID = "22222222-3333-4444-5555-666666666666";
export const CONNECTION_ID = "33333333-4444-5555-6666-777777777777";
export const ORG_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
export const FILE_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz";

export function googleDocumentRow(
  overrides: Partial<GoogleDocumentRow> = {},
): GoogleDocumentRow {
  return {
    id: DOC_ID,
    resource_id: RESOURCE_ID,
    external_id: FILE_ID,
    external_url: `https://docs.google.com/document/d/${FILE_ID}/edit`,
    title: "Q3 Plan",
    mime_kind: "document",
    owner_email: "arman@titaniumsuccess.com",
    external_modified_at: fromNow(-DAY),
    body_text: "Goals for Q3\n\nShip the connector.",
    // FRESH, so refresh-on-open does NOT fire unless a suite asks for it.
    synced_at: fromNow(-MINUTE),
    synced_via_connection_id: CONNECTION_ID,
    sync_status: "available",
    sync_status_reason: null,
    organization_id: ORG_ID,
    created_by: null,
    updated_by: null,
    created_at: fromNow(-2 * DAY),
    updated_at: fromNow(-MINUTE),
    deleted_at: null,
    version: 3,
    metadata: {},
    visibility: "internal",
    ...overrides,
    custom_fields: overrides.custom_fields ?? {},
  };
}
