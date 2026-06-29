/**
 * captureApiError.ts
 *
 * Adapter that feeds Python-backend (`callApi`) failures into the systemwide
 * `errorCaptureStore`. Called from the single error chokepoint in
 * `lib/api/call-api.ts` so every backend non-2xx / network failure is visible
 * in the Error Inspector — these previously vanished into per-call state.
 *
 * Kept in lib/diagnostics (not inside call-api.ts) so the API layer stays lean
 * and free of UI/store concerns beyond this one import.
 */

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { ApiCallError } from "@/lib/api/call-api";

interface ApiErrorContext {
  /** Fully-resolved request URL. */
  url: string;
  /** HTTP method. */
  method: string;
  /** Endpoint path (e.g. "/ai/agents/{id}"). */
  path: string;
}

/**
 * Map an `ApiCallError` into the capture store. The error `type` decides the
 * source (network vs http) so downgrade rules can target each class; the tier
 * itself is assigned by `classifyTier` (everything red until tuned).
 */
export function captureApiError(
  error: ApiCallError,
  ctx: ApiErrorContext,
): void {
  try {
    const isNetwork =
      error.type === "network_error" ||
      error.type === "abort_error" ||
      error.type === "auth_error";

    // The backend's own structured error body is the high-value part — pull the
    // typed fields out instead of burying everything in `raw`. Supports both
    // the `{ error, message, user_message, details, request_id }` envelope and
    // FastAPI's `{ detail: ValidationError[] }` validation shape.
    const sd = (error.serverDetail ?? {}) as Record<string, unknown>;
    const backendType =
      typeof sd.error_type === "string"
        ? sd.error_type
        : typeof sd.error === "string"
          ? sd.error
          : undefined;
    const backendCode = typeof sd.code === "string" ? sd.code : undefined;
    const userMessage =
      typeof sd.user_message === "string" ? sd.user_message : undefined;
    const requestId =
      typeof sd.request_id === "string" ? sd.request_id : undefined;
    const structuredDetail = sd.details ?? sd.detail;

    captureError({
      source: isNetwork ? "api-network" : "api-http",
      // The endpoint is the most useful "what broke" label in the list.
      relation: `${ctx.method.toUpperCase()} ${ctx.path}`,
      // Prefer the backend's machine code (e.g. "agent_timeout") over our
      // coarse normalized class ("http_error").
      code: backendType ?? backendCode ?? error.type,
      message: error.message || `Backend request failed (${error.type})`,
      status: error.status,
      userMessage,
      requestId,
      details:
        structuredDetail !== undefined
          ? safeStringify(structuredDetail)
          : undefined,
      // AbortError → name lets the seed downgrade rule silence cancellations.
      name: error.type === "abort_error" ? "AbortError" : undefined,
      raw: {
        type: error.type,
        backendErrorType: backendType,
        backendCode,
        status: error.status,
        url: ctx.url,
        method: ctx.method,
        path: ctx.path,
        serverDetail: error.serverDetail,
      },
    });
  } catch {
    /* capture must never break the API caller */
  }
}

function safeStringify(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
