/**
 * features/files/api/server-client.ts
 *
 * Server-side variant of the cloud-files REST client. The browser client
 * ([./client.ts](./client.ts)) calls `supabase.auth.getSession()` to grab the
 * JWT — which doesn't work inside a Next.js API route / server action, where
 * the session comes from request cookies instead.
 *
 * This module exposes the same HTTP verbs but takes the JWT as an explicit
 * argument, letting server-side callers forward the user's authorization
 * without going through the browser singleton.
 *
 * USAGE (inside an App Router route handler):
 *
 *   import { createClient } from "@/utils/supabase/server";
 *   import * as Server from "@/features/files/api/server-client";
 *
 *   export async function POST(req) {
 *     const supabase = await createClient();
 *     const { data: { session } } = await supabase.auth.getSession();
 *     if (!session) return new Response("Unauthorized", { status: 401 });
 *
 *     const ctx = Server.createServerContext({ accessToken: session.access_token });
 *     const { data } = await Server.uploadFile(ctx, {
 *       file: someFileLikeObject,
 *       filePath: "Agent Apps/abc/favicon.svg",
 *       visibility: "personal",
 *     });
 *     // …
 *   }
 *
 * The returned data shape matches the browser client exactly, so downstream
 * code (converters, thunks if ever needed on the server) stays unchanged.
 */

import { parseHttpError, BackendApiError } from "@/lib/api/errors";
import { BACKEND_URLS } from "@/lib/api/endpoints";
import type {
  FilePatchRequest,
  FileRecordApi,
  FileUploadResponse,
  Visibility,
  PermissionLevel,
} from "@/features/files/types";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface ServerCloudFilesContext {
  /** Bearer token — typically `session.access_token` from the Supabase server client. */
  accessToken: string;
  /** Base URL override. Defaults to BACKEND_URLS.production / NEXT_PUBLIC_BACKEND_URL. */
  baseUrl?: string;
}

export function createServerContext(
  args: ServerCloudFilesContext,
): ServerCloudFilesContext {
  return args;
}

function resolveBaseUrl(ctx: ServerCloudFilesContext): string {
  // NEXT_PUBLIC_FILES_URL wins when set — it routes the file/asset/share API to
  // the standalone matrx-files microservice (https://files.matrxserver.com).
  // Everything else stays on the aidream backend URL. An explicit ctx.baseUrl
  // still overrides both (tests / per-call targeting).
  const configured =
    ctx.baseUrl ??
    (process.env.NEXT_PUBLIC_FILES_URL as string | undefined) ??
    (BACKEND_URLS.production as string | undefined) ??
    (process.env.NEXT_PUBLIC_BACKEND_URL_PROD as string | undefined) ??
    (process.env.NEXT_PUBLIC_BACKEND_URL as string | undefined);
  if (!configured) {
    throw new BackendApiError({
      code: "cloud_sync_unavailable",
      detail: "NEXT_PUBLIC_FILES_URL / NEXT_PUBLIC_BACKEND_URL is not configured",
      userMessage: "Cloud sync is unavailable. Contact support.",
      status: 503,
    });
  }
  return configured.replace(/\/$/, "");
}

