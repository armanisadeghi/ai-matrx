// lib/api/errors.ts
// Centralized error handling for the Python FastAPI backend.
// Parses both HTTP error responses and streaming error events
// into a consistent BackendApiError shape.

import type { BackendApiErrorData, BackendErrorCode } from "./types";

// ============================================================================
// ERROR CLASS
// ============================================================================

/**
 * Typed error thrown by all backend API operations.
 * Contains structured fields matching the Python APIError model.
 *
 * Usage:
 * ```typescript
 * try {
 *   await client.post(ENDPOINTS.ai.agentStart(agentId), body);
 * } catch (err) {
 *   if (err instanceof BackendApiError) {
 *     // Show err.userMessage to the user
 *     // Log err.requestId for debugging
 *     // Check err.code for programmatic handling
 *   }
 * }
 * ```
 */
export class BackendApiError extends Error {
  /** Machine-readable error code */
  readonly code: BackendErrorCode;
  /** Developer-facing detail */
  readonly detail: string;
  /** Safe to display directly in the UI */
  readonly userMessage: string;
  /** Extra info (validation errors, etc.) */
  readonly details: unknown | null;
  /** Unique request ID for support/debugging */
  readonly requestId: string;
  /** HTTP status code (if from an HTTP response) */
  readonly status: number | null;

  constructor(data: {
    code: BackendErrorCode;
    detail: string;
    userMessage: string;
    details?: unknown | null;
    requestId?: string;
    status?: number | null;
  }) {
    super(data.userMessage);
    this.name = "BackendApiError";
    this.code = data.code;
    this.detail = data.detail;
    this.userMessage = data.userMessage;
    this.details = data.details ?? null;
    // MATRX-EXCEPTION: requestId is genuinely optional (constructor param);
    // "" means "no request id available" — a display/log field, not persisted.
    this.requestId = data.requestId ?? "";
    this.status = data.status ?? null;
  }

  /** Convert to the wire format for logging */
  toJSON(): BackendApiErrorData {
    return {
      error: this.code,
      message: this.detail,
      user_message: this.userMessage,
      details: this.details,
      request_id: this.requestId,
    };
  }
}

// ============================================================================
// HTTP ERROR PARSER
// ============================================================================

/**
 * Parse a non-OK HTTP response into a BackendApiError.
 *
 * Handles the standardized backend shape and falls back gracefully
 * when the response isn't JSON or uses a legacy format.
 */
export async function parseHttpError(
  response: Response,
): Promise<BackendApiError> {
  const status = response.status;
  let body: Record<string, unknown> | null = null;

  try {
    body = await response.json();
  } catch {
    // Not JSON — try plain text
    try {
      const text = await response.text();
      return new BackendApiError({
        code: statusToCode(status),
        detail: text || `HTTP ${status}`,
        userMessage: text || `Request failed (${status})`,
        status,
      });
    } catch {
      return new BackendApiError({
        code: statusToCode(status),
        detail: `HTTP ${status}`,
        userMessage: `Request failed (${status})`,
        status,
      });
    }
  }

  return parseHttpErrorBody(body, status);
}

/**
 * Parse an already-decoded JSON error body into a BackendApiError.
 *
 * Exported because XHR callers (upload/download progress paths) have the
 * parsed body in hand and MUST NOT hand-roll a shallower read: a private
 * copy in `python-client.ts` looked only at top-level `error`/`message`, so
 * FastAPI's `{"detail": {...}}` envelope — what every matrx-files 500 uses —
 * degraded to the useless `code: "internal", detail: "HTTP 500"`. That is
 * exactly how an upload failure with a real server-side cause reached the
 * user as `Upload failed (500)` and nothing else. One parser, every transport.
 */
