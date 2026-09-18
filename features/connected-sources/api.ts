/**
 * Every call the Browse-everything screen makes, through the ONE door.
 *
 * `callApi` owns auth, base URL, organization scope and error capture. Paths
 * and bodies are typed by the GENERATED contract
 * (`types/python-generated/api-types.ts`) — the `/connected-sources/*`
 * operations landed there on 2026-09-18 and the contract-ahead augmentation
 * that stood in for them deleted itself, exactly as its header promised.
 *
 * WHY THESE READS GO THROUGH THE SERVER AND NOT SUPABASE. The house rule is
 * that rows go direct to Supabase — but these rows are not in our database at
 * all. They are files in someone's OneDrive, messages in their mailbox, and
 * comments on their Google Doc, reachable only with a delegated OAuth token
 * that lives in the Vault and must never reach a browser. The server is the
 * only place that can hold it.
 *
 * NOTHING HERE IS CAST. `callApi` hands back `unknown`, and a cast would mean
 * this file asserting a shape nobody checked — the exact defect the typed
 * client exists to prevent. Every response is narrowed by a guard, and a
 * response that does not match raises a sentence instead of poisoning the
 * screen with undefined fields.
 */

import type { AppDispatch } from "@/lib/redux/store";
import { callApi } from "@/lib/api/call-api";
import type { ApiCallError } from "@/lib/api/call-api";

import type {
  ConnectedAdapterRow,
  ConnectedBrowseRequest,
  ConnectedBrowseResponse,
  ConnectedSourceRow,
  GoogleCommentsResponse,
  GooglePresentationResponse,
  GoogleRevisionsResponse,
} from "./types";

export class ConnectedSourcesError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly retryable: boolean;
  /** The delegated scope that would unlock this, when the server named one. */
  readonly scope: string | null;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      retryable?: boolean;
      scope?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "ConnectedSourcesError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.scope = options.scope ?? null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detailOf(error: ApiCallError): Record<string, unknown> | null {
  const detail = error.serverDetail;
  if (isRecord(detail)) {
    const inner = detail.detail;
    return isRecord(inner) ? inner : detail;
  }
  return null;
}

function toError(error: ApiCallError): ConnectedSourcesError {
  const detail = detailOf(error);
  const message =
    (detail && typeof detail.message === "string" && detail.message) ||
    (typeof error.serverDetail === "string" ? error.serverDetail : "") ||
    (error.status === 404
      ? "This server does not answer at the connected-sources address yet, so nothing can be browsed. It arrives with the next server release; nothing you did caused this."
      : error.message) ||
    "The server did not say why this failed. Try again, and tell an operator if it keeps happening.";
  return new ConnectedSourcesError(message, {
    status: error.status,
    code:
      detail && typeof detail.code === "string" ? detail.code : (error.code ?? error.type),
    retryable: error.status === 404 || error.type === "network_error",
    scope: detail && typeof detail.scope === "string" ? detail.scope : null,
  });
}

/** Narrow, never cast: a response that is not the shape we asked for is a failure. */
function requireShape<T>(
  value: unknown,
  guard: (candidate: unknown) => candidate is T,
  what: string,
): T {
  if (!guard(value)) {
    throw new ConnectedSourcesError(
      `The server answered with something that is not ${what}. Nothing is shown rather than showing you a half-read answer.`,
      { code: "malformed_response" },
    );
  }
  return value;
}

function isAdapterRow(value: unknown): value is ConnectedAdapterRow {
  return (
    isRecord(value) &&
    typeof value.adapter === "string" &&
    typeof value.provider === "string" &&
    typeof value.title === "string" &&
    typeof value.connected === "boolean" &&
    Array.isArray(value.connections)
  );
}

function isAdapterList(value: unknown): value is { adapters: ConnectedAdapterRow[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.adapters) &&
    value.adapters.every(isAdapterRow)
  );
}