function buildHeaders(
  ctx: ServerCloudFilesContext,
  includeContentType: boolean,
  requestId: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ctx.accessToken}`,
    Accept: "application/json",
    "X-Request-Id": requestId,
  };
  if (includeContentType) headers["Content-Type"] = "application/json";
  return headers;
}

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `srv_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Upload — takes a Uint8Array / Buffer / File-like (anything you can wrap
// into a Blob). The multipart form is constructed here.
// ---------------------------------------------------------------------------

export interface ServerUploadFileArgs {
  /** Raw bytes. A File, Blob, Buffer, or Uint8Array all work. */
  file: Blob | Buffer | Uint8Array | File;
  /** Logical path — e.g. `Agent Apps/abc/favicon.svg`. */
  filePath: string;
  /** Filename shown in the multipart request. Defaults to basename(filePath). */
  fileName?: string;
  /** Explicit content type. Recommended — especially for Uint8Array inputs. */
  contentType?: string;
  visibility?: Visibility;
  shareWith?: string[];
  shareLevel?: PermissionLevel;
  changeSummary?: string;
  metadata?: Record<string, unknown>;
}

function toBlob(
  input: ServerUploadFileArgs["file"],
  contentType?: string,
): Blob {
  if (input instanceof Blob) return input;
  // MATRX-EXCEPTION: Node's Uint8Array / Buffer are valid BlobParts at
  // runtime, but the DOM lib's BlobPart requires ArrayBufferView<ArrayBuffer>
  // while Node's types are ArrayBufferView<ArrayBufferLike> — a real lib
  // mismatch (not a design gap). Cast the entire parts array to sidestep it;
  // safe because Blob's constructor accepts any BufferSource at runtime.
  const parts = [input] as unknown as BlobPart[];
  return new Blob(parts, {
    type: contentType ?? "application/octet-stream",
  });
}

export async function uploadFile(
  ctx: ServerCloudFilesContext,
  args: ServerUploadFileArgs,
): Promise<{ data: FileUploadResponse; requestId: string }> {
  const requestId = newRequestId();
  const blob = toBlob(args.file, args.contentType);
  const fileName =
    args.fileName ??
    args.filePath.split("/").filter(Boolean).pop() ??
    "untitled";

  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("file_path", args.filePath);
  if (args.visibility) form.append("visibility", args.visibility);
  if (args.shareWith?.length)
    form.append("share_with", args.shareWith.join(","));
  if (args.shareLevel) form.append("share_level", args.shareLevel);
  if (args.changeSummary) form.append("change_summary", args.changeSummary);
  if (args.metadata)
    form.append("metadata_json", JSON.stringify(args.metadata));

  const headers = buildHeaders(ctx, false, requestId);

  const response = await fetch(`${resolveBaseUrl(ctx)}/files/upload`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!response.ok) throw await parseHttpError(response);
  const data = (await response.json()) as FileUploadResponse;
  return { data, requestId };
}

// ---------------------------------------------------------------------------
// Simple wrappers — mirror the browser client.
// ---------------------------------------------------------------------------

async function fetchJson<T>(
  ctx: ServerCloudFilesContext,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const requestId = newRequestId();
  const headers = buildHeaders(ctx, body !== undefined, requestId);
  const response = await fetch(`${resolveBaseUrl(ctx)}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw await parseHttpError(response);
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export function getFile(
  ctx: ServerCloudFilesContext,
  fileId: string,
): Promise<FileRecordApi> {
  return fetchJson<FileRecordApi>(ctx, "GET", `/files/${fileId}`);
}

export function patchFile(
  ctx: ServerCloudFilesContext,
  fileId: string,
  body: FilePatchRequest,
): Promise<FileRecordApi> {
  return fetchJson<FileRecordApi>(ctx, "PATCH", `/files/${fileId}`, body);
}

export async function deleteFile(
  ctx: ServerCloudFilesContext,
  fileId: string,
  hardDelete?: boolean,
): Promise<void> {
  const q = hardDelete ? "?hard_delete=true" : "";
  await fetchJson<null>(ctx, "DELETE", `/files/${fileId}${q}`);
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

/**
 * Mirror of aidream's `ShareLinkRecord` — a canonical `platform.share_links`
 * row as echoed by `POST /files/{id}/share-links`.
 */
export interface ServerShareLinkRecord {
  token?: string | null;
  resource_id?: string | null;
  resource_type?: string | null;
  permission_level?: string | null;
  created_by?: string | null;
  expires_at?: string | null;
  max_uses?: number | null;
  use_count?: number | null;
}

export interface ServerCreateShareLinkBody {
  /** Canonical share-link levels. Default "viewer". */
  permission_level?: "viewer" | "editor";
  expires_at?: string | null;
  max_uses?: number | null;
}

export function createFileShareLink(
  ctx: ServerCloudFilesContext,
  fileId: string,
  body: ServerCreateShareLinkBody,
): Promise<ServerShareLinkRecord> {
  return fetchJson<ServerShareLinkRecord>(
    ctx,
    "POST",
    `/files/${fileId}/share-links`,
    body,
  );
}

// ---------------------------------------------------------------------------
// Download bytes (rare from server-side, but supported for completeness).
// ---------------------------------------------------------------------------

export async function downloadFile(
  ctx: ServerCloudFilesContext,
  fileId: string,
): Promise<Blob> {
  const requestId = newRequestId();
  const headers = buildHeaders(ctx, false, requestId);
  const response = await fetch(
    `${resolveBaseUrl(ctx)}/files/${fileId}/download`,
    { method: "GET", headers },
  );
  if (!response.ok) throw await parseHttpError(response);
  return response.blob();
}

// ---------------------------------------------------------------------------
// Helper: "upload + create indefinite share link in one call" — the
// server-side mirror of `fileHandler.upload({ ..., createShareLink: true })`.
// Perfect for asset-upload routes (favicons, banners) where the goal is
// a stable URL to persist in a DB row.
// ---------------------------------------------------------------------------

export interface ServerUploadAndShareResult {
  fileId: string;
  filePath: string;
  shareToken: string;
  /** Canonical share landing page — `${appOrigin}/s/{token}`. HTML, not bytes. */
  shareUrl: string;
  /**
   * Python's clean public byte endpoint — `{backend}/share/{token}`.
   * The URL to persist anywhere the raw bytes are consumed (`<img src>`,
   * favicons, unfurls).
   */
  directUrl: string;
  requestId: string;
}

export interface ServerUploadAndShareArgs extends ServerUploadFileArgs {
  /** Share-link permission (canonical levels). Default "viewer". */
  permissionLevel?: "viewer" | "editor";
  /** Optional max-use cap. Omit for unlimited. */
  maxUses?: number;
  /** Optional expiry. Omit for indefinite. */
  expiresAt?: string;
  /**
   * Base origin for the public share URL. Required on the server since
   * there's no `window.location.origin` to fall back on — typically the
   * request's host or `process.env.NEXT_PUBLIC_APP_URL`.
   */
  appOrigin: string;
}

export async function uploadAndShare(
  ctx: ServerCloudFilesContext,
  args: ServerUploadAndShareArgs,
): Promise<ServerUploadAndShareResult> {
  const { data: uploaded, requestId } = await uploadFile(ctx, args);

  const link = await createFileShareLink(ctx, uploaded.file_id, {
    permission_level: args.permissionLevel ?? "viewer",
    expires_at: args.expiresAt ?? null,
    max_uses: args.maxUses ?? null,
  });
  if (!link.token) {
    throw new BackendApiError({
      code: "internal_error",
      detail: "Share link creation returned no token",
      userMessage: "The share link could not be created.",
      status: 500,
    });
  }

  const shareUrl = `${args.appOrigin.replace(/\/$/, "")}/s/${link.token}`;
  const directUrl = `${resolveBaseUrl(ctx)}/share/${encodeURIComponent(link.token)}`;

  return {
    fileId: uploaded.file_id,
    filePath: uploaded.file_path,
    shareToken: link.token,
    shareUrl,
    directUrl,
    requestId,
  };
}
