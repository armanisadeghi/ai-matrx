/**
 * features/files/upload/cloudUpload.ts
 *
 * THE single source of truth for file uploads in this app.
 *
 * ════════════════════════════════════════════════════════════════════════
 *
 * Why this exists
 * ───────────────
 * The single underlying upload primitive. Public callers go through the
 * universal file handler (`fileHandler.upload(...)` /
 * `useFileUpload`), which calls this. Server-side routes use
 * `Api.Server.uploadAndShare` which wraps the same Python `/files/upload`
 * endpoint with a server context.
 *
 * Rule: **every upload in the app goes through `cloudUpload` (this file)
 * via the universal handler, OR through `Api.Server.uploadAndShare`.**
 * Never call `supabase.from("cld_*").upsert(...)` or `ensureFolderPath`
 * from a code path whose goal is "upload a file." The Python backend
 * auto-creates any missing folders when you POST a full `file_path` —
 * the browser never needs to touch `cld_folders` directly. That
 * sidesteps the known RLS recursion bug AND keeps logic centralized.
 *
 * What this module owns:
 *   • Resolving a logical `file_path` from caller-supplied options.
 *   • Calling the Python `/files/upload` endpoint with progress.
 *   • Optionally creating a permanent share link.
 *   • Dispatching Redux upserts so the slice stays in sync.
 *   • Returning a uniform `{ ok: true, ... } | { ok: false, error }` shape
 *     — never null, never `[object Object]`, never silent.
 *
 * What this module does NOT do:
 *   • Touch `supabase.from("cld_*")` directly. Reads happen via the
 *     SECURITY DEFINER tree RPC (`cld_get_user_file_tree`) and
 *     supabase realtime. Writes happen via the Python backend.
 *   • Block on folder lookups. The backend handles folder creation
 *     atomically as part of upload.
 */

import {
  uploadFile as Files_uploadFile,
  uploadFileWithProgress as Files_uploadFileWithProgress,
} from "@/features/files/api/files";
import { createFileShareLink } from "@/features/files/api/share-links";
import { pythonShareUrl } from "@/features/files/handler/utils/python-base";
import {
  newRequestId,
  type ResponseMeta,
  type UploadProgressEvent,
} from "@/lib/python-client";
import { extractErrorMessage } from "@/utils/errors";
import {
  registerRequest,
  releaseRequest,
} from "@/features/files/redux/request-ledger";
import {
  attachChildToFolder,
  trackUploadStart,
  updateUploadProgress,
  updateUploadStatus,
  upsertFile,
} from "@/features/files/redux/slice";
import { apiFileRecordToCloudFile } from "@/features/files/redux/converters";
import type { AppDispatch } from "@/lib/redux/store";
import type { PermissionLevel, Visibility } from "@/features/files/types";

// ─── Types ───────────────────────────────────────────────────────────────

export interface CloudUploadOptions {
  /**
   * Full logical file path INCLUDING the filename. Use this when you
   * want to control the exact name (e.g. server-generated "{uuid}.jpg").
   */
  filePath?: string;
  /**
   * Folder path (no filename). The browser appends `file.name`
   * automatically. The Python backend auto-creates any missing
   * folders. This is the **preferred** option for almost every caller.
   *
   * Example: `folderPath: "Images/Chat"` → uploaded path becomes
   * `"Images/Chat/<file.name>"`.
   */
  folderPath?: string;
  /**
   * Existing parentFolderId — only useful when you've already loaded the
   * folder via the tree RPC or realtime. Most callers should pass
   * `folderPath` instead so the backend handles folder creation.
   */
  parentFolderId?: string | null;
  visibility?: Visibility;
  shareWith?: string[];
  shareLevel?: PermissionLevel;
  changeSummary?: string;
  metadata?: Record<string, unknown>;
  /** Progress callback (XHR upload progress). */
  onProgress?: (event: UploadProgressEvent) => void;
  signal?: AbortSignal;
  /**
   * If true, also creates a permanent share link after upload. Returns
   * the `shareUrl` (`/share/:token`) and the raw `shareToken`.
   */
  createShareLink?: boolean;
  /**
   * Share-link permission. Note: `admin` is only valid on direct
   * `public.permissions` grants — share links accept `read` / `write`.
   */
  shareLinkPermissionLevel?: "read" | "write";
  shareLinkExpiresAt?: string | null;
  shareLinkMaxUses?: number | null;
}

