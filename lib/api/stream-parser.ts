// lib/api/stream-parser.ts
// Reusable NDJSON stream parser for the Python FastAPI backend.
// Single implementation — all consumers use this instead of inline parsing.

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
  isBrokerEvent,
  isHeartbeatEvent,
  isEndEvent,
  isRenderBlockEvent,
  isRecordReservedEvent,
  isRecordUpdateEvent,
} from "./types";
import { readMatrxNdjsonStream } from "@matrx/agents/stream/ndjson";
import { BackendApiError } from "./errors";
import {
  captureStreamEvent,
  captureStreamTransportError,
} from "@/lib/diagnostics/captureStreamError";

// ============================================================================
// NDJSON STREAM PARSER
// ============================================================================

/**
 * Parse an NDJSON streaming response into typed events.
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
  const requestId = response.headers.get("X-Request-ID");
  const conversationId = response.headers.get("X-Conversation-ID");
  return {
    events: _parseNdjsonStream(response, signal, { requestId, conversationId }),
    requestId,
    conversationId,
  };
}

async function* _parseNdjsonStream(
  response: Response,
  signal?: AbortSignal,
  ctx?: { requestId: string | null; conversationId: string | null },
): AsyncGenerator<TypedStreamEvent, void, undefined> {
  if (!response.body) {
    throw new BackendApiError({
      code: "internal_error",
      detail: "Response has no body",
      userMessage: "No response received from server",
    });
  }

  try {
    for await (const envelope of readMatrxNdjsonStream(response.body, {
      ...(signal ? { signal } : {}),
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
    })) {
      const item = envelope as TypedStreamEvent;
      // Universal stream-error capture: every consumer (agent processStream,
      // consumeStream, podcast, research) pulls events through here, so this
      // single call feeds the Inspector with every server-emitted typed error
      // / warning / failure. Non-error events are ignored inside the adapter.
      captureStreamEvent(item, ctx ?? {});

      yield item;
    }
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return;
    }
    const transportError =
      error instanceof BackendApiError
        ? error
        : new BackendApiError({
            code: "internal_error",
            detail:
              error instanceof Error
                ? error.message
                : "The response stream ended unexpectedly.",
            userMessage: "The connection to the AI response was lost.",
            details: error,
            requestId: ctx?.requestId ?? undefined,
          });
    captureStreamTransportError(transportError, ctx ?? {});
    throw transportError;
  }
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
  onBroker?: (data: unknown) => void;
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
    } else if (isBrokerEvent(event)) {
      callbacks.onBroker?.(event.data);
    }
  }

  return { requestId, conversationId, accumulatedText };
}
