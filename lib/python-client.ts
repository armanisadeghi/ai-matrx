/**
 * lib/python-client.ts
 *
 * The universal typed REST client for the Python FastAPI backend.
 *
 * Used by every feature that talks to the Python backend over REST (files,
 * rag, page-extraction, file-analysis, image-studio, pdf-extractor, etc.).
 * Cloud-files originally owned this module under `features/files/api/client`;
 * it was promoted to `lib/` so the `features/files/client/*` ring-fence can
 * land without breaking unrelated callers.
 *
 * Key responsibilities:
 *   - Attach Supabase JWT as `Authorization: Bearer ...` on every call.
 *   - Generate a `X-Request-Id` per mutation for realtime-echo dedup.
 *   - Normalize errors to BackendApiError via the existing parseHttpError.
 *   - Support JSON, multipart upload, download-as-blob, DELETE, PATCH.
 *
 * Why a purpose-built client here (vs reusing lib/api/backend-client.ts):
 *   - We need DELETE/PATCH — the shared BackendClient only has POST/GET/upload.
 *   - Request-ID on EVERY mutation is mandatory for our realtime dedup model.
 *   - This client uniformly threads the guest fingerprint header alongside JWT.
 *
 * If BackendClient gains DELETE/PATCH/request-id support in the future, we can
 * collapse this back into it.
 */

import { parseHttpError, BackendApiError } from "@/lib/api/errors";
import { BACKEND_URLS } from "@/lib/api/endpoints";
import { supabase } from "@/utils/supabase/client";
import { getStore } from "@/lib/redux/store-singleton";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { extractErrorMessage } from "@/utils/errors";
import { getCachedFingerprint } from "@/lib/services/fingerprint-service";

// ---------------------------------------------------------------------------
// Request ID helper
// ---------------------------------------------------------------------------

/**
 * Generates a stable UUID for a request. Exposed so thunks can pass it to the
 * request ledger BEFORE dispatching the API call.
 */
export function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes (SSR in Node without crypto.randomUUID).
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

/**
 * Resolves the active backend URL the browser should hit.
 *
 * Priority:
 *   1. Explicit `override` (tests, edge cases).
 *   2. Redux `apiConfigSlice.activeServer` (set by the admin server-toggle UI
 *      — `production` / `development` / `staging` / `localhost` / `gpu` /
 *      `custom`). This is the SAME selector `useBackendApi` reads, so the
 *      cloud-files client follows whichever server the user picked instead
 *      of hard-locking to production.
 *   3. Env-var fallback for runtimes without a store yet (rare — e.g. a
 *      module-level call before the StoreProvider mounts).
 *
 * **Bug fix 2026-04-24:** before this change, the cloud-files client read
 * `BACKEND_URLS.production` directly and ignored the localhost toggle, so
 * dev traffic never hit a local Python server. See
 * [features/files/migration/INVENTORY.md] under Phase 12.
 */
export function resolveBaseUrl(override?: string): string {
  if (override) return override.replace(/\/$/, "");

  // 1. Honor the active server from Redux (the same selector useBackendApi reads).
  const store = getStore();
  if (store) {
    try {
      const fromStore = selectResolvedBaseUrl(
        store.getState() as Parameters<typeof selectResolvedBaseUrl>[0],
      );
      if (fromStore) return fromStore.replace(/\/$/, "");
    } catch {
      // Selector failed (slice not registered yet, etc.) — fall through.
    }
  }

  // 2. Env-var fallback for early/SSR contexts.
  const configured =
    (BACKEND_URLS.production as string | undefined) ||
    (process.env.NEXT_PUBLIC_BACKEND_URL as string | undefined);
  if (!configured) {
    throw new BackendApiError({
      code: "cloud_sync_unavailable",
      detail: "NEXT_PUBLIC_BACKEND_URL is not configured",
      userMessage: "Cloud sync is unavailable. Contact support.",
      status: 503,
    });
  }
  return configured.replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------

/**
 * Resolve the access token for the current request. Returns `null` for guests
 * (no Supabase session); the caller decides whether that's acceptable based
 * on whether a guest fingerprint is available.
 */
async function getAccessTokenOrNull(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) return null;
  return data.session.access_token;
}

// ---------------------------------------------------------------------------
// Common request options
// ---------------------------------------------------------------------------