export function parseHttpErrorBody(
  body: Record<string, unknown> | null,
  status: number,
): BackendApiError {
  if (!body) {
    return new BackendApiError({
      code: statusToCode(status),
      detail: `HTTP ${status}`,
      userMessage: `Request failed (${status})`,
      status,
    });
  }
  // Standard backend shape: { error, message, user_message, details, request_id }
  if (typeof body.error === "string" && typeof body.user_message === "string") {
    return new BackendApiError({
      code: body.error as BackendErrorCode,
      detail: (body.message as string) || `HTTP ${status}`,
      userMessage: body.user_message as string,
      details: body.details ?? null,
      requestId:
        typeof body.request_id === "string" ? body.request_id : undefined,
      status,
    });
  }

  // Legacy: nested error object with user_visible_message
  if (typeof body.error === "object" && body.error !== null) {
    const errorObj = body.error as Record<string, unknown>;
    return new BackendApiError({
      code:
        (errorObj.type as string) ||
        (errorObj.error as string) ||
        statusToCode(status),
      detail: (errorObj.message as string) || `HTTP ${status}`,
      userMessage:
        (errorObj.user_message as string) ||
        (errorObj.user_visible_message as string) ||
        (errorObj.message as string) ||
        `Request failed (${status})`,
      details: errorObj.details ?? null,
      requestId:
        typeof errorObj.request_id === "string"
          ? errorObj.request_id
          : undefined,
      status,
    });
  }

  // FastAPI 422 validation shape: { detail: [{ loc, msg, type }, ...] }
  if (Array.isArray(body.detail)) {
    const first = body.detail[0] as Record<string, unknown> | undefined;
    const firstMsg = first && typeof first.msg === "string" ? first.msg : null;
    return new BackendApiError({
      code: statusToCode(status),
      detail: firstMsg
        ? `Validation error: ${firstMsg}`
        : JSON.stringify(body.detail),
      userMessage: firstMsg || `Request failed (${status})`,
      details: body.detail,
      status,
    });
  }

  // FastAPI HTTPException with structured detail: { detail: { code?, error?, message?, user_message?, ... } }
  if (
    typeof body.detail === "object" &&
    body.detail !== null &&
    !Array.isArray(body.detail)
  ) {
    const d = body.detail as Record<string, unknown>;
    const code =
      (typeof d.code === "string" && d.code) ||
      (typeof d.error === "string" && d.error) ||
      statusToCode(status);
    const message =
      (typeof d.message === "string" && d.message) ||
      (typeof d.detail === "string" && d.detail) ||
      `HTTP ${status}`;
    return new BackendApiError({
      code: code as BackendErrorCode,
      detail: message,
      userMessage:
        (typeof d.user_message === "string" && d.user_message) ||
        (typeof d.user_visible_message === "string" &&
          d.user_visible_message) ||
        message,
      details: d.details ?? d,
      requestId: typeof d.request_id === "string" ? d.request_id : undefined,
      status,
    });
  }

  // Legacy: flat { error: string, message: string } or { detail: string }
  return new BackendApiError({
    code: typeof body.error === "string" ? body.error : statusToCode(status),
    detail:
      (body.message as string) ||
      (body.detail as string) ||
      (body.error as string) ||
      `HTTP ${status}`,
    userMessage:
      (body.user_message as string) ||
      (body.user_visible_message as string) ||
      (body.message as string) ||
      (body.detail as string) ||
      `Request failed (${status})`,
    details: body.details ?? null,
    requestId:
      typeof body.request_id === "string" ? body.request_id : undefined,
    status,
  });
}

/**
 * Adapt callApi's result-style error into the same canonical error used by
 * direct fetch and streaming consumers.
 *
 * callApi intentionally returns errors instead of throwing them, but its
 * `serverDetail` contains the complete FastAPI body. Sending only
 * `error.message` to a feature discards that body and turns a precise
 * configuration failure into "HTTP 422". This adapter keeps one parser and
 * one human-facing explanation path across both client styles.
 */
export function parseCallApiError(error: {
  message: string;
  status?: number;
  serverDetail?: unknown;
}): BackendApiError {
  const status = error.status ?? 500;
  const body =
    error.serverDetail &&
    typeof error.serverDetail === "object" &&
    !Array.isArray(error.serverDetail)
      ? (error.serverDetail as Record<string, unknown>)
      : { message: error.message };
  return parseHttpErrorBody(body, status);
}