export interface CloudUploadSuccess {
  ok: true;
  fileId: string;
  filePath: string;
  fileSize: number | null;
  versionNumber: number;
  /** Backend-provided URL (storage URL — typically requires auth or signed). */
  url: string | null;
  shareToken?: string;
  /**
   * The PUBLIC LANDING PAGE for the share link, e.g.
   * `https://app.example.com/share/<token>`. Renders an HTML page with
   * file metadata and a download button. **Do NOT** use this for
   * `<img src>`, `<video src>`, or hot-linking — the page is HTML, not
   * the file bytes.
   */
  shareUrl?: string;
  /**
   * The PUBLIC DIRECT URL for the file bytes — points at Python's
   * `{BACKEND}/share/{token}` resolver, which 302-redirects to a freshly
   * signed S3 URL each time it's hit. Embed in `<img src>`, `<a href
   * download>`, Slack/Notion unfurls, OG images. No Next.js hop.
   *
   * Populated whenever `shareUrl` is — they always go in pairs because
   * both are derived from the same share token.
   */
  directUrl?: string;
}

export interface CloudUploadFailure {
  ok: false;
  error: string;
  /** Backend error code if available (e.g. "auth_required", "file_too_large"). */
  errorCode?: string;
  /** Filename for caller reference. */
  fileName: string;
}

export type CloudUploadResult = CloudUploadSuccess | CloudUploadFailure;

/**
 * Type guard — when `result.ok` discriminator narrowing isn't enough for
 * TS (e.g. inside loops or where the union is inferred indirectly),
 * call this and the compiler will narrow the branches correctly.
 */
export function isCloudUploadFailure(
  result: CloudUploadResult,
): result is CloudUploadFailure {
  return result.ok === false;
}

export function isCloudUploadSuccess(
  result: CloudUploadResult,
): result is CloudUploadSuccess {
  return result.ok === true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function resolveFilePath(file: File, options: CloudUploadOptions): string {
  if (options.filePath) return options.filePath.replace(/^\/+/, "");
  if (options.folderPath) {
    const folder = options.folderPath.replace(/^\/+|\/+$/g, "");
    return folder ? `${folder}/${file.name}` : file.name;
  }
  return file.name;
}

function buildShareUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin.replace(/\/$/, "")}/share/${token}`;
}

/**
 * Build the public DIRECT-FILE URL for a share token — points at Python's
 * `/share/{token}` resolver, which 302s to the signed S3 URL. No Next.js
 * hop. Embed in `<img src>`, `<video src>`, downloads, Slack unfurls, etc.
 */
function buildDirectShareUrl(token: string): string {
  return pythonShareUrl(token);
}

// ─── Upload primitive (no Redux side effects) ────────────────────────────

/**
 * Pure upload — POSTs to /files/upload with a full `file_path`. Backend
 * auto-creates folders. Use this when you need raw access without Redux
 * dispatches (e.g. server-side route handlers, isolated tests).
 *
 * For browser code that wants the file to appear in the UI, use
 * `cloudUpload` (with dispatch) instead.
 */
export async function cloudUploadRaw(
  file: File,
  options: CloudUploadOptions = {},
): Promise<CloudUploadResult> {
  const filePath = resolveFilePath(file, options);
  const requestId = newRequestId();

  try {
    const params = {
      file,
      filePath,
      visibility: options.visibility ?? "private",
      shareWith: options.shareWith,
      shareLevel: options.shareLevel,
      changeSummary: options.changeSummary,
      metadata: {
        // Origin tag aids backend log triage when something goes wrong.
        origin: "cloudUpload",
        ...(options.metadata ?? {}),
      },
    };

    const upload = options.onProgress
      ? await Files_uploadFileWithProgress(params, options.onProgress, {
          requestId,
          signal: options.signal,
          // Reuse requestId as the idempotency key — single intended
          // upload from the FE perspective, single key on the BE. Backend
          // stores it in `metadata._idempotency_key` so retries don't
          // double-create version rows.
          idempotencyKey: requestId,
        })
      : await Files_uploadFile(params, {
          requestId,
          signal: options.signal,
          idempotencyKey: requestId,
        });

    let shareToken: string | undefined;
    let shareUrl: string | undefined;
    let directUrl: string | undefined;
    if (options.createShareLink) {
      try {
        const linkRes = await createFileShareLink(
          upload.data.file_id,
          {
            permission_level: options.shareLinkPermissionLevel ?? "read",
            expires_at: options.shareLinkExpiresAt ?? null,
            max_uses: options.shareLinkMaxUses ?? null,
          },
          { requestId: newRequestId(), signal: options.signal },
        );
        shareToken = linkRes.data.share_token;
        shareUrl = buildShareUrl(shareToken);
        // Always emit the direct-file URL alongside the page URL.
        // Consumers default to `directUrl` for img/video/audio/iframe
        // src; `shareUrl` is for "click here to view file metadata".
        directUrl = buildDirectShareUrl(shareToken);
      } catch (linkErr) {
        // Upload succeeded; share-link creation didn't. Surface a
        // distinct error so the caller can decide whether to keep the
        // file or roll it back.
        return {
          ok: false,
          error: `File uploaded but share link couldn't be created: ${extractErrorMessage(linkErr)}`,
          errorCode: "share_link_failed",
          fileName: file.name,
        };
      }
    }

    return {
      ok: true,
      fileId: upload.data.file_id,
      filePath: upload.data.file_path,
      // Phase 0 rename — see docs/PYTHON_UPDATES.md §3.
      fileSize: upload.data.size_bytes,
      versionNumber: upload.data.version_number,
      url: upload.data.url ?? null,
      shareToken,
      shareUrl,
      directUrl,
    };
  } catch (err) {
    return {
      ok: false,
      error: extractErrorMessage(err),
      errorCode: (err as { code?: string } | null)?.code,
      fileName: file.name,
    };
  }
}