export interface RequestOptions {
  /**
   * Client-generated idempotency/dedup ID. Attached as `X-Request-Id`. If
   * omitted on a mutation, one is generated and returned on the ResponseMeta.
   */
  requestId?: string;
  signal?: AbortSignal;
  /** Override base URL (tests, staging, etc.). */
  baseUrlOverride?: string;
  /**
   * Override the guest fingerprint sent as `X-Guest-Fingerprint`. By default
   * we read it synchronously from the fingerprint service. Pass an explicit
   * value when calling from a context that has a different identity (e.g.
   * the migrate-guest-to-user endpoint, which needs the OLD fingerprint).
   */
  guestFingerprint?: string;
  /**
   * Idempotency key, sent as `X-Idempotency-Key`. When present on an
   * upload, the backend stores it in `metadata._idempotency_key` so a
   * retry of the same intended upload doesn't create a duplicate
   * version row. Generate one per intended upload (e.g. `crypto.randomUUID()`),
   * NOT per network retry — retries should reuse the same key.
   */
  idempotencyKey?: string;
  /**
   * Sent as `X-Cloud-Files-Bypass`. Must equal the backend's
   * `CLOUD_FILES_BYPASS_SECRET`. Use ONLY for trusted internal callers
   * (importers, bulk-loaders) that legitimately need to write past the
   * tier quota. Bypass does NOT disable the absolute 5GB ceiling. Never
   * thread this through user input.
   */
  cloudFilesBypass?: string;
}

export interface ResponseMeta {
  /** Echo of `X-Request-Id`. Same as the one sent, or the one auto-generated. */
  requestId: string;
  status: number;
  /** Server-side request id if the backend generates a different one. */
  serverRequestId: string | null;
}

export async function buildHeaders(
  opts: RequestOptions,
  includeContentType: boolean,
): Promise<{ headers: Record<string, string>; requestId: string }> {
  const token = await getAccessTokenOrNull();
  const fingerprint = opts.guestFingerprint ?? getCachedFingerprint();

  // Reject only when neither identity exists. Authed users still send the
  // fingerprint so the backend can correlate / migrate guest activity.
  if (!token && !fingerprint) {
    throw new BackendApiError({
      code: "auth_required",
      detail: "No active session and no guest fingerprint available",
      userMessage: "Please sign in to continue.",
      status: 401,
    });
  }

  const requestId = opts.requestId ?? newRequestId();
  const headers: Record<string, string> = {
    "X-Request-Id": requestId,
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (fingerprint) headers["X-Guest-Fingerprint"] = fingerprint;
  if (opts.idempotencyKey) headers["X-Idempotency-Key"] = opts.idempotencyKey;
  if (opts.cloudFilesBypass)
    headers["X-Cloud-Files-Bypass"] = opts.cloudFilesBypass;
  if (includeContentType) headers["Content-Type"] = "application/json";

  return { headers, requestId };
}

function meta(response: Response, requestId: string): ResponseMeta {
  return {
    requestId,
    status: response.status,
    serverRequestId: response.headers.get("x-request-id"),
  };
}

// ---------------------------------------------------------------------------
// Core methods
// ---------------------------------------------------------------------------

/** GET JSON. */
export async function getJson<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<{ data: T; meta: ResponseMeta }> {
  const { headers, requestId } = await buildHeaders(opts, false);
  const response = await fetch(
    `${resolveBaseUrl(opts.baseUrlOverride)}${path}`,
    { method: "GET", headers, signal: opts.signal },
  );
  if (!response.ok) throw await parseHttpError(response);
  const data = (await response.json()) as T;
  return { data, meta: meta(response, requestId) };
}

/** POST JSON. */
export async function postJson<T, B = unknown>(
  path: string,
  body: B,
  opts: RequestOptions = {},
): Promise<{ data: T; meta: ResponseMeta }> {
  const { headers, requestId } = await buildHeaders(opts, true);
  const response = await fetch(
    `${resolveBaseUrl(opts.baseUrlOverride)}${path}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    },
  );
  if (!response.ok) throw await parseHttpError(response);
  const data = (await response.json()) as T;
  return { data, meta: meta(response, requestId) };
}

/** PATCH JSON. */
export async function patchJson<T, B = unknown>(
  path: string,
  body: B,
  opts: RequestOptions = {},
): Promise<{ data: T; meta: ResponseMeta }> {
  const { headers, requestId } = await buildHeaders(opts, true);
  const response = await fetch(
    `${resolveBaseUrl(opts.baseUrlOverride)}${path}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    },
  );
  if (!response.ok) throw await parseHttpError(response);
  const data = (await response.json()) as T;
  return { data, meta: meta(response, requestId) };
}

