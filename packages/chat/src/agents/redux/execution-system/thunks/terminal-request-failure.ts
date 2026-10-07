/**
 * A request that ENDED FAILED without an `error` event.
 *
 * The server has three ways to say a user request failed, and only one of
 * them is the `error` event: a terminal failure it persisted on purpose (a
 * provider safety / recitation stop, a model refusal, any finish-reason
 * failure) is announced as a `user_request` completion with
 * `status: "failed"` and/or a `record_update` moving the `user_request` row
 * to `failed`, then a normal `end`. Before this module the stream treated
 * both as bookkeeping, the `end` handler marked the request `complete`, and
 * the turn showed NO error — while its half-written content (a flashcard set
 * cut off by a recitation stop, 2026-10-06) sat there looking finished.
 *
 * Pure: reads the event payload, returns the `ErrorPayload` the request
 * should carry, or null when the event is not a terminal failure. It never
 * matches on the message TEXT (the server is free to reword it) — only on
 * the operation/table, the status, and the structured fields.
 */

import type {
  CompletionPayload,
  ErrorPayload,
  RecordUpdatePayload,
} from "@ai-matrx/agents/generated/stream-events";

/** error_type when the server sent no structured one. */
export const TERMINAL_FAILURE_ERROR_TYPE = "request_failed";

/** Shown when the server said "failed" and nothing more. */
export const TERMINAL_FAILURE_FALLBACK_MESSAGE =
  "The response stopped before it finished.";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The row's `error` arrives as an object, a JSON string, or plain text. */
function readStructuredError(raw: unknown): {
  errorType: string | null;
  message: string | null;
} {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      try {
        return readStructuredError(JSON.parse(trimmed));
      } catch {
        // Not JSON after all — it is the message itself.
      }
    }
    return { errorType: null, message: trimmed || null };
  }
  const obj = asRecord(raw);
  if (!obj) return { errorType: null, message: null };
  const errorType =
    typeof obj.error_type === "string"
      ? obj.error_type
      : typeof obj.type === "string"
        ? obj.type
        : null;
  const message =
    typeof obj.user_message === "string" && obj.user_message
      ? obj.user_message
      : typeof obj.message === "string" && obj.message
        ? obj.message
        : null;
  return { errorType, message };
}

function buildPayload(
  source: "completion" | "record_update",
  fields: Record<string, unknown> | null,
  finishReason: string | null,
): ErrorPayload {
  const structured = readStructuredError(fields?.error);
  const errorType =
    structured.errorType ??
    (typeof fields?.error_type === "string" ? fields.error_type : null) ??
    TERMINAL_FAILURE_ERROR_TYPE;
  const message = structured.message ?? TERMINAL_FAILURE_FALLBACK_MESSAGE;
  return {
    error_type: errorType,
    message,
    user_message: message,
    details: {
      source,
      ...(finishReason ? { finish_reason: finishReason } : {}),
      ...(typeof fields?.reason === "string" ? { reason: fields.reason } : {}),
    },
  };
}

/** A `user_request` completion whose status is not success. */
export function terminalFailureFromCompletion(
  d: CompletionPayload,
): ErrorPayload | null {
  if (d.operation !== "user_request" || d.status !== "failed") return null;
  const result = asRecord(d.result);
  const metadata = asRecord(result?.metadata);
  const finishReason =
    typeof result?.finish_reason === "string" ? result.finish_reason : null;
  return buildPayload("completion", metadata ?? result, finishReason);
}

/** A `record_update` moving the `user_request` row to `failed`. */
export function terminalFailureFromRecordUpdate(
  d: RecordUpdatePayload,
): ErrorPayload | null {
  if (d.table !== "user_request" || d.status !== "failed") return null;
  const metadata = asRecord(d.metadata);
  const finishReason =
    typeof metadata?.finish_reason === "string" ? metadata.finish_reason : null;
  return buildPayload("record_update", metadata, finishReason);
}
