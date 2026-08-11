/**
 * features/files/handler/errors.ts
 *
 * Error taxonomy for the universal file handler. Every failure inside the
 * handler maps to ONE of these classes — callers `instanceof`-check to
 * decide whether to retry, refresh, surface a UI, or reject.
 *
 * The crucial distinction the handler exists to enforce:
 *
 *   - FileExpiredError  → user HAD access, the URL aged out. Auto-refresh.
 *   - FileAccessDeniedError → user does NOT have access. Reject. Never retry.
 *
 * S3 returns the same XML-wrapped 403 for both, so the resolver consults
 * our metadata BEFORE deciding which class to throw.
 */

export type FileHandlerErrorCode =
  | "expired"
  | "access_denied"
  | "not_found"
  | "deleted"
  | "share_link_invalid"
  | "external_fetch_failed"
  | "cors_blocked"
  | "mime_unknown"
  | "upload_failed"
  | "quota_exceeded"
  | "in_flight"
  | "internal";

export class FileHandlerError extends Error {
  readonly code: FileHandlerErrorCode;
  readonly fileId?: string;
  override readonly cause?: unknown;

  constructor(
    code: FileHandlerErrorCode,
    message: string,
    opts?: { fileId?: string; cause?: unknown },
  ) {
    super(message);
    this.name = "FileHandlerError";
    this.code = code;
    this.fileId = opts?.fileId;
    this.cause = opts?.cause;
  }
}

export class FileExpiredError extends FileHandlerError {
  constructor(message = "Signed URL has expired", opts?: { fileId?: string }) {
    super("expired", message, opts);
    this.name = "FileExpiredError";
  }
}

export class FileAccessDeniedError extends FileHandlerError {
  constructor(
    // Thrown ONLY on a real 403 from our own file server (resolver.ts,
    // intelligence/refresh.ts) — a proven refusal, not a guess. The sentence
    // stays plain so a surface that renders it verbatim never implies more
    // than the server actually said; a surface that can do better should
    // render `<AccessGate token="file" id={fileId}/>`, which names the owner
    // and offers a request.
    message = "This file isn't available to you.",
    opts?: { fileId?: string },
  ) {
    super("access_denied", message, opts);
    this.name = "FileAccessDeniedError";
  }
}

export class FileNotFoundError extends FileHandlerError {
  // A 404 from the file server. It proves the server could not retrieve the
  // file — NOT that the file was deleted (that is `FileDeletedError`, which
  // has a `deleted_at` to point at) and not that it never existed.
  constructor(message = "We couldn't retrieve this file.", opts?: { fileId?: string }) {
    super("not_found", message, opts);
    this.name = "FileNotFoundError";
  }
}

export class FileDeletedError extends FileHandlerError {
  constructor(message = "File is in trash", opts?: { fileId?: string }) {
    super("deleted", message, opts);
    this.name = "FileDeletedError";
  }
}

export class ShareLinkInvalidError extends FileHandlerError {
  constructor(message = "Share link is invalid, expired, or revoked") {
    super("share_link_invalid", message);
    this.name = "ShareLinkInvalidError";
  }
}

export class ExternalFetchError extends FileHandlerError {
  constructor(message = "Failed to fetch external URL", opts?: { cause?: unknown }) {
    super("external_fetch_failed", message, opts);
    this.name = "ExternalFetchError";
  }
}

export class FileUploadError extends FileHandlerError {
  constructor(message: string, opts?: { cause?: unknown }) {
    super("upload_failed", message, opts);
    this.name = "FileUploadError";
  }
}

/**
 * Distinguish "S3 said expired" from "we said access denied". S3 returns
 * a 403 with `<Code>Request has expired</Code>` in the XML body for an
 * aged-out signed URL; an actual permission failure on `/files/{id}/url`
 * comes back as a JSON `403 permission_denied` from our backend.
 */
export function isS3ExpiredError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; body?: string; message?: string };
  if (e.status !== 403) return false;
  const body = e.body ?? e.message ?? "";
  return /Request has expired|expired/i.test(body);
}