/** PUT with a JSON body. Replace-style semantics — for endpoints that
 * accept the full resource (or full update body) and return the new state. */
export async function putJson<T, B = unknown>(
  path: string,
  body: B,
  opts: RequestOptions = {},
): Promise<{ data: T; meta: ResponseMeta }> {
  const { headers, requestId } = await buildHeaders(opts, true);
  const response = await fetch(
    `${resolveBaseUrl(opts.baseUrlOverride)}${path}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    },
  );
  if (!response.ok) throw await parseHttpError(response);
  const data = (await response.json()) as T;
  return { data, meta: meta(response, requestId) };
}

/** DELETE. Returns parsed JSON if the server sends one; null otherwise. */
export async function del<T = null>(
  path: string,
  opts: RequestOptions = {},
): Promise<{ data: T | null; meta: ResponseMeta }> {
  const { headers, requestId } = await buildHeaders(opts, false);
  const response = await fetch(
    `${resolveBaseUrl(opts.baseUrlOverride)}${path}`,
    { method: "DELETE", headers, signal: opts.signal },
  );
  if (!response.ok) throw await parseHttpError(response);
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : null;
  return { data, meta: meta(response, requestId) };
}

/**
 * DELETE with a JSON body. The bulk-delete endpoint takes an `{ file_ids }`
 * payload — RFC 9110 allows DELETE bodies and the Python team's contract
 * uses one, so we expose this variant explicitly.
 */
export async function delJson<T = null, B = unknown>(
  path: string,
  body: B,
  opts: RequestOptions = {},
): Promise<{ data: T | null; meta: ResponseMeta }> {
  const { headers, requestId } = await buildHeaders(opts, true);
  const response = await fetch(
    `${resolveBaseUrl(opts.baseUrlOverride)}${path}`,
    {
      method: "DELETE",
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    },
  );
  if (!response.ok) throw await parseHttpError(response);
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : null;
  return { data, meta: meta(response, requestId) };
}

/**
 * Multipart upload WITHOUT progress. Use `uploadWithProgress` for UI.
 */
export async function postMultipart<T>(
  path: string,
  form: FormData,
  opts: RequestOptions = {},
): Promise<{ data: T; meta: ResponseMeta }> {
  const { headers, requestId } = await buildHeaders(opts, false);
  // Never set Content-Type for FormData — the browser adds the boundary.
  const response = await fetch(
    `${resolveBaseUrl(opts.baseUrlOverride)}${path}`,
    { method: "POST", headers, body: form, signal: opts.signal },
  );
  if (!response.ok) throw await parseHttpError(response);
  const data = (await response.json()) as T;
  return { data, meta: meta(response, requestId) };
}

/**
 * Multipart upload WITH progress via XMLHttpRequest.
 * `fetch` doesn't expose upload progress — XHR is still the only path.
 */
export interface UploadProgressEvent {
  loaded: number;
  total: number;
}

export async function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress: (event: UploadProgressEvent) => void,
  opts: RequestOptions = {},
): Promise<{ data: T; meta: ResponseMeta }> {
  const token = await getAccessTokenOrNull();
  const fingerprint = opts.guestFingerprint ?? getCachedFingerprint();
  if (!token && !fingerprint) {
    throw new BackendApiError({
      code: "auth_required",
      detail: "No active session and no guest fingerprint available",
      userMessage: "Please sign in to continue.",
      status: 401,
    });
  }
  const requestId = opts.requestId ?? newRequestId();
  const url = `${resolveBaseUrl(opts.baseUrlOverride)}${path}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (fingerprint) xhr.setRequestHeader("X-Guest-Fingerprint", fingerprint);
    if (opts.idempotencyKey)
      xhr.setRequestHeader("X-Idempotency-Key", opts.idempotencyKey);
    if (opts.cloudFilesBypass)
      xhr.setRequestHeader("X-Cloud-Files-Bypass", opts.cloudFilesBypass);
    xhr.setRequestHeader("X-Request-Id", requestId);
    xhr.setRequestHeader("Accept", "application/json");

    xhr.upload.addEventListener("progress", (ev) => {
      if (ev.lengthComputable) {
        onProgress({ loaded: ev.loaded, total: ev.total });
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as T;
          resolve({
            data,
            meta: {
              requestId,
              status: xhr.status,
              serverRequestId:
                xhr.getResponseHeader("x-request-id") ?? null,
            },
          });
        } catch (err) {
          reject(
            new BackendApiError({
              code: "internal",
              detail: `Failed to parse upload response: ${extractErrorMessage(err)}`,
              userMessage: "Upload succeeded but response was malformed.",
              status: xhr.status,
              requestId,
            }),
          );
        }
        return;
      }

      // Error path — try to parse structured error
      let body: Record<string, unknown> | null = null;
      try {
        body = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        body = null;
      }
      reject(
        new BackendApiError({
          code:
            (body?.error as string) ??
            statusToCloudFilesCode(xhr.status),
          detail: (body?.message as string) ?? `HTTP ${xhr.status}`,
          userMessage:
            (body?.user_message as string) ??
            (body?.message as string) ??
            `Upload failed (${xhr.status})`,
          details: body?.details ?? null,
          requestId: (body?.request_id as string) ?? requestId,
          status: xhr.status,
        }),
      );
    });

    xhr.addEventListener("error", () => {
      reject(
        new BackendApiError({
          code: "internal",
          detail: "Network error during upload",
          userMessage: "Upload failed — check your connection.",
          requestId,
        }),
      );
    });

    xhr.addEventListener("abort", () => {
      reject(
        new BackendApiError({
          code: "invalid_request",
          detail: "Upload aborted",
          userMessage: "Upload cancelled.",
          requestId,
        }),
      );
    });

    if (opts.signal) {
      if (opts.signal.aborted) {
        xhr.abort();
      } else {
        opts.signal.addEventListener("abort", () => xhr.abort(), {
          once: true,
        });
      }
    }

    xhr.send(form);
  });
}