function isSourceRow(value: unknown): value is ConnectedSourceRow {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.external_id === "string" &&
    typeof value.adapter === "string" &&
    typeof value.kind === "string" &&
    typeof value.title === "string"
  );
}

function isBrowseResponse(value: unknown): value is ConnectedBrowseResponse {
  return (
    isRecord(value) &&
    typeof value.adapter === "string" &&
    Array.isArray(value.sources) &&
    value.sources.every(isSourceRow) &&
    typeof value.scanned === "number" &&
    typeof value.matched === "number" &&
    typeof value.has_more === "boolean" &&
    typeof value.summary === "string"
  );
}

function isCommentsResponse(value: unknown): value is GoogleCommentsResponse {
  return (
    isRecord(value) &&
    typeof value.file_id === "string" &&
    Array.isArray(value.comments) &&
    typeof value.total_replies === "number"
  );
}

function isRevisionsResponse(value: unknown): value is GoogleRevisionsResponse {
  return (
    isRecord(value) &&
    typeof value.file_id === "string" &&
    Array.isArray(value.revisions)
  );
}

function isPresentationResponse(
  value: unknown,
): value is GooglePresentationResponse {
  return (
    isRecord(value) &&
    typeof value.file_id === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.slides)
  );
}

export async function listConnectedAdapters(
  dispatch: AppDispatch,
): Promise<ConnectedAdapterRow[]> {
  const result = await dispatch(
    callApi({
      path: "/connected-sources/adapters",
      method: "GET",
      expectedErrorStatuses: [401, 404],
    }),
  );
  if (result.error) throw toError(result.error);
  return requireShape(result.data, isAdapterList, "a list of adapters").adapters;
}

export async function browseConnectedSources(
  dispatch: AppDispatch,
  request: ConnectedBrowseRequest,
): Promise<ConnectedBrowseResponse> {
  const result = await dispatch(
    callApi({
      path: "/connected-sources/browse",
      method: "POST",
      body: request,
      expectedErrorStatuses: [401, 403, 404, 409, 422],
      // Walking a provider is slow work by nature; the default client timeout
      // is tuned for our own database, not someone else's mailbox.
      connectTimeoutMs: 120_000,
    }),
  );
  if (result.error) throw toError(result.error);
  return requireShape(result.data, isBrowseResponse, "a page of sources");
}

export async function readGoogleComments(
  dispatch: AppDispatch,
  connectionId: string,
  fileId: string,
): Promise<GoogleCommentsResponse> {
  const result = await dispatch(
    callApi({
      path: "/connected-sources/google/comments",
      method: "POST",
      body: { connection_id: connectionId, file_id: fileId },
      expectedErrorStatuses: [401, 403, 404, 422],
    }),
  );
  if (result.error) throw toError(result.error);
  return requireShape(result.data, isCommentsResponse, "a comment thread");
}

export async function readGoogleRevisions(
  dispatch: AppDispatch,
  connectionId: string,
  fileId: string,
): Promise<GoogleRevisionsResponse> {
  const result = await dispatch(
    callApi({
      path: "/connected-sources/google/revisions",
      method: "POST",
      body: { connection_id: connectionId, file_id: fileId },
      expectedErrorStatuses: [401, 403, 404, 422],
    }),
  );
  if (result.error) throw toError(result.error);
  return requireShape(result.data, isRevisionsResponse, "a revision history");
}

export async function readGooglePresentation(
  dispatch: AppDispatch,
  connectionId: string,
  fileId: string,
): Promise<GooglePresentationResponse> {
  const result = await dispatch(
    callApi({
      path: "/connected-sources/google/presentation",
      method: "POST",
      body: { connection_id: connectionId, file_id: fileId },
      expectedErrorStatuses: [401, 403, 404, 422],
    }),
  );
  if (result.error) throw toError(result.error);
  return requireShape(result.data, isPresentationResponse, "a presentation");
}
