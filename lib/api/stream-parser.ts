// lib/api/stream-parser.ts
// Reusable NDJSON stream parser for the Python FastAPI backend.
// The parser is the shared core in `@ai-matrx/agents/matrx`; this module wires
// the app diagnostics and adds the typed callback consumer.

import type {
  TypedStreamEvent,
  ChunkPayload,
  ReasoningChunkPayload,
  ReasoningPayload,
  PhasePayload,
  InitPayload,
  CompletionPayload,
  ErrorPayload,
  ToolEventPayload,
  WarningPayload,
  InfoPayload,
  HeartbeatPayload,
  EndPayload,
  RenderBlockPayload,
  RecordReservedPayload,
  RecordUpdatePayload,
  TypedDataPayload,
} from "./types";
import {
  isChunkEvent,
  isReasoningChunkEvent,
  isReasoningEvent,
  isPhaseEvent,
  isInitEvent,
  isTypedDataEvent,
  isCompletionEvent,
  isErrorEvent,
  isToolEventEvent,
  isWarningEvent,
  isInfoEvent,
  isHeartbeatEvent,
  isEndEvent,
  isRenderBlockEvent,
  isRecordReservedEvent,
  isRecordUpdateEvent,
} from "./types";
import { parseMatrxNdjsonResponse } from "@ai-matrx/agents/matrx";
import {
  captureStreamEvent,
  captureStreamTransportError,
} from "@/lib/diagnostics/captureStreamError";

// ============================================================================
// NDJSON STREAM PARSER
// ============================================================================

/**
 * Parse an NDJSON streaming response into typed events — the shared core's
 * `parseMatrxNdjsonResponse` (`@ai-matrx/agents/matrx`, P9b), wired to this
 * app's diagnostics: every event feeds the Error Inspector's stream capture,
 * and a broken body (a resumable `StreamTransportError`, never a failed run)
 * is captured once before it is thrown.
 *
 * Returns the `X-Request-ID` header value (if present) alongside the generator,
 * so callers can use it for cancellation.
 *
 * Usage:
 * ```typescript
 * const response = await fetch(url, { ... });
 * const { events, requestId } = parseNdjsonStream(response);
 * for await (const event of events) {
 *   if (event.event === 'chunk') appendToMessage(event.data.text);
 * }
 * ```
 */
export function parseNdjsonStream(
  response: Response,
  signal?: AbortSignal,
): {
  events: AsyncGenerator<TypedStreamEvent, void, undefined>;
  requestId: string | null;
  conversationId: string | null;
} {
  const parsed = parseMatrxNdjsonResponse(response, signal, {
    onMalformedLine: ({ line, error }) => {
      console.warn(
        "[stream-parser] Failed to parse NDJSON line:",
        line.slice(0, 500),
        error,
      );
    },
    onUnknownEnvelope: (value) => {
      console.warn("[stream-parser] Unknown NDJSON event envelope:", value);
    },
    onEvent: (event, ids) => captureStreamEvent(event as TypedStreamEvent, ids),
    onTransportError: (error, ids) => captureStreamTransportError(error, ids),
  });
  return {
    events: parsed.events as AsyncGenerator<TypedStreamEvent, void, undefined>,
    requestId: parsed.requestId,
    conversationId: parsed.conversationId,
  };
}

// ============================================================================
// STREAM EVENT HELPERS
// ============================================================================

/** Extract accumulated text from chunk events */
export function accumulateChunks(events: TypedStreamEvent[]): string {
  let text = "";
  for (const event of events) {
    if (isChunkEvent(event)) {
      text += event.data.text;
    }
  }
  return text;
}

/** Extract the first error from stream events, if any */
export function findStreamError(
  events: TypedStreamEvent[],
): ErrorPayload | null {
  for (const event of events) {
    if (isErrorEvent(event)) {
      return event.data;
    }
  }
  return null;
}

// ============================================================================
// CALLBACK-BASED STREAM CONSUMER
// ============================================================================