/** Download a byte stream as a Blob. */
export async function downloadBlob(
  path: string,
  opts: RequestOptions = {},
): Promise<{ blob: Blob; meta: ResponseMeta; filename: string | null }> {
  const { headers, requestId } = await buildHeaders(opts, false);
  const response = await fetch(
    `${resolveBaseUrl(opts.baseUrlOverride)}${path}`,
    { method: "GET", headers, signal: opts.signal },
  );
  if (!response.ok) throw await parseHttpError(response);
  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition");
  const filename = parseFilename(contentDisposition);
  return { blob, meta: meta(response, requestId), filename };
}

// ---------------------------------------------------------------------------
// Download WITH progress
// ---------------------------------------------------------------------------
//
// `fetch()` doesn't expose a usable progress event for downloads — you can
// stream chunks via response.body.getReader() and count bytes, but you
// don't get a reliable Content-Length until the response headers arrive,
// and there's no way to combine the streamed response with `response.blob()`
// without keeping all chunks in memory yourself anyway. XHR is still the
// only path that gives us a clean (loaded, total) progress signal AND a
// final Blob, so we use it for any caller that wants to render
// "Downloading 6.2 / 10 MB…" UI.

export interface DownloadProgressEvent {
  /** Bytes received so far. */
  loaded: number;
  /** Total bytes when the server advertised Content-Length; null otherwise. */
  total: number | null;
}

/**
 * Same as `downloadBlob` but reports progress via `onProgress`. The
 * progress callback fires on every chunk received and once at the end.
 *
 * Falls through to the same auth (Authorization + X-Guest-Fingerprint),
 * request-id, idempotency-key, and bypass-secret plumbing as the rest
 * of the client — see `buildHeaders` for the canonical list.
 */
