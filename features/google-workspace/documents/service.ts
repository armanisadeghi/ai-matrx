/**
 * Docs Plane C — the refresh call. ONE door to the server's refresh, through the
 * SAME authenticated transport every other Google call in this repo uses
 * (`postGoogleBackend`: the Supabase session's bearer token plus the
 * fail-closed organization header). Never a hand-rolled `fetch`.
 *
 * THE ORGANIZATION IS SENT, NEVER RESOLVED SERVER-SIDE. `DocumentRefreshRequest`
 * requires `organization_id` and the router answers 422
 * `organization_required` without it — the platform's rule that every write
 * carries an explicit organization chosen by the client.
 */

import { postGoogleBackend } from "@/features/marketing/google/service";
import { requireOrganizationContext } from "@/lib/api/organization-context";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";

import { supabase } from "@/utils/supabase/client";

import type {
  GoogleDocumentRecordResponse,
  GoogleDocumentRow,
  GoogleDocumentSyncStatus,
  GoogleSyncedRecordResponse,
} from "./types";
import { isGoogleDocumentSyncStatus } from "./record";

/**
 * The bare router prefix (`aidream/api/app.py` mounts `google_sync.router` at
 * `/google-sync`). `ApiPrefixCompatMiddleware` also accepts `/api/...`; the bare
 * spelling is the one aidream's own rule names.
 */
const REFRESH_PATH = "/google-sync/documents/refresh";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`The Google refresh answered without a usable ${key}.`);
  }
  return value;
}

function nullableString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`The Google refresh answered with an invalid ${key}.`);
  }
  return value;
}

function status(body: Record<string, unknown>): GoogleDocumentSyncStatus {
  const value = body.sync_status;
  if (!isGoogleDocumentSyncStatus(value)) {
    // NOTHING FAILS SILENTLY: an unrecognised status word is refused by name
    // rather than rendered as "available", which would be the screen inventing
    // good news about someone's document.
    throw new Error(
      `The Google refresh answered with a status this screen does not know (${String(value)}). Nothing about the document has changed here.`,
    );
  }
  return value;
}

/**
 * The two generic doors for the last two of PLAN §4.1's four unavailable actions.
 * ONE server pair serves every synced record table, so this pair of functions
 * takes the table rather than hard-coding the document's — the calendar panel
 * calls the SAME two functions with `communication.calendar_event`.
 */
const RECORD_ACTION_PATH = (table: string, id: string, action: "detach" | "archive") =>
  `/google-sync/records/${encodeURIComponent(table)}/${encodeURIComponent(id)}/${action}`;

function syncedRecord(payload: unknown): GoogleSyncedRecordResponse {
  if (!isRecord(payload)) {
    throw new Error("The server answered with something this screen cannot read.");
  }
  const status = payload.sync_status;
  if (status !== null && status !== undefined && !isGoogleDocumentSyncStatus(status)) {
    // NOTHING FAILS SILENTLY: an unrecognised word is refused by name rather
    // than rendered as good news about someone's record.
    throw new Error(
      `The server answered with a status this screen does not know (${String(status)}). Nothing on screen has been changed.`,
    );
  }
  return {
    id: requiredString(payload, "id"),
    table: requiredString(payload, "table"),
    entity_token: requiredString(payload, "entity_token"),
    organization_id: requiredString(payload, "organization_id"),
    label: nullableString(payload, "label"),
    sync_status: (status ?? null) as GoogleDocumentSyncStatus | null,
    sync_status_reason: nullableString(payload, "sync_status_reason"),
    archived: payload.archived === true,
    changed: payload.changed === true,
  };
}

/**
 * "Keep as AI Matrx data" — stop this record refreshing from Google and keep the
 * copy we hold. Terminal: nothing here ever refreshes it again.
 */
export async function detachSyncedRecord(args: {
  table: string;
  recordId: string;
  organizationId: string;
}): Promise<GoogleSyncedRecordResponse> {
  const organizationId = requireOrganizationContext(args.organizationId);
  const response = await postGoogleBackend(
    RECORD_ACTION_PATH(args.table, args.recordId, "detach"),
    { organization_id: organizationId },
    "Unable to keep this record as AI Matrx data.",
    organizationId,
  );
  return syncedRecord(await response.json());
}

/** Archive this record — soft, recoverable, and never a delete in Google. */
export async function archiveSyncedRecord(args: {
  table: string;
  recordId: string;
  organizationId: string;
}): Promise<GoogleSyncedRecordResponse> {
  const organizationId = requireOrganizationContext(args.organizationId);
  const response = await postGoogleBackend(
    RECORD_ACTION_PATH(args.table, args.recordId, "archive"),
    { organization_id: organizationId },
    "Unable to archive this record.",
    organizationId,
  );
  return syncedRecord(await response.json());
}

/** Refresh one picked Doc into its Record and return the server's receipt. */
export async function refreshGoogleDocument(args: {
  fileId: string;
  organizationId?: string | null;
}): Promise<GoogleDocumentRecordResponse> {
  const store = getStoreSingleton();
  const organizationId = requireOrganizationContext(
    args.organizationId ?? (store ? selectOrganizationId(store.getState()) : null),
  );
  const response = await postGoogleBackend(
    REFRESH_PATH,
    { organization_id: organizationId, file_id: args.fileId },
    "Unable to refresh this document from Google.",
    organizationId,
  );
  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error("The Google refresh answered with something this screen cannot read.");
  }
  const bodyChars = payload.body_chars;
  return {
    id: requiredString(payload, "id"),
    organization_id: requiredString(payload, "organization_id"),
    resource_id: requiredString(payload, "resource_id"),
    external_id: requiredString(payload, "external_id"),
    title: requiredString(payload, "title"),
    mime_kind:
      payload.mime_kind === "document" ||
      payload.mime_kind === "spreadsheet" ||
      payload.mime_kind === "other"
        ? payload.mime_kind
        : "other",
    external_url: nullableString(payload, "external_url"),
    owner_email: nullableString(payload, "owner_email"),
    external_modified_at: nullableString(payload, "external_modified_at"),
    body_chars: typeof bodyChars === "number" ? bodyChars : 0,
    synced_at: nullableString(payload, "synced_at"),
    sync_status: status(payload),
    sync_status_reason: nullableString(payload, "sync_status_reason"),
    export_mime: nullableString(payload, "export_mime"),
  };
}

/**
 * Read ONE Linked document row. React → Supabase directly (the platform's data
 * rule); the masking view's RLS is the authorization, and `deleted_at is null`
 * keeps an archived record out of a live panel.
 *
 * Used by the Detail primitive's loader AND after a refresh, so what the panel
 * shows is always a row the database returned — never the request's own echo.
 */
export async function readGoogleDocumentRow(
  id: string,
  signal?: AbortSignal,
): Promise<GoogleDocumentRow | null> {
  const query = supabase
    .schema("workbench")
    .from("google_document")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null);
  const { data, error } = await (signal ? query.abortSignal(signal) : query).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}