// ─── Upload with Redux side effects ──────────────────────────────────────

/**
 * Upload a single file. THIS is the function 99% of callers want.
 *
 * Side effects:
 *   • Dispatches `trackUploadStart`/`updateUploadProgress`/`updateUploadStatus`
 *     so progress bars in the UI stay in sync.
 *   • Dispatches `upsertFile` on success so the file appears in the slice
 *     immediately (no need to wait for a tree refresh).
 *   • Dispatches `attachChildToFolder` if `parentFolderId` is known.
 *
 * Returns the unified `CloudUploadResult`. Never throws — errors come
 * back as `{ ok: false, error }` so callers always have a clear path.
 */
export async function cloudUpload(
  file: File,
  options: CloudUploadOptions,
  dispatch: AppDispatch,
): Promise<CloudUploadResult> {
  const filePath = resolveFilePath(file, options);
  const requestId = newRequestId();

  // 1. Mark the upload as pending in the slice.
  dispatch(
    trackUploadStart({
      requestId,
      fileName: file.name,
      fileSize: file.size,
      parentFolderId: options.parentFolderId ?? null,
    }),
  );
  registerRequest({
    requestId,
    kind: "upload",
    resourceId: null,
    resourceType: "file",
  });

  try {
    const params = {
      file,
      filePath,
      visibility: options.visibility ?? "private",
      shareWith: options.shareWith,
      shareLevel: options.shareLevel,
      changeSummary: options.changeSummary,
      metadata: {
        origin: "cloudUpload",
        ...(options.metadata ?? {}),
      },
    };

    const upload = await Files_uploadFileWithProgress(
      params,
      (ev) => {
        dispatch(
          updateUploadProgress({
            requestId,
            bytesUploaded: ev.loaded,
          }),
        );
        options.onProgress?.(ev);
      },
      { requestId, signal: options.signal, idempotencyKey: requestId },
    );

    // 2. Slice upsert — file is now visible in the tree without
    //    waiting for the realtime echo or a refetch.
    dispatch(
      upsertFile(
        apiFileRecordToCloudFile({
          id: upload.data.file_id,
          owner_id: "",
          file_path: upload.data.file_path,
          storage_uri: upload.data.storage_uri,
          file_name: upload.data.file_path.split("/").pop() ?? file.name,
          mime_type: file.type || null,
          // Phase 0 rename — see docs/PYTHON_UPDATES.md §3.
          size_bytes: upload.data.size_bytes,
          checksum: upload.data.checksum,
          visibility: options.visibility ?? "private",
          current_version: upload.data.version_number,
          parent_folder_id: options.parentFolderId ?? null,
          metadata: options.metadata ?? {},
          created_at: null,
          updated_at: null,
          deleted_at: null,
        }),
      ),
    );
    if (options.parentFolderId) {
      dispatch(
        attachChildToFolder({
          parentFolderId: options.parentFolderId,
          kind: "file",
          id: upload.data.file_id,
        }),
      );
    }
    dispatch(
      updateUploadStatus({
        requestId,
        status: "success",
        fileId: upload.data.file_id,
      }),
    );

    // 3. Optional share link.
    let shareToken: string | undefined;
    let shareUrl: string | undefined;
    let directUrl: string | undefined;
    if (options.createShareLink) {
      try {
        const linkRes = await createFileShareLink(
          upload.data.file_id,
          {
            permission_level: options.shareLinkPermissionLevel ?? "read",
            expires_at: options.shareLinkExpiresAt ?? null,
            max_uses: options.shareLinkMaxUses ?? null,
          },
          { requestId: newRequestId(), signal: options.signal },
        );
        shareToken = linkRes.data.share_token;
        shareUrl = buildShareUrl(shareToken);
        // Always emit the direct-file URL alongside the page URL.
        // Consumers default to `directUrl` for img/video/audio/iframe
        // src; `shareUrl` is for "click here to view file metadata".
        directUrl = buildDirectShareUrl(shareToken);
      } catch (linkErr) {
        return {
          ok: false,
          error: `File uploaded but share link couldn't be created: ${extractErrorMessage(linkErr)}`,
          errorCode: "share_link_failed",
          fileName: file.name,
        };
      }
    }

    return {
      ok: true,
      fileId: upload.data.file_id,
      filePath: upload.data.file_path,
      // Phase 0 rename — see docs/PYTHON_UPDATES.md §3.
      fileSize: upload.data.size_bytes,
      versionNumber: upload.data.version_number,
      url: upload.data.url ?? null,
      shareToken,
      shareUrl,
      directUrl,
    };
  } catch (err) {
    const message = extractErrorMessage(err);
    dispatch(
      updateUploadStatus({
        requestId,
        status: "error",
        error: message,
      }),
    );
    return {
      ok: false,
      error: message,
      errorCode: (err as { code?: string } | null)?.code,
      fileName: file.name,
    };
  } finally {
    releaseRequest(requestId);
  }
}