/**
 * V2 Stream event handler callbacks.
 *
 * Every V2 event type has its own typed callback. Any feature can use this
 * by passing only the callbacks it cares about — all others are silently
 * skipped. This is the universal interface that all non-Redux stream
 * consumers should adopt.
 */
export interface StreamCallbacks {
  onEvent?: (event: TypedStreamEvent) => void;
  onChunk?: (data: ChunkPayload) => void;
  onReasoningChunk?: (data: ReasoningChunkPayload) => void;
  /** Reasoning STATUS (started/stopped) — the server brackets the thinking
   *  phase for models with no reasoning tokens, so a consumer can show
   *  "Reasoning…" instead of a generic loading label. Distinct from
   *  `onReasoningChunk` (actual reasoning tokens). */
  onReasoning?: (data: ReasoningPayload) => void;
  onPhase?: (data: PhasePayload) => void;
  onInit?: (data: InitPayload) => void;
  onCompletion?: (data: CompletionPayload) => void;
  onData?: (data: TypedDataPayload | Record<string, unknown>) => void;
  onToolEvent?: (data: ToolEventPayload) => void;
  onWarning?: (data: WarningPayload) => void;
  onInfo?: (data: InfoPayload) => void;
  onError?: (data: ErrorPayload) => void;
  onRenderBlock?: (data: RenderBlockPayload) => void;
  onRecordReserved?: (data: RecordReservedPayload) => void;
  onRecordUpdate?: (data: RecordUpdatePayload) => void;
  onHeartbeat?: (data: HeartbeatPayload) => void;
  onEnd?: (data: EndPayload) => void;
}

/**
 * Consume a streaming response with typed V2 callbacks.
 *
 * This is the universal stream consumer for non-Redux code paths.
 * Features like the scraper, tool testing, and admin hooks should
 * use this instead of writing their own for-await/switch loops.
 *
 * Returns headers extracted from the response (requestId, conversationId)
 * and accumulated text for convenience.
 */
export async function consumeStream(
  response: Response,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<{
  requestId: string | null;
  conversationId: string | null;
  accumulatedText: string;
}> {
  const { events, requestId, conversationId } = parseNdjsonStream(
    response,
    signal,
  );

  let accumulatedText = "";

  for await (const event of events) {
    callbacks.onEvent?.(event);

    if (isChunkEvent(event)) {
      accumulatedText += event.data.text;
      callbacks.onChunk?.(event.data);
    } else if (isReasoningChunkEvent(event)) {
      callbacks.onReasoningChunk?.(event.data);
    } else if (isReasoningEvent(event)) {
      callbacks.onReasoning?.(event.data);
    } else if (isPhaseEvent(event)) {
      callbacks.onPhase?.(event.data);
    } else if (isInitEvent(event)) {
      callbacks.onInit?.(event.data);
    } else if (isCompletionEvent(event)) {
      callbacks.onCompletion?.(event.data);
    } else if (isTypedDataEvent(event)) {
      callbacks.onData?.(event.data);
    } else if (isToolEventEvent(event)) {
      callbacks.onToolEvent?.(event.data);
    } else if (isWarningEvent(event)) {
      callbacks.onWarning?.(event.data);
    } else if (isInfoEvent(event)) {
      callbacks.onInfo?.(event.data);
    } else if (isErrorEvent(event)) {
      callbacks.onError?.(event.data);
    } else if (isRenderBlockEvent(event)) {
      callbacks.onRenderBlock?.(event.data);
    } else if (isRecordReservedEvent(event)) {
      callbacks.onRecordReserved?.(event.data);
    } else if (isRecordUpdateEvent(event)) {
      callbacks.onRecordUpdate?.(event.data);
    } else if (isHeartbeatEvent(event)) {
      callbacks.onHeartbeat?.(event.data);
    } else if (isEndEvent(event)) {
      callbacks.onEnd?.(event.data);
    }
  }

  return { requestId, conversationId, accumulatedText };
}