// ============================================================================
// STREAMING ERROR PARSER
// ============================================================================

/**
 * Parse streaming error event data into a BackendApiError.
 *
 * Handles both new format (`user_message`) and legacy (`user_visible_message`).
 */
export function parseStreamError(data: unknown): BackendApiError {
  if (!data || typeof data !== "object") {
    return new BackendApiError({
      code: "internal_error",
      detail: typeof data === "string" ? data : "Unknown streaming error",
      userMessage: typeof data === "string" ? data : "Something went wrong",
    });
  }

  const obj = data as Record<string, unknown>;
  const details =
    typeof obj.details === "object" && obj.details !== null
      ? (obj.details as Record<string, unknown>)
      : null;
  return new BackendApiError({
    code:
      (obj.code as string) ||
      (obj.error_type as string) ||
      (obj.error as string) ||
      "internal_error",
    detail: (obj.message as string) || "Streaming error",
    userMessage:
      (obj.user_message as string) ||
      (obj.message as string) ||
      "Something went wrong",
    details,
    requestId:
      typeof obj.request_id === "string"
        ? obj.request_id
        : typeof details?.request_id === "string"
          ? details.request_id
          : undefined,
  });
}

/**
 * Restore the canonical error shape from a durable backend run row.
 *
 * Provider ledgers often keep an aggregate summary plus a more specific first
 * child failure. Prefer that child so a page refresh does not turn a precise
 * streamed failure back into "1 request failed".
 */
export function parsePersistedBackendError(
  data: unknown,
  requestId = "",
): BackendApiError | null {
  if (!data || typeof data !== "object") return null;
  const error = data as Record<string, unknown>;
  const failures = Array.isArray(error.failures) ? error.failures : [];
  const firstSpecific = failures.find(
    (failure): failure is Record<string, unknown> =>
      typeof failure === "object" &&
      failure !== null &&
      typeof (failure as Record<string, unknown>).message === "string",
  );
  const summary =
    typeof error.message === "string"
      ? error.message
      : "Backend operation failed";
  const specific =
    typeof firstSpecific?.message === "string"
      ? firstSpecific.message
      : summary;
  const detail = specific === summary ? summary : `${summary}: ${specific}`;
  const code = typeof error.type === "string" ? error.type : "internal_error";
  return new BackendApiError({
    code,
    detail,
    userMessage: detail,
    details: error,
    requestId,
  });
}

// ============================================================================
// FAILURE EXPLANATION — never let a templated non-answer be the whole story
// ============================================================================

/**
 * Server messages that carry ZERO diagnostic value. The streaming layer
 * (`matrx-connect/streaming/response.py`) emits the first one for every
 * unclassified crash — "CanonicalGscSync failed unexpectedly. Please try
 * again or adjust your settings." — while the REAL cause travels in the same
 * payload's `message`. Treating those as the answer is what makes failures
 * feel secretive.
 */
const GENERIC_MESSAGE_PATTERNS: readonly RegExp[] = [
  /failed unexpectedly/i,
  /^\s*something went wrong/i,
  /please try again(\s+later)?\.?\s*$/i,
  /^\s*request failed\b/i,
  /^\s*unknown (streaming )?error/i,
  /^\s*internal server error\.?\s*$/i,
];

/** True when a message tells the reader nothing about what actually broke. */
export function isGenericUserMessage(
  message: string | null | undefined,
): boolean {
  const value = (message ?? "").trim();
  if (!value) return true;
  return GENERIC_MESSAGE_PATTERNS.some((pattern) => pattern.test(value));
}

export interface UpstreamErrorPayload {
  message: string;
  code: string | null;
  userMessage: string | null;
  requestId: string | null;
  status: number | null;
}

/**
 * Recover an upstream service's structured error that a downstream service
 * stringified into its own message.
 *
 * Real example (scraper wrapping aidream):
 *   `aidream could not resolve GSC credential 7223…: HTTP 409 {"error":"conflict",
 *    "message":"Google connection 7223… has no vault credential — it needs
 *    re-authentication","user_message":"Something went wrong…","request_id":"9002…"}`
 *
 * Without this, the only actionable sentence on the whole hop is invisible.
 */
