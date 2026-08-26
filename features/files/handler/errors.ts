/**
 * features/files/handler/errors.ts
 *
 * Error taxonomy for the universal file handler. Every failure inside the
 * handler maps to ONE of these classes — callers `instanceof`-check to
 * decide whether to retry, refresh, surface a UI, or reject.
 *
 * The crucial distinction the handler exists to enforce:
 *
 *   - FileAccessDeniedError → user does NOT have access. Reject. Never retry.
 *   - a transient auth failure on a durable URL → refresh the file session
 *     (see ../session.ts) and retry the SAME URL; never a terminal error.
 */

export type FileHandlerErrorCode =
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

export class FileAccessDeniedError extends FileHandlerError {
  constructor(
    // Thrown ONLY on a real 403 from our own file server (resolver.ts) —
    // a proven refusal, not a guess. The sentence
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
