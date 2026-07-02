/**
 * captureStreamError.ts
 *
 * Feeds the SERVER's own typed error/warning/failure events — the central
 * artery of the platform — into the systemwide Error Inspector. Until this
 * adapter existed, the inspector was a victim of generic browser noise while
 * the server was sending us perfectly structured, typed errors that we threw
 * away (dispatched to Redux for the chat UI, never captured for diagnostics).
 *
 * `captureStreamEvent` is the universal classifier: it inspects one
 * `TypedStreamEvent` and, if it represents an error/warning/failure, records it
 * with a server-origin `source` so an admin always knows it came from the
 * backend — `error_type`, `code`, `user_message`, and the full payload intact.
 *
 * Wired at the ONE chokepoint every stream consumer pulls events through:
 * `parseNdjsonStream` (lib/api/stream-parser.ts). Client-side stream death
 * (heartbeat loss, timeout) doesn't arrive as an event, so `run-ai-stream.ts`
 * calls `captureStreamClientError` from its catch. Transport-level parser
 * failures call `captureStreamTransportError`.
 *
 * Capture is never fatal — every path is try/caught and never breaks the stream.
 */

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  isErrorEvent,
  isWarningEvent,
  isToolEventEvent,
  isProviderRetryEvent,
  isRecordUpdateEvent,
  isTypedDataEvent,
  type TypedStreamEvent,
} from "@/types/python-generated/stream-events";
import type { BackendApiError } from "@/lib/api/errors";
import { isJsonObject } from "@/types/json";

