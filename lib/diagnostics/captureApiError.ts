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
    captureError({
      source: isNetwork ? "api-network" : "api-http",
      // The endpoint is the most useful "what broke" label in the list.
      relation: `${ctx.method.toUpperCase()} ${ctx.path}`,
      code: error.type,
      message: error.message || `Backend request failed (${error.type})`,
      status: error.status,
      // AbortError → name lets the seed downgrade rule silence cancellations.
      name: error.type === "abort_error" ? "AbortError" : undefined,
      raw: {
        type: error.type,
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