export async function downloadBlobWithProgress(
  path: string,
  onProgress: (event: DownloadProgressEvent) => void,
  opts: RequestOptions = {},
): Promise<{ blob: Blob; meta: ResponseMeta; filename: string | null }> {
  const token = await getAccessTokenOrNull();
  const fingerprint = opts.guestFingerprint ?? getCachedFingerprint();
  if (!token && !fingerprint) {
    throw new BackendApiError({
      code: "auth_required",
      detail: "No active session and no guest fingerprint available",
      userMessage: "Please sign in to continue.",
      status: 401,
    });
  }
  const requestId = opts.requestId ?? newRequestId();
  const url = `${resolveBaseUrl(opts.baseUrlOverride)}${path}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "blob";
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (fingerprint) xhr.setRequestHeader("X-Guest-Fingerprint", fingerprint);
    if (opts.idempotencyKey)
      xhr.setRequestHeader("X-Idempotency-Key", opts.idempotencyKey);
    if (opts.cloudFilesBypass)
      xhr.setRequestHeader("X-Cloud-Files-Bypass", opts.cloudFilesBypass);
    xhr.setRequestHeader("X-Request-Id", requestId);
    xhr.setRequestHeader("Accept", "*/*");

    xhr.addEventListener("progress", (ev) => {
      onProgress({
        loaded: ev.loaded,
        total: ev.lengthComputable ? ev.total : null,
      });
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const blob = xhr.response as Blob;
        const contentDisposition = xhr.getResponseHeader("content-disposition");
        const filename = parseFilename(contentDisposition);
        // Final progress notification — many servers don't fire a final
        // `progress` event with `loaded === total`. Make sure the UI
        // shows 100% before transitioning to the rendered preview.
        onProgress({ loaded: blob.size, total: blob.size });
        resolve({
          blob,
          meta: {
            requestId,
            status: xhr.status,
            serverRequestId:
              xhr.getResponseHeader("x-request-id") ?? null,
          },
          filename,
        });
        return;
      }
      reject(
        new BackendApiError({
          code: statusToCloudFilesCode(xhr.status),
          detail: `HTTP ${xhr.status}`,
          userMessage: `Download failed (${xhr.status}).`,
          status: xhr.status,
          requestId,
        }),
      );
    });

    xhr.addEventListener("error", () => {
      reject(
        new BackendApiError({
          code: "internal",
          detail: "Network error during download",
          userMessage: "Download failed — check your connection.",
          requestId,
        }),
      );
    });

    xhr.addEventListener("abort", () => {
      reject(
        new BackendApiError({
          code: "invalid_request",
          detail: "Download aborted",
          userMessage: "Download cancelled.",
          requestId,
        }),
      );
    });

    if (opts.signal) {
      if (opts.signal.aborted) {
        xhr.abort();
      } else {
        opts.signal.addEventListener("abort", () => xhr.abort(), {
          once: true,
        });
      }
    }

    xhr.send();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  // Prefer RFC 5987 UTF-8 form: filename*=UTF-8''encoded
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(contentDisposition);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(contentDisposition);
  return plain ? plain[1].trim() : null;
}

function statusToCloudFilesCode(status: number): string {
  switch (status) {
    case 400:
      return "invalid_request";
    case 401:
      return "auth_required";
    case 403:
      return "permission_denied";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 413:
      // Could be `file_too_large`, `storage_quota_exceeded`,
      // `daily_uploads_exceeded`, etc. The body's `error` field carries
      // the precise code; this is just the fallback when there isn't one.
      return "file_too_large";
    case 429:
      return "rate_limited";
    case 503:
      return "cloud_sync_unavailable";
    default:
      return status >= 500 ? "internal" : "invalid_request";
  }
}

// ---------------------------------------------------------------------------
// Public endpoints (no auth required) — used by /share/:token public route
// ---------------------------------------------------------------------------

/** Public GET — does NOT attach Authorization. */
export async function publicGetJson<T>(
  path: string,
  opts: { signal?: AbortSignal; baseUrlOverride?: string } = {},
): Promise<T> {
  const response = await fetch(
    `${resolveBaseUrl(opts.baseUrlOverride)}${path}`,
    { method: "GET", headers: { Accept: "application/json" }, signal: opts.signal },
  );
  if (!response.ok) throw await parseHttpError(response);
  return (await response.json()) as T;
}

/** Public blob download — no auth. */
export async function publicDownloadBlob(
  path: string,
  opts: { signal?: AbortSignal; baseUrlOverride?: string } = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await fetch(
    `${resolveBaseUrl(opts.baseUrlOverride)}${path}`,
    { method: "GET", signal: opts.signal },
  );
  if (!response.ok) throw await parseHttpError(response);
  const blob = await response.blob();
  const filename = parseFilename(response.headers.get("content-disposition"));
  return { blob, filename };
}