export interface StreamErrorContext {
  requestId?: string | null;
  conversationId?: string | null;
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Classify ONE stream event and capture it if it represents an error, warning,
 * or failure. Safe to call on every event — non-error events are ignored.
 */
export function captureStreamEvent(
  event: TypedStreamEvent,
  ctx: StreamErrorContext = {},
): void {
  try {
    const base = {
      requestId: ctx.requestId ?? undefined,
      conversationId: ctx.conversationId ?? undefined,
    };

    // ── Fatal stream error (ErrorPayload) — the headline case ──────────────
    if (isErrorEvent(event)) {
      const d = event.data;
      captureError({
        source: "agent-stream-error",
        relation: d.error_type,
        code: d.error_type,
        message: d.message || "Agent stream error",
        userMessage: d.user_message ?? undefined,
        details: str(d.details),
        ...base,
        raw: d,
      });
      return;
    }

    // ── Warning (WarningPayload) — captured; downgrade noisy codes by rule ──
    if (isWarningEvent(event)) {
      const d = event.data;
      captureError({
        source: "agent-stream-warning",
        relation: d.code,
        code: d.code,
        message: d.system_message || "Agent stream warning",
        userMessage: d.user_message ?? undefined,
        details: str({ level: d.level, recoverable: d.recoverable }),
        ...base,
        raw: d,
      });
      return;
    }

    // ── Tool error (tool_event / tool_error) ───────────────────────────────
    if (isToolEventEvent(event) && event.data.event === "tool_error") {
      const d = event.data;
      const errData = isJsonObject(d.data) ? d.data : {};
      const errType = typeof errData.error_type === "string" ? errData.error_type : undefined;
      const errDetail = typeof errData.detail === "string" ? errData.detail : undefined;
      captureError({
        source: "agent-stream-tool-error",
        relation: `tool:${d.tool_name}`,
        code: errType ?? "tool_error",
        message: d.message || errDetail || `Tool "${d.tool_name}" failed`,
        details: errDetail,
        ...base,
        raw: d,
      });
      return;
    }

    // ── Provider retry — only terminal/paused states are problems ──────────
    if (isProviderRetryEvent(event)) {
      const d = event.data;
      if (d.state === "cancelled" || d.state === "suspended") {
        captureError({
          source: "agent-stream-provider-retry",
          relation: `provider:${d.provider}`,
          code: d.error_type,
          message:
            d.message ||
            `Provider ${d.provider} ${d.state} after ${d.failed_attempt}/${d.max_retries}`,
          userMessage: d.user_message ?? undefined,
          status: d.status_code ?? undefined,
          details: str({
            provider: d.provider,
            model: d.model,
            state: d.state,
            attempt: `${d.failed_attempt}/${d.max_retries}`,
          }),
          ...base,
          raw: d,
        });
      }
      return;
    }

    // ── Record persistence failure (a reservation never committed) ─────────
    if (isRecordUpdateEvent(event) && event.data.status === "failed") {
      const d = event.data;
      const recErr = isJsonObject(d.metadata?.error) ? d.metadata.error : {};
      const recErrType = typeof recErr.type === "string" ? recErr.type : undefined;
      const recErrMessage = typeof recErr.message === "string" ? recErr.message : undefined;
      captureError({
        source: "agent-stream-record-failed",
        relation: d.table,
        code: recErrType ?? "record_failed",
        message:
          recErrMessage || `Failed to persist ${d.table} (${d.record_id})`,
        details: str({ table: d.table, record_id: d.record_id }),
        ...base,
        raw: d,
      });
      return;
    }

    // ── Data events that carry an error (search/memory/context/function) ───
    if (isTypedDataEvent(event)) {
      // `event.data` is a large discriminated union (TypedDataPayload) plus an
      // open-ended fallback (UntypedDataPayload); the fields checked below
      // (`error`/`success`/`traceback`) only exist on some variants, so this
      // reads it duck-typed via a JsonObject narrow rather than one variant.
      const d = isJsonObject(event.data) ? event.data : {};
      const type = typeof d.type === "string" ? d.type : "";
      const errText =
        typeof d.error === "string" && d.error ? d.error : undefined;
      const failed = d.success === false;
      const isErrorData =
        type === "search_error" ||
        type === "memory_error" ||
        type === "context_persist_failed" ||
        (failed && (type === "function_result" || type === "podcast_stage" || type === "podcast_complete")) ||
        (errText !== undefined && type !== "");
      if (isErrorData) {
        captureError({
          source: "agent-stream-data-error",
          relation: type || "data",
          code: type || "data_error",
          message: errText || `Stream data error (${type})`,
          details: str(d.traceback) ?? undefined,
          ...base,
          raw: d,
        });
      }
      return;
    }
  } catch {
    /* capture must never break the stream */
  }
}

/**
 * Capture a transport-level stream failure (the NDJSON parser threw a
 * BackendApiError — no body, network drop, etc.).
 */
export function captureStreamTransportError(
  err: BackendApiError,
  ctx: StreamErrorContext = {},
): void {
  try {
    captureError({
      source: "agent-stream-transport",
      code: err.code,
      message: err.detail || err.message || "Stream transport error",
      userMessage: err.userMessage ?? undefined,
      status: err.status ?? undefined,
      requestId: err.requestId ?? ctx.requestId ?? undefined,
      conversationId: ctx.conversationId ?? undefined,
      details: str(err.details),
      raw: err,
    });
  } catch {
    /* never break the stream */
  }
}

export interface StreamClientErrorInput {
  errorType: string;
  message: string;
  userMessage?: string;
  name?: string;
  /** "turn" | "resume" — which stream path died. */
  kind?: string;
  conversationId?: string;
  requestId?: string;
}

/**
 * Capture a client-side stream death (heartbeat loss, total-timeout, fetch
 * failure) — these don't arrive as a stream event, so `run-ai-stream`'s catch
 * synthesizes the shape and calls this.
 */
export function captureStreamClientError(input: StreamClientErrorInput): void {
  try {
    captureError({
      source: "agent-stream-client-error",
      relation: input.kind ? `stream:${input.kind}` : "stream",
      code: input.errorType,
      message: input.message || "Stream connection failed",
      userMessage: input.userMessage,
      name: input.name,
      conversationId: input.conversationId,
      requestId: input.requestId,
      raw: input,
    });
  } catch {
    /* never break error handling */
  }
}
