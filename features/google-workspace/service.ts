import { postGoogleBackend } from "@/features/marketing/google/service";
import { BackendApiError } from "@/lib/api/errors";
import type {
  GoogleDocumentContent,
  GoogleSheetValues,
  ReviewedGmailDraft,
  SelectedGoogleFile,
} from "@/features/google-workspace/types";

export const DEFAULT_GOOGLE_SHEET_RANGE = "A1:C10";

export function isGoogleWorkspaceInputError(error: unknown): boolean {
  return (
    error instanceof BackendApiError &&
    error.status !== null &&
    error.status >= 400 &&
    error.status < 500
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`Google Workspace returned an invalid ${key}.`);
  }
  return value;
}

function booleanValue(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`Google Workspace returned an invalid ${key}.`);
  }
  return value;
}

async function responseRecord(
  response: Response,
): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error("Google Workspace returned an invalid response.");
  }
  return payload;
}

/**
 * 🚨 THE KNOB GOVERNS A PERSON'S OWN CLICK TOO — THE ONE ADAPTER.
 *
 * Until 2026-09-17 the four write routes below went straight to Google and the
 * five-mode ladder governed the AGENT path only: `gate_mutating_action` wraps the
 * tool dispatch table, not these routers. So an organization that set
 * `hitl.google.attended_file_write` to "review required" changed nothing about
 * what a person's own button did, and no screen said so — a knob that governs
 * nothing, which Law 6 makes the same defect as no knob at all (round-2 hostile
 * verification, common-docs
 * `/projects/google-native/VERIFY-U-P4-U-M1-R2.md` § A-vii).
 *
 * THE SERVER NOW OWNS THAT JUDGEMENT (aidream lane B-8): when the effective mode
 * is 4 or 5 these endpoints write NOTHING and answer
 *
 *     HTTP 202  { "proposed": true, "assist_id": "<uuid>", "mode": "mode_4" }
 *
 * having filed the change in the ONE approval queue. Every caller of these four
 * functions therefore gets a UNION, and TypeScript makes reading it mandatory —
 * a caller that said "Written" over a 202 would be the screen lying about a
 * change that has not happened.
 *
 * A 202 whose body this cannot read is a REFUSAL with a remedy, never a quiet
 * success: the change may be queued or may not exist at all, and only the queue
 * can say.
 */
export interface GoogleWriteProposed {
  proposed: true;
  /** The approval-queue row id — `/approvals?item=<assistId>` opens it. */
  assistId: string;
  /** The mode that decided it, verbatim from the server. */
  mode: string;
}

export type GoogleWriteOutcome<T> =
  | { proposed: false; result: T }
  | GoogleWriteProposed;

/** The door to the queued proposal. One place builds it. */
export function approvalQueueHref(assistId: string): string {
  return `/approvals?item=${encodeURIComponent(assistId)}`;
}

/** The sentence every caller says when a write became a proposal instead. */
export const SENT_FOR_APPROVAL_MESSAGE =
  "Sent for approval instead — it is in your approval queue";

async function writeOutcome<T>(
  response: Response,
  build: (body: Record<string, unknown>) => T,
): Promise<GoogleWriteOutcome<T>> {
  const body = await responseRecord(response);
  if (response.status !== 202 && body.proposed !== true) {
    return { proposed: false, result: build(body) };
  }
  const assistId = body.assist_id;
  const mode = body.mode;
  if (typeof assistId !== "string" || assistId.length === 0) {
    throw new Error(
      "Google Workspace said this change needs an approval but did not say which one, so nothing can be shown. Open your approval queue to see whether it was filed.",
    );
  }
  return {
    proposed: true,
    assistId,
    mode: typeof mode === "string" ? mode : "unknown",
  };
}

export async function registerSelectedGoogleFile(
  connectionId: string,
  fileId: string,
): Promise<SelectedGoogleFile> {
  const response = await postGoogleBackend(
    "/api/google-workspace/files/register",
    { connection_id: connectionId, file_id: fileId },
    "Unable to register the selected Google file.",
  );
  return selectedFile(await responseRecord(response));
}

function selectedFile(body: Record<string, unknown>): SelectedGoogleFile {
  const resourceType = requiredString(body, "resource_type");
  if (
    resourceType !== "google_document" &&
    resourceType !== "google_spreadsheet"
  ) {
    throw new Error("Google Workspace returned an unsupported file type.");
  }
  const webViewLink = body.web_view_link;
  if (webViewLink !== null && typeof webViewLink !== "string") {
    throw new Error("Google Workspace returned an invalid file link.");
  }
  return {
    id: requiredString(body, "id"),
    connectionId: requiredString(body, "connection_id"),
    resourceType,
    fileId: requiredString(body, "file_id"),
    name: requiredString(body, "name"),
    mimeType: requiredString(body, "mime_type"),
    webViewLink,
  };
}

