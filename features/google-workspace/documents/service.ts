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
