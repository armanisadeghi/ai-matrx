import { extractErrorMessage } from "@/utils/errors";

/**
 * Structured errors for the resilience layer.
 *
 * Every network-layer failure resolves to one of these classes so callers
 * (and the recovery UI) can branch on error type, not on string matching.
 */

export type NetErrorCode =
  | "connect-timeout"
  | "total-timeout"
  | "heartbeat-timeout"
  | "network"
  | "http"
  | "aborted"
  | "offline"
  | "unknown";

export class NetError extends Error {
  readonly code: NetErrorCode;
  override readonly cause?: unknown;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    code: NetErrorCode,
    message: string,
    opts: { cause?: unknown; status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "NetError";
    this.code = code;
    this.cause = opts.cause;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
  }
}

export class ConnectTimeoutError extends NetError {
  constructor(ms: number, cause?: unknown) {
    super("connect-timeout", `Connection timed out after ${ms}ms`, {
      cause,
      retryable: true,
    });
    this.name = "ConnectTimeoutError";
  }
}

export class TotalTimeoutError extends NetError {
  constructor(ms: number, cause?: unknown) {
    super("total-timeout", `Request exceeded ${ms}ms total budget`, {
      cause,
      retryable: false,
    });
    this.name = "TotalTimeoutError";
  }
}

export class HeartbeatTimeoutError extends NetError {
  constructor(ms: number, cause?: unknown) {
    super(
      "heartbeat-timeout",
      `No server activity for ${ms}ms — stream considered dead`,
      { cause, retryable: false },
    );
    this.name = "HeartbeatTimeoutError";
  }
}

export class NetworkError extends NetError {
  constructor(message: string, cause?: unknown) {
    super("network", message, { cause, retryable: true });
    this.name = "NetworkError";
  }
}

export class HttpError extends NetError {
  constructor(status: number, message: string, cause?: unknown) {
    // 408/429/5xx are generally safe to retry for idempotent ops.
    const retryable = status === 408 || status === 429 || status >= 500;
    super("http", message, { cause, status, retryable });
    this.name = "HttpError";
  }
}

export class AbortedError extends NetError {
  constructor(cause?: unknown) {
    super("aborted", "Request was aborted", { cause, retryable: false });
    this.name = "AbortedError";
  }
}

export class OfflineError extends NetError {
  constructor() {
    super("offline", "Browser is offline", { retryable: true });
    this.name = "OfflineError";
  }
}

export function isNetError(err: unknown): err is NetError {
  return err instanceof NetError;
}

export function toNetError(err: unknown): NetError {
  if (isNetError(err)) return err;
  if (err instanceof DOMException && err.name === "AbortError") {
    return new AbortedError(err);
  }
  if (err instanceof TypeError) {
    // fetch() throws TypeError on DNS/connection failure in every browser.
    return new NetworkError(err.message || "Network request failed", err);
  }
  return new NetError(
    "unknown",
    extractErrorMessage(err),
    { cause: err },
  );
}