/**
 * Create a NEW Doc in the user's own Drive and register it.
 *
 * Still `drive.file`: the scope covers files this app creates for the user, not
 * their existing Drive. The new file joins the same registry a Picker-selected
 * file joins, so every later read or write passes the same boundary check and
 * it appears in the same "files AI Matrx can reach" list.
 */
export async function createGoogleDocument(
  connectionId: string,
  title: string,
  text: string,
): Promise<GoogleWriteOutcome<SelectedGoogleFile>> {
  const response = await postGoogleBackend(
    "/api/google-workspace/documents/create",
    { connection_id: connectionId, title, text },
    "Unable to create the Google Doc.",
  );
  return writeOutcome(response, selectedFile);
}

/** Create a NEW Sheet in the user's own Drive and register it. */
export async function createGoogleSheet(
  connectionId: string,
  title: string,
  values: string[][],
): Promise<GoogleWriteOutcome<SelectedGoogleFile>> {
  const response = await postGoogleBackend(
    "/api/google-workspace/sheets/create",
    { connection_id: connectionId, title, values },
    "Unable to create the Google Sheet.",
  );
  return writeOutcome(response, selectedFile);
}

export async function readGoogleDocument(
  connectionId: string,
  fileId: string,
): Promise<GoogleDocumentContent> {
  const response = await postGoogleBackend(
    "/api/google-workspace/documents/read",
    { connection_id: connectionId, file_id: fileId },
    "Unable to read the selected Google Doc.",
  );
  const body = await responseRecord(response);
  return {
    fileId: requiredString(body, "file_id"),
    title: requiredString(body, "title"),
    text: requiredString(body, "text"),
    truncated: booleanValue(body, "truncated"),
  };
}

export async function appendGoogleDocument(
  connectionId: string,
  fileId: string,
  text: string,
): Promise<GoogleWriteOutcome<GoogleDocumentContent>> {
  const response = await postGoogleBackend(
    "/api/google-workspace/documents/append",
    { connection_id: connectionId, file_id: fileId, text },
    "Unable to append to the selected Google Doc.",
  );
  return writeOutcome(response, (body) => ({
    fileId: requiredString(body, "file_id"),
    title: requiredString(body, "title"),
    text: requiredString(body, "text"),
    truncated: booleanValue(body, "truncated"),
  }));
}

function stringMatrix(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    throw new Error("Google Sheets returned invalid values.");
  }
  return value.map((row) => {
    if (!Array.isArray(row) || row.some((cell) => typeof cell !== "string")) {
      throw new Error("Google Sheets returned an invalid row.");
    }
    return row;
  });
}

function sheetValues(body: Record<string, unknown>): GoogleSheetValues {
  return {
    fileId: requiredString(body, "file_id"),
    range: requiredString(body, "range"),
    values: stringMatrix(body.values),
    truncated: booleanValue(body, "truncated"),
  };
}

export async function readGoogleSheet(
  connectionId: string,
  fileId: string,
  rangeA1: string,
): Promise<GoogleSheetValues> {
  const response = await postGoogleBackend(
    "/api/google-workspace/sheets/read",
    { connection_id: connectionId, file_id: fileId, range_a1: rangeA1 },
    "Unable to read the selected Google Sheet.",
  );
  return sheetValues(await responseRecord(response));
}

export async function writeGoogleSheet(
  connectionId: string,
  fileId: string,
  rangeA1: string,
  values: string[][],
): Promise<GoogleWriteOutcome<GoogleSheetValues>> {
  const response = await postGoogleBackend(
    "/api/google-workspace/sheets/write",
    {
      connection_id: connectionId,
      file_id: fileId,
      range_a1: rangeA1,
      values,
    },
    "Unable to update the selected Google Sheet.",
  );
  return writeOutcome(response, sheetValues);
}

export async function sendReviewedGmail(
  draft: ReviewedGmailDraft,
): Promise<string> {
  const response = await postGoogleBackend(
    "/api/google-workspace/gmail/send-reviewed",
    {
      connection_id: draft.connectionId,
      to: draft.to,
      cc: draft.cc,
      subject: draft.subject,
      body: draft.body,
      user_confirmed: true,
    },
    "Unable to send the reviewed Gmail message.",
  );
  return requiredString(await responseRecord(response), "message_id");
}