export function unwrapUpstreamError(
  message: string,
): UpstreamErrorPayload | null {
  const start = message.indexOf("{");
  const end = message.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(message.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const body = parsed as Record<string, unknown>;
  const inner =
    (typeof body.message === "string" && body.message) ||
    (typeof body.detail === "string" && body.detail) ||
    "";
  if (!inner) return null;
  const statusMatch = /\bHTTP (\d{3})\b/.exec(message.slice(0, start));
  return {
    message: inner,
    code:
      (typeof body.error_type === "string" && body.error_type) ||
      (typeof body.error === "string" && body.error) ||
      null,
    userMessage:
      typeof body.user_message === "string" ? body.user_message : null,
    requestId: typeof body.request_id === "string" ? body.request_id : null,
    status: statusMatch ? Number(statusMatch[1]) : null,
  };
}

export interface BackendFailureExplanation {
  /** Machine code from the deepest layer that classified the failure. */
  code: string;
  /** The most specific human-readable cause available — never a template. */
  cause: string;
  /** What to headline in the UI: the cause when the server was generic. */
  headline: string;
  /** True when every user-facing message the server sent was a template. */
  headlineWasGeneric: boolean;
  /** Message chain, outermost (closest service) first. */
  chain: string[];
  /** Deepest request id available, for cross-service log correlation. */
  requestId: string;
  status: number | null;
}

/**
 * THE anti-secrecy primitive: turn any thrown backend/stream failure into the
 * most specific explanation the payload can support — unwrapping every nested
 * upstream error and refusing to let a templated `user_message` be the answer.
 *
 * Every surface that reports a backend failure to a human should headline
 * `explanation.headline` and always keep `cause` + `requestId` reachable.
 */
export function describeBackendFailure(
  error: unknown,
): BackendFailureExplanation {
  const chain: string[] = [];
  let code = "internal_error";
  let requestId = "";
  let status: number | null = null;
  let userFacing: string | null = null;

  if (error instanceof BackendApiError) {
    code = error.code;
    requestId = error.requestId;
    status = error.status;
    userFacing = error.userMessage;
    if (error.detail) chain.push(error.detail);
    if (error.userMessage && error.userMessage !== error.detail) {
      chain.push(error.userMessage);
    }
  } else if (error instanceof Error) {
    chain.push(error.message);
    userFacing = error.message;
  } else if (typeof error === "string") {
    chain.push(error);
    userFacing = error;
  } else {
    chain.push("Unknown error");
  }

  // Walk the nesting: ANY message in the chain may have stringified the
  // service above it (the technical `detail` usually does, the templated
  // `user_message` never does), so every layer gets unwrapped.
  for (let cursor = 0; cursor < chain.length && cursor < 12; cursor += 1) {
    const upstream = unwrapUpstreamError(chain[cursor]);
    if (!upstream || chain.includes(upstream.message)) continue;
    chain.push(upstream.message);
    if (upstream.code) code = upstream.code;
    if (upstream.requestId) requestId = upstream.requestId;
    if (upstream.status !== null) status = upstream.status;
  }

  const specific = [...chain]
    .reverse()
    .find((message) => !isGenericUserMessage(message));
  const cause = specific ?? chain[0] ?? "Unknown error";
  const headlineWasGeneric = isGenericUserMessage(userFacing);
  return {
    code,
    cause,
    headline: headlineWasGeneric ? cause : (userFacing ?? cause),
    headlineWasGeneric,
    chain,
    requestId,
    status,
  };
}

/**
 * Extract a user-visible message from any error object.
 * Utility for components that just need the display string.
 */
export function getUserMessage(error: unknown): string {
  if (error instanceof BackendApiError) {
    return error.userMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Something went wrong";
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function statusToCode(status: number): BackendErrorCode {
  switch (status) {
    case 401:
      return "auth_required";
    case 403:
      return "admin_required";
    case 404:
      return "not_found";
    case 422:
      return "validation_error";
    default:
      return "internal_error";
  }
}
