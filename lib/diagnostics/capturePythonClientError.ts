/**
 * capturePythonClientError.ts
 *
 * Adapter that feeds `lib/python-client.ts` failures into the systemwide
 * `errorCaptureStore`. `call-api.ts` already captures via `captureApiError`;
 * RAG, cloud-files, PDF, and most REST surfaces use python-client directly —
 * without this chokepoint those failures vanish into per-hook React state.
 */

import type { ApiCallError } from "@/lib/api/call-api";
import { BackendApiError } from "@/lib/api/errors";
import { captureApiError } from "@/lib/diagnostics/captureApiError";

interface PythonClientErrorContext {
  /** Fully-resolved request URL. */
  url: string;
  /** HTTP method. */
  method: string;
  /** Endpoint path without query string (e.g. "/rag/library"). */
  path: string;
}

/** Strip query params so list polling dedupes on the route, not the offset. */
export function relationPathFromUrl(path: string): string {
  const q = path.indexOf("?");
  return q === -1 ? path : path.slice(0, q);
}

/**
 * Map a python-client failure into the capture store. Reuses `captureApiError`
 * so downgrade rules and persistence behave identically to call-api failures.
 */
export function capturePythonClientError(
  err: unknown,
  ctx: PythonClientErrorContext,
): void {
  try {
    captureApiError(normalizePythonClientError(err), ctx);
  } catch {
    /* capture must never break the API caller */
  }
}

function normalizePythonClientError(err: unknown): ApiCallError {
  if (err instanceof BackendApiError) {
    const status = err.status ?? undefined;
    const isTimeoutOrAuthLock =
      err.code === "request_timeout" || err.code === "auth_check_timeout";
    const isNetwork =
      status === undefined || isTimeoutOrAuthLock || status === 504;

    if (isNetwork) {
      return {
        type: "network_error",
        message: err.detail || err.message,
        status,
        serverDetail: err.toJSON(),
      };
    }

    return {
      type: status >= 400 && status < 500 ? "validation_error" : "http_error",
      message: err.detail || err.message,
      status,
      serverDetail: err.toJSON(),
    };
  }

  if (err instanceof DOMException && err.name === "AbortError") {
    return { type: "abort_error", message: err.message || "Request aborted" };
  }

  if (err instanceof Error) {
    return { type: "network_error", message: err.message };
  }

  return { type: "unknown", message: String(err) };
}