// ─── Batch upload ────────────────────────────────────────────────────────

export interface CloudUploadManyOptions extends CloudUploadOptions {
  /** Parallel ceiling. Defaults to 3. */
  concurrency?: number;
}

export interface CloudUploadManyResult {
  successes: CloudUploadSuccess[];
  failures: CloudUploadFailure[];
}

/**
 * Upload multiple files with bounded concurrency. Returns a structured
 * result so callers can show "3 of 5 uploaded" UI cleanly.
 */
export async function cloudUploadMany(
  files: File[],
  options: CloudUploadManyOptions,
  dispatch: AppDispatch,
): Promise<CloudUploadManyResult> {
  const limit = Math.max(1, options.concurrency ?? 3);
  const successes: CloudUploadSuccess[] = [];
  const failures: CloudUploadFailure[] = [];
  const queue = [...files];

  async function worker(): Promise<void> {
    while (queue.length) {
      const file = queue.shift();
      if (!file) return;
      const result = await cloudUpload(file, options, dispatch);
      if (isCloudUploadSuccess(result)) {
        successes.push(result);
      } else {
        failures.push(result);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, files.length) }, worker),
  );

  return { successes, failures };
}

/**
 * Imperative shortcut for non-React code that still wants Redux side
 * effects. Pulls the dispatch from the store singleton.
 */
export async function cloudUploadImperative(
  file: File,
  options: CloudUploadOptions,
): Promise<CloudUploadResult> {
  const { getStore } = await import("@/lib/redux/store");
  const store = getStore();
  if (!store) {
    return {
      ok: false,
      error: "Redux store is not ready",
      errorCode: "store_not_ready",
      fileName: file.name,
    };
  }
  return cloudUpload(file, options, store.dispatch as AppDispatch);
}
